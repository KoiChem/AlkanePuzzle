const {serveApp,ready} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

// Expose state only in the test-served HTML; all gestures use the real listeners.
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').replace('})();\n</script>', `
let pickupCalls = 0;
const realPickupSound = playPanelPickupSound;
playPanelPickupSound = function() { pickupCalls++; realPickupSound(); };
window.panelTest = {
  pickups() { return pickupCalls; },
  cancel() { cancelGridInteractions(); },
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
  ['native touch selected noncarbon starts trace and cancels with original restored', async page => {
    const session=await page.context().newCDPSession(page);
    const touch=(type,p)=>session.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
    for(const element of ['Cl','OH']) {
      await page.evaluate(element=>window.panelTest.seed([[2,3,1,0,element]]),element);
      await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
      await touch('touchStart',await point(page,2,3));
      await touch('touchMove',await point(page,1,3));
      await touch('touchEnd');
      assert.deepEqual((await read(page)).map(p=>[p.r,p.c,p.element||'C']),[[1,3,'C'],[2,3,'C']]);
      assert.equal(await page.locator('.palette-card.selected').count(),0);
      await page.evaluate(element=>window.panelTest.seed([[2,3,1,0,element]]),element);
      await touch('touchStart',await point(page,2,3));
      await touch('touchMove',await point(page,1,3));
      await touch('touchCancel');
      assert.deepEqual((await read(page)).map(p=>[p.r,p.c,p.element]),[[2,3,element]]);
    }
    await session.detach();
  }],
  ['inactive noncarbon molecule short tap selects and long press moves', async page => {
    for(const element of ['Cl','OH']) {
      const items=[[2,2,1,0],[2,3,1,0,element],[2,5,1,0],[2,6,1,180]];
      await page.evaluate(items=>{window.panelTest.seed(items);window.panelTest.activate(2,5);},items);
      const before=await read(page);
      await page.locator(selector(2,3)).click();await page.waitForTimeout(260);
      assert.deepEqual(await read(page),before);
      await page.evaluate(()=>window.panelTest.activate(2,5));
      await hold(page);await move(page,1,3);await page.mouse.up();
      assert.equal((await read(page)).find(p=>p.origin==='2,3').r,1);
    }
  }],
  ['trace cancellation before board switch restores pending changes', async page => {
    const items=[[2,2,1,0],[2,3,1,0,'OH']];
    await page.evaluate(items=>window.panelTest.seed(items),items);
    const before=await read(page);
    await down(page,1,3);await move(page,2,3);
    await page.evaluate(()=>window.panelTest.cancel());
    assert.deepEqual(await read(page),before);
    await page.getByRole('button',{name:'名付ける',exact:true}).dispatchEvent('click');
    const board=await read(page);await move(page,3,3);await page.mouse.up();
    assert.deepEqual(await read(page),board);
  }],
  ['eight pixel adjacent swipe starts tracing',async page=>{
    for(const selected of [false,true]) {
      await page.evaluate(()=>window.panelTest.seed([[2,3,1,0,'Cl']]));
      if(selected)await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
      const b=await page.locator(selector(2,3)).boundingBox();
      const x=b.x+b.width-2,y=b.y+b.height/2;
      await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+8,y);await page.mouse.up();
      assert.deepEqual((await read(page)).map(p=>[p.r,p.c,p.element||'C']),[[2,3,'C'],[2,4,'C']]);
    }
  }],
  ['all panel types signal pickup once after long press', async page => {
    for (const element of ['C','F','Cl','Br','I','OH']) {
      await page.evaluate(element => window.panelTest.seed([[2,3,1,0,element]]),element);
      const before = await page.evaluate(() => window.panelTest.pickups());
      await hold(page); await page.waitForTimeout(450);
      assert.equal(await page.evaluate(() => window.panelTest.pickups()),before+1);
      await page.mouse.up();
      assert.equal((await read(page))[0].element,element);
    }
  }],
  ['selected candidate draws from first cell when entering adjacent cell', async page => {
    await page.evaluate(() => window.panelTest.seed([]));
    await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
    await down(page); await move(page,1,3); await page.mouse.up();
    await page.waitForTimeout(260);
    assert.equal(await page.locator('.palette-card.selected').count(),0);
    assert.deepEqual((await read(page)).map(p=>[p.r,p.c,p.element||'C']),[[1,3,'C'],[2,3,'C']]);
  }],
  ['second rapid tap can become a trace without delayed placement', async page => {
    await page.evaluate(() => window.panelTest.seed([]));
    await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
    await page.locator(selector(2,3)).click();
    await down(page); await move(page,1,3); await page.mouse.up();
    await page.waitForTimeout(260);
    assert.equal((await read(page)).length,2);
    assert.equal(await page.locator('.palette-card.selected').count(),0);
  }],
  ['moving within selected cell does not deselect or overwrite', async page => {
    await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
    const p=await point(page,2,3); await down(page); await page.mouse.move(p.x+12,p.y); await page.mouse.up();
    await page.waitForTimeout(480);
    assert.equal(await page.locator('.palette-card.selected').count(),1);
    assert.deepEqual(await read(page),[original]);
  }],
  ['trace cancellation and blur restore overwritten panel and original carbon', async page => {
    for (const event of ['pointercancel','blur']) {
      const items=[[2,2,1,0],[2,3,1,0,'OH']];
      await page.evaluate(items=>window.panelTest.seed(items),items);
      const before=await read(page);
      await down(page,1,3); await move(page,2,3); await move(page,3,3);
      assert.equal((await read(page)).find(p=>p.r===2&&p.c===3).element||'C','C');
      await page.evaluate(event=>window.dispatchEvent(event==='blur'?new Event('blur'):new PointerEvent('pointercancel',{pointerId:1})),event);
      await page.mouse.up();
      assert.deepEqual(await read(page),before);
    }
  }],
  ['selected candidate allows long pickup of carbon, halogen and OH and remains selected',async page=>{
    for(const element of ['C','Cl','OH']){
      await page.evaluate(element=>window.panelTest.seed([[2,3,1,0,element]]),element);
      if(element==='C')await page.locator(selector(2,3)).click();
      await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
      await hold(page);await move(page,1,3);await page.mouse.up();
      assert.deepEqual(await read(page),[{r:1,c:3,type:1,rotation:0,element,origin:'2,3'}]);
      assert.equal(await page.locator('.palette-card.selected').count(),1);
      await page.locator(selector(2,4)).click();await page.waitForTimeout(260);
      assert.equal((await read(page)).find(p=>p.r===2&&p.c===4).type,2);
      await hold(page,1,3);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
      assert.equal((await read(page)).find(p=>p.r===1&&p.c===3).element,element);
      await hold(page,1,3);await page.mouse.move(10,10);await page.mouse.up();
      assert.equal((await read(page)).some(p=>p.r===1&&p.c===3),false);
      await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).click();
    }
  }],

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
    const b = await page.locator('.palette-row:not(.with-undo) .palette-card').nth(1).boundingBox();
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
  ['halogen and OH long press moves and deletes outside', async page => {
    for (const element of ['Cl','OH']) {
      await page.evaluate(element => window.panelTest.seed([[2,3,1,0,element]]),element);
      await hold(page); await move(page,1,3); await page.mouse.up();
      assert.deepEqual(await read(page),[{r:1,c:3,type:1,rotation:0,element,origin:'2,3'}]);
      await hold(page,1,3); await page.mouse.move(10,10); await page.mouse.up();
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
        await serveApp(page,html);
        await page.goto('http://alkane.test/'); await ready(page);
        await page.evaluate(seed => window.panelTest.seed(seed),seed);
        await run(page);
      } finally { await page.close(); }
    });
  }
});
