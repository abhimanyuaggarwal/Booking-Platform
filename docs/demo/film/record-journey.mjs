import fs from 'node:fs';
import { chromium } from '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad/node_modules/playwright/index.mjs';
const S = '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad';
const dir = `${S}/film2`;
const [user, pass, guruToken, roomId, roomLabel, heldId] = process.argv.slice(2);
const H = 'https://192-46-215-107.sslip.io';
const phone = { viewport: { width: 585, height: 1266 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, ignoreHTTPSErrors: true, recordVideo: { dir: `${dir}/raw`, size: { width: 585, height: 1266 } } };
const laptop = { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, recordVideo: { dir: `${dir}/raw`, size: { width: 1920, height: 1080 } } };
const result = {};
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function record(name, browser, opts, run) {
  const ctx = await browser.newContext({ ...opts, permissions: ['camera', 'microphone'] });
  const t0 = Date.now(); const page = await ctx.newPage(); const marks = {};
  const mark = (k) => { marks[k] = (Date.now() - t0) / 1000; log(name, k, marks[k].toFixed(1)); };
  try { await run(page, mark); } catch (err) { log(name, 'FAILED', err.message); marks.failed = err.message; }
  mark('end'); await ctx.close(); result[name] = { video: await page.video().path(), marks };
}
const plain = await chromium.launch();
await record('whatsapp', plain, phone, async (page, mark) => { await page.goto(`file://${S}/video/wa.html`); mark('start'); await wait(16500); });
await record('pay', plain, phone, async (page, mark) => {
  await page.goto(`${H}/pay/${heldId}`, { waitUntil: 'networkidle' }); await wait(2200); mark('page');
  await page.getByRole('button', { name: /Pay .* by UPI/ }).click(); await page.waitForSelector('iframe.razorpay-checkout-frame', { timeout: 30000 }).catch(() => {}); await wait(4500); mark('checkout');
});
await record('confirmed', plain, phone, async (page, mark) => {
  await page.goto(`${H}/s/bhagwat/booked/${roomId}`, { waitUntil: 'networkidle' }); await wait(4000); mark('confirmed');
});
await plain.close();

const login = await fetch(`${H}/api/console/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
const cookie = login.headers.get('set-cookie').split(';')[0];
const teamSays = (text) => fetch(`${H}/api/console/bookings/${roomId}/message`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ text }) });

const her = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${S}/video/cam-devotee.y4m`, '--autoplay-policy=no-user-gesture-required'] });
const him = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${S}/video/cam-guru.y4m`, '--autoplay-policy=no-user-gesture-required'] });
const herCtx = await her.newContext({ ...phone, permissions: ['camera', 'microphone'] }); const herT0 = Date.now(); const herPage = await herCtx.newPage(); const herMarks = {};
const herMark = (k) => { herMarks[k] = (Date.now() - herT0) / 1000; log('her', k, herMarks[k].toFixed(1)); };
await herPage.goto(`${H}/join/${roomId}`, { waitUntil: 'networkidle' }); await wait(2200); herMark('preentry');
await herPage.getByRole('button', { name: 'Enter the waiting room' }).click(); await herPage.waitForSelector('.waiting', { timeout: 15000 }); await wait(2500); herMark('waiting');
await teamSays('Joining in 5 minutes'); await wait(2600); herMark('team-note');
await herPage.locator('.channel .say input').fill('Namaste, I am ready'); await wait(600); await herPage.locator('.channel .say button').click(); await wait(2600); herMark('her-reply');
await record('guru', him, phone, async (page, mark) => {
  await page.goto(`${H}/guru?t=${guruToken}`, { waitUntil: 'networkidle' }); await wait(2200); mark('day');
  const join = page.locator('button.join', { hasText: roomLabel }).first(); await join.scrollIntoViewIfNeeded(); await wait(1200); await join.click(); mark('tap-join');
  const joinNow = page.getByRole('button', { name: /join now/i }); await joinNow.waitFor({ timeout: 40000 }); await wait(2200); mark('preview'); await joinNow.click(); mark('in-room');
  const hers = herPage.getByRole('button', { name: /join now/i }); await hers.waitFor({ timeout: 40000 }); await wait(1500); herMark('preview'); await hers.click(); herMark('in-room');
  await wait(11000); mark('both');
});
herMark('end'); await herCtx.close(); result.her = { video: await herPage.video().path(), marks: herMarks };
await fetch(`${H}/api/guru/sessions/${roomId}/end`, { method: 'POST', headers: { 'X-Guru-Token': guruToken } }).catch(() => {});
await her.close(); await him.close();

const desk = await chromium.launch();
await record('door2', desk, laptop, async (page, mark) => {
  await page.goto(`${H}/console`, { waitUntil: 'networkidle' });
  await page.locator('label:has-text("Username") input').fill(user); await page.locator('input[type="password"]').fill(pass); await page.locator('button.primary').first().click();
  await page.waitForSelector('.console-nav', { timeout: 20000 }); await page.evaluate(() => localStorage.setItem('samvad-console-lang', 'en')); await page.goto(`${H}/console`, { waitUntil: 'networkidle' }); await wait(1500); mark('today');
  await page.locator('.topbar button.primary').click(); await page.waitForSelector('form.sheet'); await wait(1200); mark('sheet');
  await page.locator('form.sheet input').first().type('91 92051 01862', { delay: 60 }); await wait(400);
  await page.locator('form.sheet input').nth(1).type('Sarla Joshi', { delay: 60 }); await wait(400);
  const sel = page.locator('form.sheet select').first(); const opts = await sel.locator('option').allTextContents(); await sel.selectOption({ index: 1 }); await wait(800);
  await page.locator('form.sheet select').nth(1).selectOption('ashram'); await wait(600);
  await page.locator('form.sheet input').nth(3).type('For my sister, who is unwell', { delay: 40 }); await wait(500);
  await page.locator('form.sheet select').last().selectOption('cash'); await wait(1600); mark('cash');
  await page.locator('form.sheet button.primary').click(); await page.waitForSelector('.drawer .drawer-head h2', { timeout: 20000 }); await wait(2500); mark('booked');
  await page.getByRole('button', { name: 'Tell guruji' }).first().click(); await wait(2500); mark('told');
});
await record('console', desk, laptop, async (page, mark) => {
  await page.goto(`${H}/console`, { waitUntil: 'networkidle' });
  if (await page.locator('label:has-text("Username") input').count()) { await page.locator('label:has-text("Username") input').fill(user); await page.locator('input[type="password"]').fill(pass); await page.locator('button.primary').first().click(); await page.waitForSelector('.console-nav', { timeout: 20000 }); }
  await page.evaluate(() => localStorage.setItem('samvad-console-lang', 'en')); await page.goto(`${H}/console`, { waitUntil: 'networkidle' }); await wait(2500); mark('today');
  await page.mouse.wheel(0, 400); await wait(1800); await page.mouse.wheel(0, -400); await wait(800);
  await page.locator('.topbar button.lang').click(); await wait(3200); mark('hindi');
});
await desk.close();
fs.writeFileSync(`${dir}/recording.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, v.marks])), null, 1));
