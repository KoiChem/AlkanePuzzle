async(page)=>{
 const base=new URL('.',page.url()).href.replace(/\/$/,''),check=(v,m)=>{if(!v)throw Error(m);},results=[];
 await page.setViewportSize({width:390,height:664});
 async function probe(selector){return page.locator(selector).evaluate(grid=>{
  const rect=grid.getBoundingClientRect(),y=rect.top+rect.height/2;
  function send(type,x,y,{count=1,cancelable=true,end=false}={}){const target=document.elementFromPoint(x,y)||document.body,touches=Array.from({length:count},(_,i)=>({identifier:i,target,clientX:x+i,clientY:y}));const e=new Event(type,{bubbles:true,cancelable});Object.defineProperties(e,{touches:{value:end?[]:touches},changedTouches:{value:touches}});target.dispatchEvent(e);return e.defaultPrevented;}
  const edge=send('touchstart',2,y),continued=send('touchmove',100,y);send('touchend',100,y,{end:true});
  const released=send('touchmove',100,y),outside=send('touchstart',2,rect.top-10);send('touchend',2,rect.top-10,{end:true});
  const middle=send('touchstart',150,y);send('touchend',150,y,{end:true});
  const multi=send('touchstart',2,y,{count:2});send('touchend',2,y,{count:2,end:true});
  const noncancelable=send('touchstart',2,y,{cancelable:false});send('touchcancel',2,y,{end:true});
  return{edge,continued,released,outside,middle,multi,noncancelable};
 });}
 for(const path of ['index.html','tutorial.html']){
  await page.goto(base+'/'+path+'?v=20261022-edge1');if(path==='index.html')await page.waitForSelector('#app:not([inert])');const v=await probe('#grid');check(v.edge&&v.continued,'left grid edge not blocked: '+path);check(!v.released&&!v.outside&&!v.middle&&!v.multi&&!v.noncancelable,'overbroad guard: '+JSON.stringify(v));
  await page.evaluate(()=>{const overlay=document.createElement('div');overlay.id='edge-test-overlay';overlay.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(overlay);});check(!(await probe('#grid')).edge,'dialog overlay blocked');await page.locator('#edge-test-overlay').evaluate(e=>e.remove());
  if(path==='index.html'){await page.getByRole('button',{name:'名付ける',exact:true}).click();check(!(await probe('#grid')).edge,'naming mode blocked');await page.getByRole('button',{name:'並べる',exact:true}).click();}
  results.push({path,...v});
 }
 return{results,scopePreserved:true};
}
