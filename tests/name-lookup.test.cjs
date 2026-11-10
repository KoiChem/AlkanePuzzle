const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function load(fetch){const context={window:{},fetch,AbortSignal,Map,Set};vm.runInNewContext(fs.readFileSync('name-lookup.js','utf8'),context);return context.window.NameLookup;}
function graph(elements,edges){const ids=elements.map((_,i)=>String(i));return {nodeIds:ids,elements:new Map(ids.map((id,i)=>[id,elements[i]])),adjacency:new Map(ids.map(id=>[id,new Set(edges.flatMap(([a,b])=>String(a)===id?[String(b)]:String(b)===id?[String(a)]:[]))]))};}
test('branch, OH, halogen and ring closure retain graph',()=>{const api=load();assert.equal(api.smiles(graph(['C','C','OH','Cl'],[[0,1],[0,2],[0,3]])),'C(C)(O)(Cl)');assert.equal(api.smiles(graph(['C','C','C','C'],[[0,1],[1,2],[2,3],[3,0]])),'C1(C(C(C1)))');});
test('Japanese name and reuse avoid new requests',async()=>{let calls=0;const api=load(async url=>{calls++;return {ok:true,status:200,json:async()=>url.includes('wikidata')?{results:{bindings:[{name:{value:'日本語名'},item:{value:'http://www.wikidata.org/entity/Q1'}}]}}:{PropertyTable:{Properties:[{CID:1,IUPACName:'english'}]}}};});assert.equal((await api.lookup('C')).name,'日本語名');await api.lookup('C');assert.equal(calls,2);});
test('Japanese failure falls back; not found differs from network failure',async()=>{const api=load(async url=>{if(url.includes('wikidata'))throw Error('offline');return {ok:true,status:200,json:async()=>({PropertyTable:{Properties:[{CID:2,IUPACName:'english'}]}})};});assert.equal((await api.lookup('CC')).name,'english');assert.equal(await load(async()=>({status:404})).lookup('C'),null);await assert.rejects(load(async()=>{throw Error('offline')}).lookup('C'));});
