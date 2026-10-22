// CLI fallback for browser engines that the connected Playwright MCP cannot select.
// NODE_PATH must point to an installed Playwright package when it is not local.
const fs=require('node:fs');
const path=require('node:path');
const {chromium,webkit}=require('playwright');
(async()=>{
 const engine=process.argv[2]||'chromium',origin=process.argv[3]||'http://127.0.0.1:8871',motion=process.argv[4]||'no-preference';
 if(!['chromium','webkit'].includes(engine))throw Error('Use chromium or webkit');
 const browser=await ({chromium,webkit}[engine]).launch({headless:true,...(engine==='chromium'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
 try{const page=await browser.newPage();await page.goto(origin+'/tutorial.html');for(const file of ['tutorial-celebration-browser.js','tutorial-guidance-browser.js','tutorial-browser.js','tutorial-pointer-browser.js','tutorial-audio-browser.js',...(engine==='chromium'?['tutorial-touch-browser.js']:[])]){await page.emulateMedia({reducedMotion:motion});const run=eval('('+fs.readFileSync(path.join(__dirname,file),'utf8')+')');console.log(JSON.stringify({engine,motion,file,...await run(page)}));}}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
