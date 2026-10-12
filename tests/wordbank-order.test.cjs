const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const test=require('node:test');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const start=html.indexOf('  function buildWordBank() {');
const builder=html.slice(start,html.indexOf('  // ============================================================',start));
function element(){return {children:[],className:'',classList:{add(){},remove(){}},appendChild(child){this.children.push(child);},append(...children){this.children.push(...children);},addEventListener(){}};}
for(const enabled of [true,false])test(`alcohol suffix is last in original wordbank, alcohol=${enabled}`,()=>{
 const bank=element(),noop=()=>{};
 const context={document:{getElementById:()=>bank,createElement:element},observeAnswerPreviewSize:noop,undoGame2Answer:noop,submitGame2Answer:noop,updateAnswerUndoButton:noop,bindWordBankTokenDrag:noop,ALCOHOL_TOKEN:'オール',CYCLO_TOKEN:'シクロ',mainChainTokensForCurrentDifficulty:()=>({numberTokens:['1','2'],baseNameTokens:['メタン','エタン','プロパン']}),multiplierTokensForCurrentDifficulty:()=>['ジ','トリ'],shuffle:tokens=>[...tokens].reverse(),orderWordBankRows:rows=>[...rows].reverse(),game2SettingsForCurrentDifficulty:()=>({alcoholEnabled:enabled})};
 vm.runInNewContext(builder+'buildWordBank();',context);
 const rows=bank.children.find(e=>e.className==='token-scroll').children;
 const names=rows.find(e=>e.className==='row cat-basename').children.map(e=>e.textContent);
 assert.equal(names[0],'シクロ');assert.equal(names.filter(t=>t==='オール').length,enabled?1:0);
 if(enabled)assert.equal(names.at(-1),'オール');
 assert.deepEqual(names.filter(t=>!['シクロ','オール'].includes(t)),['プロパン','エタン','メタン']);
});
