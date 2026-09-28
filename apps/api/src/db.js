// One Postgres pool for the whole api, and the migration runner.
// Plain SQL files in db/migrations, applied in filename order, each in its own transaction.

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.join(import.meta.dirname, '..', 'db', 'migrations');
const DEFAULT_URL = 'postgres://es:es@localhost:5432/expert_sessions'; // matches docker-compose.yml

let pool;

// Created on first use so tests can import modules that import this one without a database.
function getPool() {
  if (pool) return pool;
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || DEFAULT_URL });
  // An idle connection dropping (Postgres restarted) must not crash the process; the next query reconnects.
  pool.on('error', (err) => console.error(`Postgres connection dropped: ${err.message}`));
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}

/**
 * Run several statements as one unit. `fn` gets a query function bound to one connection;
 * a throw rolls everything back and is rethrown.
 */
export async function transaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn((text, params) => client.query(text, params));
    await client.query('commit');
    return result;
  } catch (err) {
    await client.query('rollback');
    throw err;
  } finally {
    client.release();
  }
}

export async function close() {
  if (pool) await pool.end();
}

/** Applies every unapplied file in db/migrations. Returns the filenames it ran. */
export async function migrate() {
  const db = getPool();
  await db.query(`create table if not exists schema_migrations (
    filename text primary key, applied_at timestamptz not null default now())`);
  const { rows } = await db.query('select filename from schema_migrations');
  const applied = new Set(rows.map((r) => r.filename));
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  const ran = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await db.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${err.message}. Nothing from it was applied; fix the file and run migrate again.`);
    } finally {
      client.release();
    }
    ran.push(file);
  }
  return ran;
}

/** A human sentence for the two ways a db command fails before it starts. */
export function explainDbError(err) {
  if (err.code === 'ECONNREFUSED') {
    return `Cannot reach Postgres at ${process.env.DATABASE_URL || DEFAULT_URL}. Run "pnpm db:up" and try again.`;
  }
  return err.message;
}
