const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('})();\n</script>', `
window.settingsTest = {
  snapshot: () => gameSettings,
  sample(tier, overrides = {}) {
    const opts = {...buildGame2Opts(tier), categoryWeights:{cyclo:100,chain:0,methane:0}, ...overrides};
    return Array.from({length:50}, () => {
      const q = generateStructureWithOptions(opts);
      return {name:q.name, fallback:q.fellBack, ...namedGroupSummary(q.name)};
    });
  }
};
})();\n</script>`);
async function serve(page, {profile, fail = false} = {}) {
  await page.route('http://alkane.test/**', async route => {
    const file = new URL(route.request().url()).pathname;
    if (file === '/' || file === '/index.html') return route.fulfill({contentType:'text/html',body:html});
    if (file === '/data/shared-settings.json') {
      if (fail) return route.fulfill({status:503,body:'unavailable'});
      return route.fulfill({contentType:'application/json',body:JSON.stringify(profile || JSON.parse(fs.readFileSync(path.join(root, file), 'utf8')))});
    }
    const local = path.join(root,file);
    if (fs.existsSync(local)) return route.fulfill({path:local});
    return route.fulfill({status:404,body:'not found'});
  });
  await page.goto('http://alkane.test/?admin=1');
  if (!fail) await page.waitForFunction(() => document.documentElement.dataset.settingsReady === 'true');
}
test('shared settings and cyclo limits', async t => {
  const browser = await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  t.after(() => browser.close());
  await t.test('a query parameter alone cannot open settings', async () => {
    const page = await browser.newPage();
    await serve(page);
    assert.equal(await page.locator('#settings-gear').isVisible(), false);
    await page.close();
  });
  await t.test('easy defaults generate only unsubstituted or singly substituted rings', async () => {
    const page = await browser.newPage(); await serve(page);
    const questions = await page.evaluate(() => window.settingsTest.sample('easy'));
    assert.ok(questions.every(q => q.name.includes('シクロ') && q.total <= 1 && !q.fallback), JSON.stringify(questions));
    assert.ok(questions.some(q => q.total === 0));
    assert.ok(questions.some(q => q.total === 1));
    await page.close();
  });
  for (const tier of ['medium','hard']) await t.test(`${tier}: limit overrides count/type minima and counts OH`, async () => {
    const page = await browser.newPage(); await serve(page);
    const questions = await page.evaluate(tier => window.settingsTest.sample(tier, {cycloLimitOne:true, alcoholEnabled:true,alcoholRate:100,hydroxylCountsAsSubstituent:false}), tier);
    assert.ok(questions.every(q => q.name.includes('シクロ') && q.total === 1 && q.hydroxylCount === 1 && !q.fallback), JSON.stringify(questions));
    await page.close();
  });
  await t.test('published settings override old local settings on every fresh launch', async () => {
    const profile = JSON.parse(fs.readFileSync(path.join(root,'data/shared-settings.json'),'utf8'));
    profile.settings.game2.easy.lenMax = 3;
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('alkane-puzzle-settings-v3',JSON.stringify({game2:{easy:{lenMax:10,cycloLimitOne:false}}})));
    await serve(page,{profile});
    assert.equal(await page.evaluate(() => window.settingsTest.snapshot().game2.easy.lenMax),3);
    profile.settings.game2.easy.lenMax = 5;
    await page.reload(); await page.waitForFunction(() => window.settingsTest);
    assert.equal(await page.evaluate(() => window.settingsTest.snapshot().game2.easy.lenMax),5);
    await page.close();
  });
  await t.test('failed shared fetch blocks the game and offers retry without old settings', async () => {
    const page = await browser.newPage(); await serve(page,{fail:true});
    await page.locator('#startup-retry').waitFor({state:'visible'});
    assert.equal(await page.locator('#app').evaluate(app => app.inert),true);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.settingsReady),undefined);
    await page.close();
  });
  await t.test('turning the ring limit off allows multiple groups and preserves chain settings', async () => {
    const page = await browser.newPage(); await serve(page);
    const questions = await page.evaluate(() => window.settingsTest.sample('medium',{cycloLimitOne:false}));
    assert.ok(questions.every(q => q.name.includes('シクロ') && q.total >= 3 && q.total <= 6 && !q.fallback));
    const chains = await page.evaluate(() => window.settingsTest.sample('medium',{cycloLimitOne:true,categoryWeights:{chain:100,cyclo:0,methane:0}}));
    assert.ok(chains.every(q => !q.name.includes('シクロ') && q.total >= 3 && !q.fallback));
    await page.close();
  });
});
