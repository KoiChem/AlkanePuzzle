const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').replace('})();\n</script>', `window.traceTest = {
  seed(items) { grid = emptyGrid(); for (const [r,c,dirs,element] of items) { grid[r][c] = {...panelForDirections(dirs), ...(element ? {element} : {})}; } this.originals = grid.map(row => row.slice()); refreshAll(); },
  read() { return grid.flatMap((row,r) => row.flatMap((panel,c) => panel ? [{r,c,dirs:[...getBondDirections(grid,r,c)].sort(),element:panel.element || 'C',same:!this.originals[r][c] || this.originals[r][c] === panel}] : [])); },
  mismatches() { return checkMismatches(grid); }
};\n})();\n</script>`);
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function drag(page, cells) {
  const points = [];
  for (const [r,c] of cells) { const box = await page.locator(`.cell[data-row="${r}"][data-col="${c}"]`).boundingBox(); points.push({x:box.x+box.width/2,y:box.y+box.height/2}); }
  await page.mouse.move(points[0].x,points[0].y); await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x,p.y,{steps:1});
  await page.mouse.up();
}
const horizontal = [[2,2,['E']],[2,3,['W','E']],[2,4,['W']]];
const cases = [
  {name:'crossing preserves horizontal bonds and carbon identity',seed:horizontal,path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENSW'],[2,4,'W'],[3,3,'N']]},
  {name:'starting on carbon adds a branch without moving it',seed:horizontal,path:[[2,3],[1,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'ending on carbon joins the existing chain',seed:horizontal,path:[[0,3],[1,3],[2,3]],want:[[0,3,'S'],[1,3,'NS'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'joining two chains retains both chains',seed:[[2,1,['E']],[2,2,['W']],[2,4,['E']],[2,5,['W']]],path:[[2,2],[2,3],[2,4]],want:[[2,1,'E'],[2,2,'EW'],[2,3,'EW'],[2,4,'EW'],[2,5,'W']]},
  {name:'retracing an existing bond does not duplicate it',seed:horizontal,path:[[2,2],[2,3],[2,4]],want:[[2,2,'E'],[2,3,'EW'],[2,4,'W']]},
  {name:'backtracking removes only the new branch',seed:horizontal,path:[[1,3],[2,3],[3,3],[2,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'full backtrack restores the existing node',seed:horizontal,path:[[2,3],[1,3],[2,3]],want:[[2,2,'E'],[2,3,'EW'],[2,4,'W']]},
  {name:'pending tap must not rotate a new branch',seed:horizontal,path:[[2,3],[1,3]],tap:[2,3],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'noncarbon panel stops tracing without replacement',seed:[[2,3,['E'],'Cl'],[2,4,['W']]],path:[[1,3],[2,3]],want:[[2,3,'E'],[2,4,'W']]},
  {name:'existing hydroxyl bond survives carbon crossing',seed:[[2,2,['E']],[2,3,['W','E']],[2,4,['W'],'OH']],path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENSW'],[2,4,'W'],[3,3,'N']]},
  {name:'empty-only tracing still creates a bent chain',seed:[],path:[[1,2],[1,3],[2,3]],want:[[1,2,'E'],[1,3,'SW'],[2,3,'N']]},
  {name:'empty-only tracing still closes a ring',seed:[],path:[[1,2],[1,3],[2,3],[2,2],[1,2]],want:[[1,2,'ES'],[1,3,'SW'],[2,2,'EN'],[2,3,'NW']]},
];
test('trace integration', async t => {
 const browser = await chromium.launch({headless:true,executablePath}); t.after(()=>browser.close());
 for (const viewport of [{width:1280,height:900},{width:390,height:844}]) for (const scenario of cases) await t.test(`${viewport.width}: ${scenario.name}`,async()=>{
  const page=await browser.newPage({viewport});
  await page.route('http://alkane.test/**',route=>route.fulfill({contentType:'text/html',body:html}));
  await page.goto('http://alkane.test/'); await page.evaluate(seed=>window.traceTest.seed(seed),scenario.seed);
  if (scenario.tap) { const [r,c]=scenario.tap; await page.locator(`.cell[data-row="${r}"][data-col="${c}"]`).click(); }
  await drag(page,scenario.path);
  await page.waitForTimeout(260);
  const actual=await page.evaluate(()=>window.traceTest.read());
  assert.deepEqual(actual.map(p=>[p.r,p.c,p.dirs.join('')]),scenario.want);
  assert.ok(actual.every(p=>p.same),'existing nodes must retain object identity');
  assert.deepEqual(await page.evaluate(()=>window.traceTest.mismatches()),[]);
  await page.close();
 });
});
