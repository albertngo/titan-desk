/* eslint-disable @typescript-eslint/no-require-imports -- a plain Node script run by hand (see README.md); Playwright loads through require in cloud sessions. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1320, height: 1200 } });
  const html = require('fs').readFileSync(process.argv[2], 'utf8');
  await p.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body>' + html + '</body></html>', { waitUntil: 'networkidle' });
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: process.argv[3], format: 'Letter', printBackground: true, preferCSSPageSize: true });
  const el = await p.$('.page');
  await el.screenshot({ path: process.argv[4] });
  console.log('scrollH', await p.evaluate(() => { const pg = document.querySelector('.page'); return [pg.scrollHeight, pg.clientHeight]; }));
  await b.close();
})();
