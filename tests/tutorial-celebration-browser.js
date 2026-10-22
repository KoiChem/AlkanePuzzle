async(page)=>{
 const base=new URL('.',page.url()).href.replace(/\/$/,''),check=(v,m)=>{if(!v)throw Error(m);},results=[];
 const point=async(r,c)=>{const b=await page.locator(`[data-row="${r}"][data-col="${c}"]`).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
 async function draw(r,a,b){const from=await point(r,a),to=await point(r,b);await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();}
 const visible=()=>page.locator('.particle').evaluateAll(es=>es.filter(e=>getComputedStyle(e).display!=='none').map(e=>{const s=getComputedStyle(e);return{animation:s.animationName,transform:s.transform,opacity:+s.opacity,width:e.getBoundingClientRect().width,clip:s.clipPath};}));
 for(const mode of ['reduce','no-preference']){
  await page.emulateMedia({reducedMotion:mode});await page.setViewportSize({width:390,height:664});await page.goto(base+'/tutorial.html?v=20261022-stars1');await draw(2,2,4);await page.waitForTimeout(280);
  const a=await visible();check(a.length===(mode==='reduce'?8:38),'success decoration invisible or wrong count: '+mode+' '+a.length);check(a.every(e=>e.opacity>0&&e.width>0),'success decoration transparent');
  if(mode==='reduce'){check(a.every(e=>e.animation==='star-fade'&&e.clip!=='none'),'reduced celebration is not stars');await page.waitForTimeout(330);const b=await visible();check(a.every((e,i)=>e.transform===b[i].transform),'reduced stars moved');}
  await page.waitForTimeout(1300);check(await page.locator('.particle').count()===0,'particles leaked');check((await page.locator('#praise').innerText()).includes('完成'),'completion praise lost');
  await page.locator('#next').click();await page.locator('#clear').click();await draw(2,1,5);await page.waitForTimeout(250);check((await visible()).length===(mode==='reduce'?8:16),'small success missing');await page.locator('#undo').click();check(await page.locator('.particle').count()===0,'undo failed to clean up');results.push({mode,bigAndSmall:true,visible:true});
 }
 await page.emulateMedia({reducedMotion:'no-preference'});return{results,reducedStarsStationary:true,cleanup:true};
}
