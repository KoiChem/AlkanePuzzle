const {serveApp,ready} = require('./browser-fixture.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').replace('})();\n</script>', `window.traceTest = {
  seed(items) { grid = emptyGrid(); for (const [r,c,dirs,element] of items) { grid[r][c] = {...panelForDirections(dirs), ...(element ? {element} : {})}; } this.originals = grid.map(row => row.slice()); refreshAll(); },
  read() { return grid.flatMap((row,r) => row.flatMap((panel,c) => panel ? [{r,c,dirs:[...getBondDirections(grid,r,c)].sort(),element:panel.element || 'C',same:!this.originals[r][c] || this.originals[r][c] === panel}] : [])); },
  mismatches() { return checkMismatches(grid); },
  name() { return generateName(grid); }
};\n})();\n</script>`);
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
async function drag(page, cells, cancelled = false, touch = false) {
  const points = [];
  for (const [r,c] of cells) { const box = await page.locator(`.cell[data-row="${r}"][data-col="${c}"]`).boundingBox(); points.push({x:box.x+box.width/2,y:box.y+box.height/2}); }
  if (touch) {
    const session = await page.context().newCDPSession(page);
    try {
      await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
      for (const point of points.slice(1)) await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,id:1}]});
      await session.send('Input.dispatchTouchEvent',{type:cancelled?'touchCancel':'touchEnd',touchPoints:[]});
    } finally { await session.detach(); }
    return;
  }
  await page.mouse.move(points[0].x,points[0].y); await page.mouse.down();
  for (const p of points.slice(1)) await page.mouse.move(p.x,p.y,{steps:1});
  if (cancelled) await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));
  await page.mouse.up();
}
const horizontal = [[2,2,['E']],[2,3,['W','E']],[2,4,['W']]];
const methylRing = [[2,1,'E'],[2,2,'ESW'],[2,3,'SW'],[3,2,'EN'],[3,3,'NW']];
const ringWalk = [[2,1],[2,2],[2,3],[3,3],[3,2],[2,2]];
const cases = [
  {name:'closes a ring at a revisited branch carbon',seed:[],path:ringWalk,want:methylRing,compound:'メチルシクロブタン'},
  {name:'continues into a branch after closing at the starting carbon',seed:[],path:[[2,2],[2,3],[3,3],[3,2],[2,2],[1,2]],want:[[1,2,'S'],[2,2,'ENS'],[2,3,'SW'],[3,2,'EN'],[3,3,'NW']],compound:'メチルシクロブタン'},
  {name:'crossing the same carbon keeps all four directions',seed:[],path:[...ringWalk,[1,2]],want:[[1,2,'S'],[2,1,'E'],[2,2,'ENSW'],[2,3,'SW'],[3,2,'EN'],[3,3,'NW']],compound:'1,1-ジメチルシクロブタン'},
  {name:'retracing a ring bond reaches the adjacent methyl branch',seed:[],path:[...ringWalk,[2,3],[1,3]],want:[[1,3,'S'],[2,1,'E'],[2,2,'ESW'],[2,3,'NSW'],[3,2,'EN'],[3,3,'NW']],compound:'1,2-ジメチルシクロブタン'},
  {name:'retracing two ring bonds reaches the opposite methyl branch',seed:[],path:[...ringWalk,[2,3],[3,3],[3,4]],want:[[2,1,'E'],[2,2,'ESW'],[2,3,'SW'],[3,2,'EN'],[3,3,'ENW'],[3,4,'W']],compound:'1,3-ジメチルシクロブタン'},
  {name:'backtracking a new branch retains the closed ring',seed:[],path:[...ringWalk,[1,2],[2,2]],want:methylRing,compound:'メチルシクロブタン'},
  {name:'backtracking a repeated edge retains its earlier traversal',seed:[],path:[...ringWalk,[2,3],[2,2]],want:methylRing,compound:'メチルシクロブタン'},
  {name:'backtracking the closing edge reopens the ring',seed:[],path:[...ringWalk,[3,2]],want:[[2,1,'E'],[2,2,'EW'],[2,3,'SW'],[3,2,'E'],[3,3,'NW']],compound:'ペンタン'},
  {name:'Undo restores the whole self-crossing stroke',seed:[],path:[...ringWalk,[1,2]],restore:'undo',want:[]},
  {name:'cancel restores the whole self-crossing stroke',seed:horizontal,path:[...ringWalk,[1,2]],restore:'cancel',want:[[2,2,'E'],[2,3,'EW'],[2,4,'W']]},
  {name:'crossing preserves horizontal bonds and carbon identity',seed:horizontal,path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENSW'],[2,4,'W'],[3,3,'N']]},
  {name:'starting on carbon adds a branch without moving it',seed:horizontal,path:[[2,3],[1,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'ending on carbon joins the existing chain',seed:horizontal,path:[[0,3],[1,3],[2,3]],want:[[0,3,'S'],[1,3,'NS'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'joining two chains retains both chains',seed:[[2,1,['E']],[2,2,['W']],[2,4,['E']],[2,5,['W']]],path:[[2,2],[2,3],[2,4]],want:[[2,1,'E'],[2,2,'EW'],[2,3,'EW'],[2,4,'EW'],[2,5,'W']]},
  {name:'retracing an existing bond does not duplicate it',seed:horizontal,path:[[2,2],[2,3],[2,4]],want:[[2,2,'E'],[2,3,'EW'],[2,4,'W']]},
  {name:'backtracking removes only the new branch',seed:horizontal,path:[[1,3],[2,3],[3,3],[2,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},
  {name:'full backtrack restores the existing node',seed:horizontal,path:[[2,3],[1,3],[2,3]],want:[[2,2,'E'],[2,3,'EW'],[2,4,'W']]},
  {name:'pending tap must not rotate a new branch',seed:horizontal,path:[[2,3],[1,3]],tap:[2,3],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENW'],[2,4,'W']]},

  {name:'existing hydroxyl bond survives carbon crossing',seed:[[2,2,['E']],[2,3,['W','E']],[2,4,['W'],'OH']],path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'ENSW'],[2,4,'W'],[3,3,'N']]},
  {name:'empty-only tracing still creates a bent chain',seed:[],path:[[1,2],[1,3],[2,3]],want:[[1,2,'E'],[1,3,'SW'],[2,3,'N']]},
  {name:'empty-only tracing still closes a ring',seed:[],path:[[1,2],[1,3],[2,3],[2,2],[1,2]],want:[[1,2,'ES'],[1,3,'SW'],[2,2,'EN'],[2,3,'NW']]},
  {name:'starting on isolated carbon replaces dangling arms with hydrogen',seed:[[2,3,['E']]],path:[[2,3],[1,3]],want:[[1,3,'S'],[2,3,'N']]},
  {name:'ending on carbon retains mutual bonds and removes dangling arms',seed:[[2,2,['E']],[2,3,['N','E','S','W']]],path:[[1,3],[2,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'NW']]},
  {name:'crossing removes one-sided arms toward a carbon facing away',seed:[[2,2,['E']],[2,3,['N','E','S','W']],[2,4,['E']],[2,5,['W']]],path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'NSW'],[2,4,'E'],[2,5,'W'],[3,3,'N']]},
  {name:'tracing at board edge removes outward dangling arms',seed:[[0,3,['N','E']]],path:[[0,3],[0,4]],want:[[0,3,'E'],[0,4,'W']]},
  {name:'ring overwrites isolated carbon with only the ring bonds',seed:[[2,3,['N','E','S','W']]],path:[[2,3],[2,4],[3,4],[3,3],[2,3]],want:[[2,3,'ES'],[2,4,'SW'],[3,3,'EN'],[3,4,'NW']]},
  ...['backtrack','cancel','undo'].map(restore => ({name:restore+' restores original dangling arms',seed:[[2,3,['E']]],path:restore==='backtrack'?[[2,3],[1,3],[2,3]]:[[2,3],[1,3]],restore,want:[[2,3,'E']],restored:true,mismatches:[{r:2,c:3,dir:'E',reason:'DANGLING_BOND'}]})),
];
for (const element of ['F','Cl','Br','I','OH']) cases.push({name:'dangling arm cleanup preserves real bond to '+element,seed:[[2,2,['E'],element],[2,3,['N','E','S','W']]],path:[[1,3],[2,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'NW']],elements:['C',element,'C']});
for (const element of ['F','Cl','Br','I','OH']) {
 cases.push(
  {name:element+' crossing replaces panel and preserves original carbon bond',seed:[[2,2,['E']],[2,3,['W'],element]],path:[[1,3],[2,3],[3,3]],want:[[1,3,'S'],[2,2,'E'],[2,3,'NSW'],[3,3,'N']],elements:['C','C','C','C']},
  {name:element+' starting panel is overwritten',seed:[[2,3,['N'],element]],path:[[2,3],[1,3]],want:[[1,3,'S'],[2,3,'N']],elements:['C','C']},
  {name:element+' ending panel is overwritten',seed:[[2,3,['N'],element]],path:[[1,3],[2,3]],want:[[1,3,'S'],[2,3,'N']],elements:['C','C']},
  {name:element+' full backtrack restores original panel',seed:[[2,3,['N'],element]],path:[[2,3],[1,3],[2,3]],want:[[2,3,'']],elements:[element],restored:true},
  {name:element+' removed trace endpoint is restored',seed:[[2,3,['N'],element]],path:[[1,2],[1,3],[2,3],[1,3]],want:[[1,2,'E'],[1,3,'W'],[2,3,'']],elements:['C','C',element],restored:true}
 );
}
// Exercise the same crossings with actual touch events, not only a narrow mouse viewport.
for (const scenario of cases.slice(0,5)) cases.push({...scenario,name:'native touch: '+scenario.name,touch:true});
test('trace integration' , async t => {
 const browser = await chromium.launch({headless:true,executablePath}); t.after(()=>browser.close());
 for (const viewport of [{width:1280,height:900},{width:390,height:844}]) for (const scenario of cases) await t.test(`${viewport.width}: ${scenario.name}`,async()=>{
  const page=await browser.newPage({viewport,hasTouch:!!scenario.touch});
  await serveApp(page,html);
  await page.goto('http://alkane.test/'); await ready(page); await page.evaluate(seed=>window.traceTest.seed(seed),scenario.seed);
  if (scenario.tap) { const [r,c]=scenario.tap; await page.locator(`.cell[data-row="${r}"][data-col="${c}"]`).click(); }
  await drag(page,scenario.path,scenario.restore==='cancel',scenario.touch);
  if (scenario.restore==='undo') await page.getByRole('button',{name:'盤面の操作を1つ戻す',exact:true}).click();
  await page.waitForTimeout(260);
  const actual=await page.evaluate(()=>window.traceTest.read());
  assert.deepEqual(actual.map(p=>[p.r,p.c,p.dirs.join('')]),scenario.want);
  if (scenario.restore!=='undo') assert.ok(actual.filter(p=>p.element==='C' && !scenario.seed.some(([r,c,dirs,element])=>r===p.r&&c===p.c&&element&&element!=='C')).every(p=>p.same),'existing carbons must retain object identity');
  if (scenario.elements) assert.deepEqual(actual.map(p=>p.element),scenario.elements);
  if (scenario.restored && scenario.restore!=='undo') assert.ok(actual.every(p=>p.same),'backtrack must restore original panels');
  assert.deepEqual(await page.evaluate(()=>window.traceTest.mismatches()),scenario.mismatches||[]);
  if (scenario.compound) assert.deepEqual(await page.evaluate(()=>window.traceTest.name()),{ok:true,name:scenario.compound});
  await page.close();
 });
});
