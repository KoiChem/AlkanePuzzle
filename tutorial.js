(function(root){
'use strict';
const common=typeof module!=='undefined'&&module.exports;
const B=common?require('./tutorial-board.js'):root.TutorialBoard;
const {steps}=common?require('./tutorial-steps.js'):root.TutorialSteps;
class TutorialSession{
 constructor(){this.restart();}
 restart(){this.index=0;this.grid=B.emptyGrid();this.begin();}
 begin(){this.start=B.clone(this.grid);this.clearPending=!!steps[this.index].clear;this.initialClear=this.clearPending;this.recoverySuggested=false;this.history=[];}
 get complete(){const s=steps[this.index];return !this.clearPending&&B.matches(this.grid,s.target)&&B.generateName(this.grid).name===s.name;}
 edit(next,kind){if(B.signature(next)===B.signature(this.grid)&&!(kind==='clear'&&this.clearPending))return;this.history.push({grid:B.clone(this.grid),clearPending:this.clearPending,recoverySuggested:this.recoverySuggested});this.grid=B.clone(next);if(kind==='clear'){this.recoverySuggested=!this.clearPending&&!this.initialClear&&this.start.some(row=>row.some(Boolean));this.clearPending=false;}}
 undo(){const previous=this.history.pop();if(previous){this.grid=B.clone(previous.grid);this.clearPending=previous.clearPending;this.recoverySuggested=previous.recoverySuggested;}}
 reset(){this.grid=B.clone(this.start);this.clearPending=this.initialClear;this.recoverySuggested=false;this.history=[];}
 next(){if(!this.complete||this.index===steps.length-1)return false;this.index++;this.begin();return true;}
}
if(common){module.exports={TutorialSession};return;}
root.TutorialSession=TutorialSession;
const session=new TutorialSession(),$=id=>document.getElementById(id);
const cells=[],paletteButtons=[];let selected=null,gesture=null,pending=null,tapCount=0,tapKey='',preview=null;
const labels=['','末端の炭素','直線の炭素','角の炭素','枝分かれの炭素','四方向の炭素'];
function taskDone(task,g){
 if(task.kind==='place'){const[r,c]=task.cell;return g[r][c]?.element===task.element&&B.getBondDirections(g,r,c).size===1;}
 return task.route.every(([r,c],i)=>{if(!g[r][c]||(g[r][c].element||'C')!=='C')return false;return [task.route[i-1],task.route[i+1]].filter(Boolean).every(([nr,nc])=>{const d=Object.keys(B.DELTA).find(d=>r+B.DELTA[d][0]===nr&&c+B.DELTA[d][1]===nc);return d&&B.getBondDirections(g,r,c).has(d)&&B.getBondDirections(g,nr,nc).has(B.OPPOSITE[d]);});});
}
function guidance(g){
 const step=steps[session.index];if(session.clearPending)return{message:'「クリア」を押して、次の構造を描く準備をしよう。',count:'クリア待ち'};
 const done=step.tasks.map(t=>taskDone(t,g)),task=step.tasks[done.indexOf(false)];
 const count=step.count?`${step.count}：${done.filter(Boolean).length} / ${step.tasks.length}`:`操作：${done.filter(Boolean).length} / ${step.tasks.length}`;
 if(!gesture&&!pending&&session.complete)return{message:session.index===10?'チュートリアル完了！ 練習でも描いてみよう。':'できた！ 名前と構造を見比べてから「次へ」。',count:'完成',complete:true};
 if(session.recoverySuggested)return{message:'「この段階をやり直す」で、置き換える前の構造に戻そう。',count:'構造を戻そう'};
 for(let r=0;r<5;r++)for(let c=0;c<7;c++){
  const p=g[r][c],target=step.target[r][c];if(!p)continue;
  if(!target)return{message:'見本の外にパネルがあるよ。「戻す」で修正してみよう。',count,task,error:[r,c]};
  const dirs=B.getBondDirections(g,r,c),want=B.getBondDirections(step.target,r,c);
  if([...dirs].some(d=>!want.has(d)))return{message:'見本にない向きに線があるよ。「戻す」で修正してみよう。',count,task,error:[r,c]};
  const el=p.element||'C',old=session.start[r][c]?.element||'C';
  if(el!==(target.element||'C')&&el!==old)return{message:`この場所は${target.element||'炭素'}だよ。「戻す」で修正してみよう。`,count,task,error:[r,c]};
 }
 if(!task)return{message:'足りない結合がないか、薄い見本と見比べよう。',count};
 return{message:task.kind==='place'&&selected?.element!==task.element?`上のデッキで${task.element}を選ぼう。`:task.label,count,task};
}
function render(){
 const step=steps[session.index],g=preview||session.grid,guide=guidance(g),active=new Set();
 if(guide.task){if(guide.task.cell)active.add(guide.task.cell.join(','));else guide.task.route.forEach(p=>active.add(p.join(',')));}
 $('step-number').textContent=`${session.index+1} / 11`;$('target-name').textContent=step.name;
 $('instruction').textContent=guide.message;$('sub-progress').textContent=guide.count;
 $('note').textContent=step.note||'薄い見本に重ねて描こう。なぞる向きは、どちらからでも大丈夫。';
 $('instruction').classList.toggle('success',!!guide.complete);
 $('clear').classList.toggle('suggested',session.clearPending);
 $('undo').disabled=!session.history.length||!!gesture||!!pending;
 $('next').disabled=!session.complete||!!gesture||!!pending;$('next').hidden=session.index===10;
 $('restart').hidden=!(session.index===10&&session.complete);
 for(let r=0;r<5;r++)for(let c=0;c<7;c++){
  const el=cells[r][c],p=g[r][c],target=step.target[r][c],key=`${r},${c}`;
  el.className='cell'+(p?' filled':'')+(active.has(key)&&!session.clearPending?' guided':'')+(guide.error?.join(',')===key?' error':'');
  el.innerHTML=(target&&!session.clearPending?`<span class="goal" aria-hidden="true">${B.icon(target,step.target,r,c)}</span>`:'')+(p?`<span class="actual" aria-hidden="true">${B.icon(p,g,r,c)}</span>`:'');
  el.setAttribute('aria-label',`${r+1}行${c+1}列 ${p?(p.element||'炭素'):'空欄'}`);
 }
 const overlay=$('route');overlay.replaceChildren();
 if(guide.task?.route&&!session.clearPending){const box=$('board').getBoundingClientRect();const points=guide.task.route.map(([r,c])=>{const cell=cells[r][c].getBoundingClientRect();return[(cell.left+cell.width/2-box.left)*700/box.width,(cell.top+cell.height/2-box.top)*500/box.height];});overlay.innerHTML=`<polyline points="${points.map(p=>p.join(',')).join(' ')}"/><circle cx="${points[0][0]}" cy="${points[0][1]}" r="30"/><text x="${points[0][0]}" y="${points[0][1]+8}">始</text>`;}
 paletteButtons.forEach(({button,panel})=>{button.setAttribute('aria-pressed',String(!!selected&&selected.type===panel.type&&selected.element===panel.element));button.classList.toggle('suggested',guide.task?.kind==='place'&&guide.task.element===panel.element&&selected?.element!==panel.element);});
}
function commit(g,kind){preview=null;session.edit(g,kind);render();}
function cancel(){if(pending)clearTimeout(pending);pending=null;tapCount=0;tapKey='';if(gesture?.timer)clearTimeout(gesture.timer);gesture=null;preview=null;$('ghost').hidden=true;render();}
function cellAt(x,y){const cell=document.elementFromPoint(x,y)?.closest('[data-cell]');return cell?[Number(cell.dataset.row),Number(cell.dataset.col)]:null;}
function ghost(panel,x,y){const el=$('ghost');el.innerHTML=B.icon(panel);el.style.left=`${x}px`;el.style.top=`${y}px`;el.hidden=false;}
function tap(r,c){
 const key=`${r},${c}`;if(pending&&tapKey!==key){clearTimeout(pending);pending=null;performTap();}
 tapCount=tapKey===key?tapCount+1:1;tapKey=key;if(pending)clearTimeout(pending);
 pending=setTimeout(()=>{pending=null;performTap();},240);render();
}
function performTap(){
 if(!tapKey)return;const[r,c]=tapKey.split(',').map(Number),n=tapCount;tapKey='';tapCount=0;const g=B.clone(session.grid),p=g[r][c];
 if(n>=3)g[r][c]=null;
 else if(selected)g[r][c]={...selected};
 else if(p&&(p.element||'C')==='C')p.rotation=(p.rotation+(n===2?270:90))%360;
 commit(g,'tap');
}
function start(event,source,panel){
 if(!event.isPrimary||event.button!==0||gesture)return;
 // Keep same-cell taps together; commit a completed tap before another target.
 if(pending){clearTimeout(pending);pending=null;if(!source||tapKey!==source.join(','))performTap();}
 event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
 gesture={id:event.pointerId,x:event.clientX,y:event.clientY,source,panel,base:B.clone(session.grid),path:source?[source]:[],mode:'waiting'};
 if(source&&session.grid[source[0]][source[1]]){const current=gesture;gesture.timer=setTimeout(()=>{if(gesture!==current||gesture.mode!=='waiting')return;gesture.mode='move';preview=B.clone(gesture.base);preview[source[0]][source[1]]=null;ghost(gesture.panel,event.clientX,event.clientY);render();},420);}
 render();
}
function extendTrace(g,target){
 if(!target||g.closed)return;let last=g.path.at(-1);if(last[0]===target[0]&&last[1]===target[1])return;
 if(last[0]!==target[0]&&last[1]!==target[1])return;
 const dr=Math.sign(target[0]-last[0]),dc=Math.sign(target[1]-last[1]);
 while(last[0]!==target[0]||last[1]!==target[1]){
  const next=[last[0]+dr,last[1]+dc],index=g.path.findIndex(p=>p[0]===next[0]&&p[1]===next[1]);
  if(index===0&&g.path.length>=4){g.path.push(next);g.closed=true;break;}
  if(index>=0)g.path=g.path.slice(0,index+1);else g.path.push(next);last=g.path.at(-1);
 }
 preview=B.applyTrace(g.base,g.path);
}
function move(event){
 const g=gesture;if(!g||event.pointerId!==g.id)return;event.preventDefault();
 if(g.mode==='waiting'&&Math.hypot(event.clientX-g.x,event.clientY-g.y)>8){clearTimeout(g.timer);g.mode=g.source?'trace':'new';tapCount=0;tapKey='';if(g.mode==='trace')selected=null;}
 if(g.mode==='trace')extendTrace(g,cellAt(event.clientX,event.clientY));
 else if(g.mode==='move'||g.mode==='new')ghost(g.panel,event.clientX,event.clientY);
 render();
}
function finish(event){
 const g=gesture;if(!g||event.pointerId!==g.id)return;clearTimeout(g.timer);gesture=null;$('ghost').hidden=true;
 if(g.mode==='waiting'){preview=null;if(g.source)tap(...g.source);else{selected=selected&&selected.type===g.panel.type&&selected.element===g.panel.element?null:{...g.panel};render();}return;}
 if(g.mode==='trace'){commit(preview||g.base,'trace');return;}
 const target=cellAt(event.clientX,event.clientY),next=B.clone(g.base);
 if(g.mode==='move')next[g.source[0]][g.source[1]]=null;
 if(target)next[target[0]][target[1]]={...g.panel};
 commit(next,g.mode==='move'?'move':'place');
}
for(let r=0;r<5;r++){cells[r]=[];for(let c=0;c<7;c++){
 const cell=document.createElement('button');cell.type='button';cell.className='cell';cell.dataset.cell='';cell.dataset.row=r;cell.dataset.col=c;
 cell.addEventListener('pointerdown',e=>start(e,[r,c],session.grid[r][c]));
 cell.addEventListener('click',e=>{if(e.detail===0){if(selected){const g=B.clone(session.grid);g[r][c]={...selected};commit(g,'place');}else tap(r,c);}});
 $('grid').append(cell);cells[r][c]=cell;
}}
const undo=$('undo');
const atomRow=$('atom-row'),carbonRow=$('carbon-row');
for(const panel of [...['F','Cl','Br','I','OH'].map(element=>({type:1,rotation:0,element})),...[1,2,3,4,5].map(type=>({type,rotation:type===2?90:0,element:'C'}))]){
 const button=document.createElement('button');button.type='button';button.className='palette-card';button.setAttribute('aria-label',panel.element==='C'?labels[panel.type]:panel.element);button.title=button.getAttribute('aria-label');button.innerHTML=B.icon(panel);
 button.addEventListener('pointerdown',e=>start(e,null,panel));button.addEventListener('click',e=>{if(e.detail===0){cancel();selected=selected?.type===panel.type&&selected?.element===panel.element?null:{...panel};render();}});
 (panel.element==='C'?carbonRow:atomRow).append(button);paletteButtons.push({button,panel});
}
window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);
window.addEventListener('resize',render);
window.addEventListener('pointercancel',event=>{if(!gesture||event.pointerId===gesture.id)cancel();});window.addEventListener('blur',cancel);
window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
$('undo').addEventListener('click',()=>{cancel();session.undo();render();});
$('clear').addEventListener('click',()=>{cancel();selected=null;commit(B.emptyGrid(),'clear');});
$('reset').addEventListener('click',()=>{cancel();selected=null;session.reset();render();});
$('next').addEventListener('click',()=>{cancel();selected=null;session.next();render();});
$('restart').addEventListener('click',()=>{cancel();selected=null;session.restart();render();});
$('board').addEventListener('contextmenu',e=>e.preventDefault());
$('palette').addEventListener('contextmenu',e=>e.preventDefault());
render();
})(typeof window!=='undefined'?window:globalThis);
