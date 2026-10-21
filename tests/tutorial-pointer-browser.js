async(page)=>{
 const origin=new URL('.',page.url()).href.replace(/\/$/,''),check=(v,m)=>{if(!v)throw Error(m);};
 await page.setViewportSize({width:390,height:844});await page.goto(origin+'/tutorial.html');
 const cell=(r,c)=>page.locator(`[data-row="${r}"][data-col="${c}"]`),point=async el=>{const b=await el.boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2};};
 await page.locator('#palette').scrollIntoViewIfNeeded();
 const from=await point(page.getByRole('button',{name:'Cl',exact:true})),to=await point(cell(2,2));
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:12});await page.mouse.up();check(await cell(2,2).getAttribute('aria-label')==='3行3列 Cl','palette drag');
 await page.locator('#board').scrollIntoViewIfNeeded();let a=await point(cell(2,2)),b=await point(cell(1,2));
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1})));await page.mouse.up();check(await cell(2,2).getAttribute('aria-label')==='3行3列 Cl','trace cancel changed original');check(await cell(1,2).locator('.actual').count()===0,'trace cancel leaked preview');
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(450);check(await page.locator('#ghost').isVisible(),'long press ghost');await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();check(await cell(1,2).getAttribute('aria-label')==='2行3列 Cl','long press move');check(await cell(2,2).locator('.actual').count()===0,'move left source');await page.locator('#undo').click();check(await cell(2,2).getAttribute('aria-label')==='3行3列 Cl','move undo');
 await page.locator('#board').scrollIntoViewIfNeeded();a=await point(cell(2,2));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.waitForTimeout(450);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();check(await cell(2,2).getAttribute('aria-label')==='3行3列 Cl','blur restore');check(await page.locator('#ghost').isHidden(),'blur ghost leak');
 await page.locator('#reset').click();await page.getByRole('button',{name:'Cl',exact:true}).click();await cell(2,2).click();await page.locator('#reset').click();await page.waitForTimeout(300);check(await page.locator('#grid .actual').count()===0,'pending tap leaked through reset');
 // One committed trace is enough to advance. No pending tap may leak into stage 2.
 await page.locator('#board').scrollIntoViewIfNeeded();a=await point(cell(2,2));b=await point(cell(2,4));await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});await page.mouse.up();check(await page.locator('#next').isEnabled(),'completion');await page.locator('#next').click();await page.waitForTimeout(300);check(await page.locator('#grid .actual').count()===3,'stage switch leak');check((await page.locator('#instruction').innerText()).includes('クリア'),'stage gate');
 return{paletteDrag:true,traceCancel:true,longPressMove:true,moveUndo:true,blurRestore:true,pendingReset:true,stageSwitch:true};
}
