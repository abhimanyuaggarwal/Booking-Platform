import fs from 'node:fs';
import { chromium } from '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad/node_modules/playwright/index.mjs';
const dir = '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad/film3';
const H = 'https://192-46-215-107.sslip.io';
const laptop = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, recordVideo: { dir: `${dir}/raw`, size: { width: 1920, height: 1080 } } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const result = {};
const browser = await chromium.launch();
async function record(name, run) {
  const ctx = await browser.newContext(laptop); const t0 = Date.now(); const page = await ctx.newPage(); const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; console.log(name, k, marks[k].toFixed(1)); };
  try { await run(page, mark); } catch (err) { console.log(name, 'FAILED', err.message); marks.failed = err.message; }
  mark('end'); await ctx.close(); result[name] = { video: await page.video().path(), marks };
}
async function signIn(page) {
  await page.goto(`${H}/console`, { waitUntil: 'networkidle' });
  if (await page.locator('input[type="password"]').count()) {
    await page.locator('input[autocomplete="username"], label:has-text("Username") input').first().fill(process.env.CONSOLE_USER);
    await page.locator('input[type="password"]').fill(process.env.CONSOLE_PASSWORD);
    await page.keyboard.press('Enter'); await page.waitForSelector('.console-nav, .nextcard, .sittings', { timeout: 20000 });
  }
  await page.evaluate(() => localStorage.setItem('samvad-console-lang', 'en'));
}
await record('week', async (page, mark) => {
  await signIn(page); await page.goto(`${H}/console/week`, { waitUntil: 'networkidle' }); await wait(2600); mark('grid');
  await page.mouse.move(700, 600); await page.mouse.wheel(0, 500); await wait(2000); await page.mouse.wheel(0, -500); await wait(1200); mark('scrolled');
  const open = page.locator('button.open').first(); await open.hover(); await wait(1400); mark('hover-open');
  await page.getByRole('button', { name: /cannot sit on a day/i }).click(); await wait(3200); mark('close-day');
  await page.keyboard.press('Escape'); await wait(800);
  const cancel = page.getByRole('button', { name: /^(Cancel|Not now|Close)$/ }).first(); if (await cancel.count()) await cancel.click().catch(() => {});
  await wait(1200); mark('back');
});
await record('settings', async (page, mark) => {
  await signIn(page); await page.goto(`${H}/console/more`, { waitUntil: 'networkidle' }); await wait(2000); mark('more');
  await page.getByRole('link', { name: /settings/i }).first().click(); await page.waitForSelector('form.settings, .settings', { timeout: 15000 }); await wait(2600); mark('timings');
  await page.mouse.move(900, 700); await page.mouse.wheel(0, 700); await wait(2200); mark('each-time');
  await page.mouse.wheel(0, -700); await wait(600);
  await page.getByRole('link', { name: /website/i }).first().click(); await wait(2600); mark('website');
  await page.mouse.wheel(0, 500); await wait(1800); mark('website-more');
  await page.mouse.wheel(0, -500); await wait(400);
  await page.getByRole('link', { name: /QR/i }).first().click(); await wait(2600); mark('qr');
});
await browser.close();
fs.writeFileSync(`${dir}/recording-desk.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.marks]))));
