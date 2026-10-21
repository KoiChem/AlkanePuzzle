async(page)=>{
 const origin=new URL('.',page.url()).href.replace(/\/$/,''),check=(v,m)=>{if(!v)throw Error(m);};
 await page.addInitScript(()=>{
  window.audioEvidence={oscillators:0,buffers:0,storage:[],contexts:[]};
  const Native=window.AudioContext||window.webkitAudioContext;
  if(Native){function Observed(...args){const ctx=new Native(...args);audioEvidence.contexts.push(ctx);for(const [name,key]of [['createOscillator','oscillators'],['createBufferSource','buffers']]){const original=ctx[name].bind(ctx);ctx[name]=(...args)=>{audioEvidence[key]++;return original(...args);};}return ctx;}Observed.prototype=Native.prototype;window.AudioContext=Observed;}
  for(const name of ['getItem','setItem']){const original=Storage.prototype[name];Storage.prototype[name]=function(key,...args){audioEvidence.storage.push({name,key});return original.call(this,key,...args);};}
 });
 await page.setViewportSize({width:390,height:664});await page.goto(origin+'/tutorial.html');
 check(await page.locator('#sound-toggle').getAttribute('aria-pressed')==='true','default sound off');
 await page.getByRole('button',{name:'Cl',exact:true}).click();await page.waitForTimeout(200);
 const initial=await page.evaluate(()=>({osc:audioEvidence.oscillators,buffers:audioEvidence.buffers,running:audioEvidence.contexts.some(ctx=>ctx.state==='running')}));check(initial.osc>0&&initial.buffers>0&&initial.running,'audio nodes not running');
 await page.locator('#sound-toggle').click();check(await page.locator('#sound-toggle').getAttribute('aria-pressed')==='false','mute state');
 const muted=await page.evaluate(()=>audioEvidence.oscillators);await page.getByRole('button',{name:'I',exact:true}).click();await page.locator('#clear').click();await page.waitForTimeout(200);check(await page.evaluate(()=>audioEvidence.oscillators)===muted,'muted audio scheduled');
 await page.locator('#sound-toggle').click();await page.waitForTimeout(200);check(await page.evaluate(()=>audioEvidence.oscillators)>muted,'unmute did not resume');
 await page.evaluate(async()=>{for(const ctx of audioEvidence.contexts)if(ctx.state==='running')await ctx.suspend();});await page.getByRole('button',{name:'OH',exact:true}).click();await page.waitForTimeout(200);check(await page.evaluate(()=>audioEvidence.contexts.some(ctx=>ctx.state==='running')),'suspended audio did not resume');
 check(await page.evaluate(()=>audioEvidence.storage.length)===0,'tutorial accessed persistent settings');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#reset').click();check(await page.locator('.hint-pulse').evaluateAll(els=>els.length>0&&els.every(e=>getComputedStyle(e).animationName==='none'&&getComputedStyle(e).backgroundColor!=='rgba(0, 0, 0, 0)')),'reduced-motion hint missing or moving');
 const point=async c=>{const b=await page.locator(`[data-row="2"][data-col="${c}"]`).boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};let a=await point(2),b=await point(4);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();
 check(await page.locator('#praise').evaluate(e=>getComputedStyle(e).opacity)==='1','reduced-motion success invisible');check(await page.locator('#next').isEnabled(),'success not complete');
 const praise=await page.locator('#praise').innerText();check(praise.includes('完成'),'completion praise missing');await page.setViewportSize({width:320,height:568});check(await page.locator('#praise').innerText()===praise,'resize cleared praise');
 await page.waitForTimeout(1600);check((await page.locator('#praise').innerText()).includes('完成'),'completed praise not retained');check(await page.locator('.particle').count()===0,'completed particles not cleared');await page.locator('#reset').click();check(await page.locator('#praise').innerText()==='','reset praise not cleared');await page.emulateMedia({reducedMotion:'no-preference'});
 return{audioNodesRunning:initial,mute:true,unmute:true,suspendRecovery:true,noPersistentSettings:true,reducedMotion:true};
}
