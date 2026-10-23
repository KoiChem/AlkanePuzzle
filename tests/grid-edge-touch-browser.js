async(page)=>{
 const base=new URL('.',page.url()).href.replace(/\/$/,''),cdp=await page.context().newCDPSession(page),results=[];
 await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
 try{
  await page.setViewportSize({width:390,height:664});
  for(const file of ['index.html','tutorial.html']){
   await page.goto(base+'/'+file+'?v=20261023-four1');if(file==='index.html')await page.waitForSelector('#app:not([inert])');
   const cells=page.locator('#grid .cell'),first=await cells.nth(14).boundingBox(),end=await cells.nth(16).boundingBox(),y=first.y+first.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:Math.max(first.x+2,18),y,id:1}]});
   for(let x=22;x<=end.x+end.width/2;x+=6)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y,id:1}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(250);
   const count=await page.locator('#grid .cell.filled').count();if(count!==3)throw Error('Edge touch did not draw three carbons: '+file+' '+count);results.push({file,count});
  }
  return{emulatedTouchEdgeDraws:true,results};
 }finally{await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();}
}
