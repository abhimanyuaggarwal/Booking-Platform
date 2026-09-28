import { chromium } from '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad/node_modules/playwright/index.mjs';
const dir = '/private/tmp/claude-502/-Users-Abhimanyu-Aggarwal-Downloads-expert-sessions/f3c536f9-0f34-4e93-ad4c-06d5f8082e08/scratchpad/film3';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${dir}/cards.html`); await page.waitForTimeout(600);
for (const id of ['cover', 'scene', 'pain', 'idea', 'meera', 'ask', 'cap-week', 'cap-settings', 'cap-hindi']) {
  await page.evaluate((t) => { document.body.style.background = t ? 'transparent' : ''; }, id.startsWith('cap'));
  await page.locator(`#${id}`).screenshot({ path: `${dir}/${id}.png`, omitBackground: id.startsWith('cap') });
}
await browser.close(); console.log('cards rendered');
