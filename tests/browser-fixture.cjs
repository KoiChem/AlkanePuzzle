const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
async function serveApp(page, html = fs.readFileSync(path.join(root,'index.html'),'utf8')) {
  await page.route(/^http:\/\/(?:alkane\.test|localhost:4179)\//, route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/' || pathname === '/index.html') return route.fulfill({contentType:'text/html',body:html});
    const file = path.join(root,pathname);
    return fs.existsSync(file) ? route.fulfill({path:file}) : route.fulfill({status:404,body:'not found'});
  });
}
async function ready(page) { await page.waitForFunction(() => document.documentElement.dataset.settingsReady === 'true'); }
module.exports = {serveApp,ready};
