const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

// Expose state only in the test-served HTML; all gestures use the real listeners.
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').replace('})();\n</script>', `
window.panelTest = {
  seed(items) {
    grid = emptyGrid();
    this.originals = new Map();
    for (const [r,c,type,rotation,element='C'] of items) {
      const panel = {type,rotation,element};
      grid[r][c] = panel;
      this.originals.set(panel, r + ',' + c);
    }
    refreshAll();
  },
  activate(r,c) { focusPracticeComponent(practiceComponents[practiceCellComponentIndex.get(r + "," + c)],true); },
  read() {
    return grid.flatMap((row,r) => row.flatMap((p,c) => p ? [{r,c,...p,origin:this.originals.get(p)}] : []));
  }
};
})();\n</script>`);
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
].find(p => p && fs.existsSync(p));
const selector = (r,c) => `.cell[data-row="${r}"][data-col="${c}"]`;
async function point(page,r,c) {
  const b = await page.locator(selector(r,c)).boundingBox();
  return {x:b.x+b.width/2,y:b.y+b.height/2};
}
async function down(page,r=2,c=3) {
  const p = await point(page,r,c);
  await page.mouse.move(p.x,p.y);
  await page.mouse.down();
}
async function move(page,r,c) {
  const p = await point(page,r,c);
  await page.mouse.move(p.x,p.y,{steps:3});
}
async function hold(page,r=2,c=3) {
  await down(page,r,c);
  await page.waitForTimeout(480);
  assert.equal(await page.locator('.ghost').count(),1,'long press must visibly pick up the panel');
}
async function read(page) { return page.evaluate(() => window.panelTest.read()); }
const seed = [[2,3,3,90]];
const original = {r:2,c:3,type:3,rotation:90,element:'C',origin:'2,3'};
const scenarios = [
  ['long press moves one panel with its identity and orientation', async page => {
    await hold(page); await move(page,1,3); await page.mouse.up();
    assert.deepEqual(await read(page),[{...original,r:1}]);
  }],
  ['long press release outside deletes the panel', async page => {
    await hold(page); await page.mouse.move(10,10); await page.mouse.up();
    assert.deepEqual(await read(page),[]);
  }],
  ['long press released at the original cell does not rotate', async page => {
    await hold(page); await page.mouse.up(); await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[original]);
  }],
  ['long press replaces an occupied destination as before', async page => {
    await page.evaluate(() => window.panelTest.seed([[2,3,3,90],[1,3,1,0,'Cl']]));
    await hold(page); await move(page,1,3); await page.mouse.up();
    assert.deepEqual(await read(page),[{...original,r:1}]);
  }],
  ['cancel during movement restores the source without deleting', async page => {
    await hold(page); await page.mouse.move(10,10);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
    await page.mouse.up(); await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[original]);
    assert.equal(await page.locator('.ghost').count(),0);
  }],
  ['cancel before long press never starts a delayed move', async page => {
    await down(page);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
    await page.waitForTimeout(480); await page.mouse.up();
    assert.deepEqual(await read(page),[original]);
    assert.equal(await page.locator('.ghost').count(),0);
  }],
  ['pending single tap cannot rotate a held panel', async page => {
    await page.locator(selector(2,3)).click();
    await hold(page); await move(page,1,3); await page.mouse.up();
    assert.deepEqual(await read(page),[{...original,r:1}]);
  }],
  ['mode change cancels movement before the new board is created', async page => {
    await hold(page);
    await page.getByRole('button',{name:'名付ける',exact:true}).dispatchEvent('click');
    const newBoard = await read(page);
    await move(page,2,3); await page.mouse.up();
    assert.deepEqual(await read(page),newBoard);
    assert.equal(await page.locator('.ghost').count(),0);
  }],
  ['right-click and secondary pointers never rotate a panel', async page => {
    await page.locator(selector(2,3)).click({button:'right'});
    await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[original]);
    await page.locator(selector(2,3)).dispatchEvent('pointerdown',{pointerId:99,isPrimary:false,pointerType:'touch',button:0,buttons:1});
    await page.locator(selector(2,3)).dispatchEvent('pointerup',{pointerId:99,isPrimary:false,pointerType:'touch',button:0,buttons:0});
    await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[original]);
  }],
  ['single tap still rotates clockwise', async page => {
    await page.locator(selector(2,3)).click(); await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[{...original,rotation:180}]);
  }],
  ['double tap still rotates counterclockwise', async page => {
    await page.locator(selector(2,3)).click({clickCount:2,delay:30}); await page.waitForTimeout(260);
    assert.deepEqual(await read(page),[{...original,rotation:0}]);
  }],
  ['triple tap still deletes', async page => {
    await page.locator(selector(2,3)).click({clickCount:3,delay:30});
    assert.deepEqual(await read(page),[]);
  }],
  ['short stationary press is a tap, with no delayed movement', async page => {
    await down(page); await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(480);
    assert.deepEqual(await read(page),[{...original,rotation:180}]);
    assert.equal(await page.locator('.ghost').count(),0);
  }],
  ['ordinary carbon drag stays in trace mode after holding', async page => {
    await page.evaluate(() => window.panelTest.seed([[2,2,1,0],[2,3,2,90],[2,4,1,180]]));
    await down(page); await move(page,1,3); await page.waitForTimeout(480); await move(page,0,3); await page.mouse.up();
    const panels = await read(page);
    assert.equal(panels.length,5);
    assert.equal(panels.find(p => p.r===2 && p.c===3).origin,'2,3');
    assert.equal(await page.locator('.ghost').count(),0);
  }],
  ['palette drag still places one carbon panel', async page => {
    await page.evaluate(() => window.panelTest.seed([]));
    const b = await page.locator('.palette-card').nth(1).boundingBox();
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2); await page.mouse.down();
    await move(page,2,3); await page.mouse.up();
    const panels = await read(page);
    assert.equal(panels.length,1);
    assert.deepEqual([panels[0].r,panels[0].c,panels[0].type,panels[0].rotation],[2,3,2,90]);
  }],
  ['selected palette still supports repeat placement and double-tap deselection', async page => {
    await page.evaluate(() => window.panelTest.seed([]));
    await page.locator('.palette-card').first().click();
    for (const c of [2,3]) { await page.locator(selector(2,c)).click(); await page.waitForTimeout(260); }
    assert.equal((await read(page)).length,2);
    await page.locator(selector(1,3)).click({clickCount:2,delay:30}); await page.waitForTimeout(260);
    assert.equal((await read(page)).length,2);
    assert.equal(await page.locator('.palette-card.selected').count(),0);
  }],
  ['inactive molecule retains selection-only tap and supports long-press move', async page => {
    const items = [[2,2,1,0],[2,3,1,180],[2,5,1,0],[2,6,1,180]];
    await page.evaluate(items => { window.panelTest.seed(items); window.panelTest.activate(2,5); },items);
    const before = await read(page);
    await page.locator(selector(2,2)).click(); await page.waitForTimeout(260);
    assert.deepEqual(await read(page),before);
    await page.evaluate(() => window.panelTest.activate(2,5));
    await hold(page,2,2); await move(page,1,2); await page.mouse.up();
    const panels = await read(page);
    assert.equal(panels.length,4);
    assert.deepEqual(panels.find(p => p.origin==='2,2'),{r:1,c:2,type:1,rotation:0,element:'C',origin:'2,2'});
  }],
  ['native browser touch moves and deletes with implicit pointer capture', async page => {
    const session = await page.context().newCDPSession(page);
    const touch = async (type,p) => session.send('Input.dispatchTouchEvent',{type,touchPoints:p ? [{...p,id:1}] : []});
    await touch('touchStart',await point(page,2,3)); await page.waitForTimeout(480);
    assert.equal(await page.locator('.ghost').count(),1);
    await touch('touchMove',await point(page,1,3)); await touch('touchEnd');
    assert.deepEqual(await read(page),[{...original,r:1}]);
    await touch('touchStart',await point(page,1,3)); await page.waitForTimeout(480);
    await touch('touchMove',{x:10,y:10}); await touch('touchEnd');
    assert.deepEqual(await read(page),[]);
    await session.detach();
  }],
  ['halogen and OH still move immediately and delete outside', async page => {
    for (const element of ['Cl','OH']) {
      await page.evaluate(element => window.panelTest.seed([[2,3,1,0,element]]),element);
      await down(page); await move(page,1,3); await page.mouse.up();
      assert.deepEqual(await read(page),[{r:1,c:3,type:1,rotation:0,element,origin:'2,3'}]);
      await down(page,1,3); await page.mouse.move(10,10); await page.mouse.up();
      assert.deepEqual(await read(page),[]);
    }
  }],
  ['halogen and OH ignore rotation taps but support triple delete', async page => {
    for (const element of ['Cl','OH']) {
      await page.evaluate(element => window.panelTest.seed([[2,3,1,0,element]]),element);
      await page.locator(selector(2,3)).click({clickCount:2,delay:30}); await page.waitForTimeout(260);
      assert.deepEqual(await read(page),[{r:2,c:3,type:1,rotation:0,element,origin:'2,3'}]);
      await page.locator(selector(2,3)).click({clickCount:3,delay:30});
      assert.deepEqual(await read(page),[]);
    }
  }],
];

test('panel gestures preserve existing operations', async t => {
  const browser = await chromium.launch({headless:true,executablePath});
  t.after(() => browser.close());
  for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
    for (const [name,run] of scenarios) await t.test(`${viewport.width}: ${name}`, async () => {
      const page = await browser.newPage({viewport,hasTouch:true});
      try {
        await page.route('http://alkane.test/**',route => route.fulfill({contentType:'text/html',body:html}));
        await page.goto('http://alkane.test/');
        await page.evaluate(seed => window.panelTest.seed(seed),seed);
        await run(page);
      } finally { await page.close(); }
    });
  }
});
