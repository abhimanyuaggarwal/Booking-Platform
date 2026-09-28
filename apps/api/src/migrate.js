// pnpm --filter api migrate
import 'dotenv/config';
import { migrate, close, explainDbError } from './db.js';

try {
  const ran = await migrate();
  console.log(ran.length ? `Applied ${ran.join(', ')}` : 'Database is up to date');
} catch (err) {
  console.error(explainDbError(err));
  process.exit(1);
}
await close();
