async(page)=>{
 const origin=new URL('.',page.url()).href.replace(/\/$/,''),check=(v,m)=>{if(!v)throw Error(m);};
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 try{
  await page.setViewportSize({width:390,height:664});await page.goto(origin+'/tutorial.html?v=20261021-lemon1');
  const point=async el=>{const b=await el.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};},cell=(r,c)=>page.locator(`[data-row="${r-1}"][data-col="${c-1}"]`);
  const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1,radiusX:2,radiusY:2,force:.5}]:[]});
  async function tap(el){const p=await point(el);await touch('touchStart',p);await touch('touchEnd');}
  async function draw(path){await touch('touchStart',await point(cell(...path[0])));for(const p of path.slice(1))await touch('touchMove',await point(cell(...p)));await touch('touchEnd');}
  async function remove(r,c){const p=await point(cell(r,c));await touch('touchStart',p);await page.waitForTimeout(460);check(await page.locator('#ghost').isVisible(),'touch pickup');await touch('touchMove',{x:386,y:p.y});await touch('touchEnd');check(await cell(r,c).locator('.actual').count()===0,'touch delete');}
  for(let s=0;s<3;s++){if(s>0)await tap(page.locator('#clear'));const paths=await page.evaluate(s=>TutorialSteps.steps[s].tasks.map(t=>t.route.map(([r,c])=>[r+1,c+1])),s);for(const path of paths)await draw(path);check(await page.locator('#next').isEnabled(),'touch stage '+s);await tap(page.locator('#next'));}
  await draw([[3,2],[2,2]]);await draw([[3,2],[4,2]]);await draw([[2,5],[3,5],[4,5]]);check(await page.locator('#next').isDisabled(),'touch cross skipped practice');
  // A canceled long press restores the branch and leaves progression unchanged.
  await touch('touchStart',await point(cell(2,5)));await page.waitForTimeout(460);await touch('touchCancel');check(await cell(2,5).locator('.actual').count()===1,'touchcancel restore');check(await page.locator('#ghost').isHidden(),'touchcancel ghost');
  await remove(2,5);await remove(4,5);await draw([[4,5],[3,5],[2,5]]);check(await page.locator('#next').isEnabled(),'touch redraw completion');
  await tap(page.locator('#next'));await tap(page.getByRole('button',{name:'Cl',exact:true}));for(const p of [[2,2],[4,2],[2,5],[4,5]])await tap(cell(...p));await page.waitForTimeout(270);check(await page.locator('#next').isEnabled(),'touch chlorine');await tap(page.locator('#next'));
  await tap(page.getByRole('button',{name:'I',exact:true}));await tap(cell(2,5));await tap(cell(4,5));await page.waitForTimeout(270);check(await page.locator('#next').isDisabled(),'touch taps counted as drags');
  async function iodine(r,c,cancel=false){await touch('touchStart',await point(page.getByRole('button',{name:'I',exact:true})));await touch('touchMove',await point(cell(r,c)));check((await page.locator('#instruction').innerText()).includes('離そう'),'touch hover');await touch(cancel?'touchCancel':'touchEnd');}
  await iodine(2,5,true);check((await page.locator('#sub-progress').innerText()).includes('0 / 2'),'touch cancel counted');await iodine(4,5);await iodine(2,5);check(await page.locator('#next').isEnabled(),'touch iodine drags incomplete');await page.waitForTimeout(120);
  await page.screenshot({path:'.playwright-mcp/tutorial-revision-touch.png'});
  return{nativeEmulatedTouch:true,crossing:true,longPressDelete:true,cancelRestore:true,redraw:true,iodineDrag:true,iodineCancel:true};
 }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();}
}
