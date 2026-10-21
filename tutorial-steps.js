(function(root){
'use strict';
const B=typeof module!=='undefined'&&module.exports?require('./tutorial-board.js'):root.TutorialBoard;
// This is the only conversion from the specification's 1-based coordinates.
const path=points=>points.map(([r,c])=>[r-1,c-1]);
const line=(r,c,n)=>path(Array.from({length:n},(_,i)=>[r,c+i]));
function build(paths,atoms=[]){let g=B.emptyGrid();for(const p of paths)g=B.applyTrace(g,p);for(const[r,c,element]of atoms)g[r-1][c-1]={...g[r-1][c-1],element};return g;}
const propane=line(3,3,3),pentane=line(3,2,5),ethyl=path([[3,4],[2,4],[1,4]]),hexane=line(3,1,6);
const tips=[[2,2],[4,2],[2,5],[4,5]],branches=tips.map(([r,c])=>path([[3,c],[r,c]]));
const ring=path([[2,3],[2,4],[2,5],[3,5],[3,4],[3,3],[2,3]]);
const ringTips=[[1,3],[1,4],[1,5],[4,5],[4,4],[4,3]],ringRoots=[[2,3],[2,4],[2,5],[3,5],[3,4],[3,3]],ringBranches=ringTips.map((p,i)=>path([ringRoots[i],p]));
const replace=(points,elements)=>points.map(([r,c],i)=>[r,c,elements[i]]);
function draw(route,label){return{kind:'trace',route,label};}
function atom([r,c],element){return{kind:'place',cell:[r-1,c-1],element,label:`光っている枝先を${element}に置き換えよう。`};}
const steps=[
 {name:'プロパン',paths:[propane],tasks:[draw(propane,'光っているマスから、3個の炭素をつなごう。')]},
 {name:'3-エチルペンタン',clear:true,paths:[pentane,ethyl],tasks:[draw(pentane,'横に5個の炭素をつないで、ペンタンを描こう。'),draw(ethyl,'中央の炭素から上へ2マスなぞって、枝を追加しよう。')]},
 {name:'ヘキサン',clear:true,paths:[hexane],tasks:[draw(hexane,'左から右へ、6個の炭素をつなごう。')]},
 {name:'2,2,5,5-テトラメチルヘキサン',paths:[hexane,...branches],tasks:branches.map(p=>draw(p,'光っている炭素から外へ1マスなぞって、枝を追加しよう。')),count:'枝'},
 {name:'2,2,5,5-テトラクロロヘキサン',paths:[hexane,...branches],atoms:replace(tips,['Cl','Cl','Cl','Cl']),tasks:tips.map(p=>atom(p,'Cl')),count:'Cl'},
 {name:'2,2-ジクロロ-5,5-ジヨードヘキサン',paths:[hexane,...branches],atoms:replace(tips,['Cl','Cl','I','I']),tasks:tips.slice(2).map(p=>({...atom(p,'I'),kind:'drag'})),count:'ドラッグ'},
 {name:'2-クロロ-5-ヨード-2,5-ヘキサンジオール',paths:[hexane,...branches],atoms:replace(tips,['OH','Cl','OH','I']),tasks:[atom(tips[0],'OH'),atom(tips[2],'OH')],count:'OH'},
 {name:'シクロヘキサン',clear:true,paths:[ring],tasks:[draw(ring,'点線をなぞり、最初の炭素に戻って環を閉じよう。')],note:'長方形に並んだ6個の炭素で、ひとつの環を作ります。'},
 {name:'1,2,3,4,5,6-ヘキサメチルシクロヘキサン',paths:[ring,...ringBranches],tasks:ringBranches.map(p=>draw(p,'環の炭素から外へ1マスなぞって、枝を追加しよう。')),count:'枝'},
 {name:'1,2,3,4,5,6-ヘキサクロロシクロヘキサン',paths:[ring,...ringBranches],atoms:replace(ringTips,Array(6).fill('Cl')),tasks:ringTips.map(p=>atom(p,'Cl')),count:'Cl'},
 {name:'2,4,6-トリクロロ-1,3,5-シクロヘキサントリオール',paths:[ring,...ringBranches],atoms:replace(ringTips,['OH','Cl','OH','Cl','OH','Cl']),tasks:[0,2,4].map(i=>atom(ringTips[i],'OH')),count:'OH'}
].map(s=>({...s,target:build(s.paths,s.atoms)}));
const api={steps};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.TutorialSteps=api;
})(typeof window!=='undefined'?window:globalThis);
