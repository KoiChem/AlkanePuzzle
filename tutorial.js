(function(root){
'use strict';
const common=typeof module!=='undefined'&&module.exports;
const B=common?require('./tutorial-board.js'):root.TutorialBoard;
const {steps}=common?require('./tutorial-steps.js'):root.TutorialSteps;
function taskDone(task,g){
 if(task.kind==='place'||task.kind==='drag'){const[r,c]=task.cell;return g[r][c]?.element===task.element&&B.getBondDirections(g,r,c).size===1;}
 return task.route.every(([r,c],i)=>{if(!g[r][c]||(g[r][c].element||'C')!=='C')return false;return [task.route[i-1],task.route[i+1]].filter(Boolean).every(([nr,nc])=>{const d=Object.keys(B.DELTA).find(d=>r+B.DELTA[d][0]===nr&&c+B.DELTA[d][1]===nc);return d&&B.getBondDirections(g,r,c).has(d)&&B.getBondDirections(g,nr,nc).has(B.OPPOSITE[d]);});});
}
const crossPath=[[1,4],[2,4],[3,4]];
const samePoint=(a,b)=>!!a&&!!b&&a[0]===b[0]&&a[1]===b[1];
const rowsFor=i=>i===0?[2]:i===1?[0,1,2]:i<7?[1,2,3]:[0,1,2,3];
class TutorialSession{
 constructor(){this.restart();}
 restart(){this.index=0;this.grid=B.emptyGrid();this.begin();}
 begin(){this.start=B.clone(this.grid);this.clearPending=!!steps[this.index].clear;this.initialClear=this.clearPending;this.recoverySuggested=false;this.exercise={cross:false,deleted:[false,false],redraw:false};this.dragged=steps[this.index].tasks.map(()=>false);this.history=[];}
 get exerciseDone(){return [taskDone(steps[3].tasks[0],this.grid),taskDone(steps[3].tasks[1],this.grid),this.exercise.cross,...this.exercise.deleted,this.exercise.redraw];}
 get taskProgress(){return this.index===3?this.exerciseDone:steps[this.index].tasks.map((t,i)=>t.kind==='drag'?this.dragged[i]:taskDone(t,this.grid));}
 get visibleRows(){return [...new Set([...rowsFor(this.index),...(this.clearPending&&this.index?rowsFor(this.index-1):[])])].sort((a,b)=>a-b);}
 get complete(){const s=steps[this.index];return !this.clearPending&&this.taskProgress.every(Boolean)&&B.matches(this.grid,s.target)&&B.generateName(this.grid).name===s.name;}
 snapshot(){return{grid:B.clone(this.grid),clearPending:this.clearPending,recoverySuggested:this.recoverySuggested,exercise:structuredClone(this.exercise),dragged:this.dragged.slice()};}
 edit(next,kind,operation={}){
  const before=this.snapshot(),ex=this.exercise;
  if(this.index===3&&!this.clearPending){
   const path=operation.path||[],cross=kind==='trace'&&path.length===3&&(path.every((p,i)=>samePoint(p,crossPath[i]))||path.every((p,i)=>samePoint(p,crossPath[2-i])))&&[...crossPath,[2,3],[2,5]].every(([r,c])=>{const p=next[r][c],actual=[...B.getBondDirections(next,r,c)].sort().join(''),wanted=[...B.getBondDirections(steps[3].target,r,c)].sort().join('');return p&&(p.element||'C')==='C'&&actual===wanted;});
   if(cross){if(!ex.cross)ex.cross=true;else if(ex.deleted.every(Boolean))ex.redraw=true;}
   if(ex.cross&&kind==='move'&&operation.target===null){
    for(const [i,point]of [[0,[1,4]],[1,[3,4]]]){
     const [r,c]=point,expected=B.clone(this.grid);expected[r][c]=null;
     if(samePoint(operation.source,point)&&this.grid[r][c]&&(this.grid[r][c].element||'C')==='C'&&B.signature(next)===B.signature(expected))ex.deleted[i]=true;
    }
   }
  }
  if(!this.clearPending&&kind==='place'&&operation.fromPalette){steps[this.index].tasks.forEach((task,i)=>{if(task.kind==='drag'&&operation.element===task.element&&samePoint(operation.target,task.cell)&&taskDone(task,next))this.dragged[i]=true;});}
  const changed=JSON.stringify(before.dragged)!==JSON.stringify(this.dragged)||B.signature(next)!==B.signature(this.grid)||JSON.stringify(before.exercise)!==JSON.stringify(ex)||(kind==='clear'&&this.clearPending);
  if(!changed)return false;
  this.history.push(before);this.grid=B.clone(next);
  if(kind==='clear'){this.recoverySuggested=!this.clearPending&&!this.initialClear&&this.start.some(row=>row.some(Boolean));this.clearPending=false;}
  return true;
 }
 undo(){const previous=this.history.pop();if(previous)Object.assign(this,structuredClone(previous));}
 reset(){this.grid=B.clone(this.start);this.clearPending=this.initialClear;this.recoverySuggested=false;this.exercise={cross:false,deleted:[false,false],redraw:false};this.dragged=steps[this.index].tasks.map(()=>false);this.history=[];}
 next(){if(!this.complete||this.index===steps.length-1)return false;this.index++;this.begin();return true;}
}
if(common){module.exports={TutorialSession};return;}
root.TutorialSession=TutorialSession;
const session=new TutorialSession(),$=id=>document.getElementById(id),audio=root.TutorialAudio;
let celebrationTimer;
const exerciseTasks=[...steps[3].tasks.slice(0,2),{kind:'trace',route:crossPath,label:'上下を一筆でなぞろう。逆向きでもOK。'},{kind:'delete',cell:[1,4],label:'上の枝先を長押しし、枠の外で離そう。'},{kind:'delete',cell:[3,4],label:'下の枝先も長押しし、枠の外で離そう。'},{kind:'trace',route:crossPath,label:'もう一度、上下を一筆でつなごう！'}];
const cells=[],paletteButtons=[];let selected=null,gesture=null,pending=null,tapCount=0,tapKey='',preview=null;
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
let swipeKey='',swipeAnimations=[],windowActive=true;
const labels=['','末端の炭素','直線の炭素','角の炭素','枝分かれの炭素','四方向の炭素'];
function guidance(g){
 const step=steps[session.index];if(session.clearPending)return{message:'「クリア」を押して、次の構造を描く準備をしよう。',count:'クリア待ち'};
 const tasks=session.index===3?exerciseTasks:step.tasks;
 const done=session.taskProgress,task=tasks[done.indexOf(false)];
 const count=`${session.index===3?'操作':step.count||'操作'}：${done.filter(Boolean).length} / ${tasks.length}`;
 if(!gesture&&!pending&&session.complete)return{message:session.index===10?'チュートリアル完了！ 練習でも描いてみよう。':'完成！ 名前と構造を見比べてから「次へ」。',count:'完成',complete:true};
 if(session.recoverySuggested)return{message:'「やり直す」で、元の構造に戻そう。',count:'構造を戻そう'};
 for(let r=0;r<5;r++)for(let c=0;c<7;c++){
  const p=g[r][c],target=step.target[r][c];if(!p)continue;
  if(!target)return{message:'見本の外にパネルがあるよ。「戻す」で直そう。',count,task,error:[r,c]};
  const dirs=B.getBondDirections(g,r,c),want=B.getBondDirections(step.target,r,c);
  if([...dirs].some(d=>!want.has(d)))return{message:'余分な線があるよ。「戻す」で直そう。',count,task,error:[r,c]};
  const el=p.element||'C',old=session.start[r][c]?.element||'C';
  if(el!==(target.element||'C')&&el!==old)return{message:`この場所は${target.element||'炭素'}だよ。「戻す」で修正してみよう。`,count,task,error:[r,c]};
 }
 if(task?.kind==='drag'){const moving=gesture?.mode==='new'&&gesture.panel?.element===task.element,hover=moving&&steps[session.index].tasks.some((t,i)=>!done[i]&&samePoint(t.cell,gesture.target));return{message:moving?(hover?'ここで指を離そう！':'そのまま青い枠まで運ぼう。'):g[task.cell[0]][task.cell[1]]?.element===task.element?'今度はIパネルを、同じ場所へドラッグしてみよう。':'Iパネルを押したまま、青く光るClへ運ぼう。',count,task,hover};}
 if(session.index===3&&task?.kind==='trace'&&task.route===crossPath&&taskDone(task,g))return{message:'上下を一度につなぐように、もう一度なぞろう。',count,task};
 if(task?.kind==='delete'&&!g[task.cell[0]][task.cell[1]])return{message:'「戻す」で枝を戻し、長押しで消そう。',count,task};
 if(!task)return{message:'足りない結合がないか、薄い見本と見比べよう。',count};
 return{message:task.kind==='place'&&selected?.element!==task.element?`上のデッキで${task.element}を選ぼう。`:task.label,count,task};
}
// A shared timeline keeps every passed cell lit until the whole route resets.
function syncSwipeHint(route,paused){
 const key=route?JSON.stringify(route)+'/'+reducedMotion.matches:'';
 if(key!==swipeKey){
  swipeAnimations.forEach(a=>a.cancel());swipeAnimations=[];swipeKey=key;
  if(route&&!reducedMotion.matches){
   const points=route.filter((p,i)=>route.findIndex(q=>samePoint(p,q))===i),end=(points.length-1)*450+650,duration=end+500,start=document.timeline.currentTime;
   const off={backgroundColor:'#fffdf6',borderColor:'#d8d3c0',boxShadow:'none'},on={backgroundColor:'#FFF44F',borderColor:'#8F7C00',boxShadow:'inset 0 0 0 2px #FFF44F, 0 0 7px #FFF44FAA'};
   points.forEach(([r,c],i)=>{const frames=[...(i?[{...off,offset:0,easing:'steps(1,end)'}]:[]),{...on,offset:i*450/duration,easing:'steps(1,end)'},{...off,offset:end/duration,easing:'steps(1,end)'},{...off,offset:1}];const animation=cells[r][c].animate(frames,{duration,iterations:Infinity});animation.startTime=start;swipeAnimations.push(animation);});
  }
 }
 swipeAnimations.forEach(a=>{if(paused&&a.playState!=='paused'){a.pause();a.currentTime=a.currentTime??0;}else if(!paused&&a.playState==='paused')a.play();});
}
function render(){
 const step=steps[session.index],g=preview||session.grid,guide=guidance(g),active=new Set(),rows=session.visibleRows;
 const validPaletteDrag=guide.task?.kind==='drag'&&gesture?.mode==='new'&&gesture.panel?.element===guide.task.element;
 $('board').style.setProperty('--rows',rows.length);
 $('route').setAttribute('viewBox',`0 0 700 ${rows.length*100}`);
 if(guide.task){if(guide.task.cell)active.add(guide.task.cell.join(','));else guide.task.route.forEach(p=>active.add(p.join(',')));}
 $('step-number').textContent=`${session.index+1} / 11`;$('target-name').textContent=step.name;
 $('instruction').textContent=guide.message;$('sub-progress').textContent=guide.count;
 $('instruction').classList.toggle('success',!!guide.complete);
 $('clear').classList.toggle('suggested',session.clearPending);
 $('undo').disabled=!session.history.length||!!gesture||!!pending;
 $('next').disabled=!session.complete||!!gesture||!!pending;$('next').hidden=session.index===10;
 $('restart').hidden=!(session.index===10&&session.complete);
 $('next').classList.toggle('suggested',session.complete&&!gesture&&!pending&&session.index!==10);
 $('restart').classList.toggle('suggested',session.complete&&!gesture&&!pending&&session.index===10);
 for(let r=0;r<5;r++)for(let c=0;c<7;c++){
  const el=cells[r][c],p=g[r][c],target=step.target[r][c],key=`${r},${c}`;
  el.hidden=!rows.includes(r);
  const isTarget=guide.task?.kind==='drag'&&((active.has(key))||(validPaletteDrag&&step.tasks.some((t,i)=>!session.taskProgress[i]&&samePoint(t.cell,[r,c])&&samePoint(gesture.target,[r,c]))));
  const pulse=guide.task?.route?samePoint(guide.task.route[0],[r,c]):guide.task?.kind==='delete'||guide.task?.kind==='place'&&selected?.element===guide.task.element;
  el.className='cell'+(p?' filled':'')+(active.has(key)&&!session.clearPending&&!isTarget?(guide.task?.route?' swipe-cue'+(samePoint(guide.task.route[0],[r,c])?' swipe-start':''):' guided'+(pulse?' hint-blink':'')):'')+(isTarget?' drop-target':'')+(isTarget&&samePoint(gesture?.target,[r,c])&&validPaletteDrag?' drop-active':'')+(guide.error?.join(',')===key?' error':'');
  el.dataset.dropLabel=isTarget&&samePoint(gesture?.target,[r,c])&&validPaletteDrag?'離す':'ここへ';
  el.innerHTML=(target&&!session.clearPending?`<span class="goal" aria-hidden="true">${B.icon(target,step.target,r,c)}</span>`:'')+(p?`<span class="actual" aria-hidden="true">${B.icon(p,g,r,c)}</span>`:'');
  el.setAttribute('aria-label',`${r+1}行${c+1}列 ${p?(p.element||'炭素'):'空欄'}`);
 }
 const overlay=$('route');overlay.replaceChildren();
 syncSwipeHint(guide.task?.route&&!session.clearPending?guide.task.route:null,!!gesture||!!pending||!windowActive||document.hidden);
 paletteButtons.forEach(({button,panel})=>{button.setAttribute('aria-pressed',String(!!selected&&selected.type===panel.type&&selected.element===panel.element));button.classList.toggle('suggested',guide.task?.element===panel.element&&(guide.task.kind==='drag'?!validPaletteDrag:guide.task.kind==='place'&&selected?.element!==panel.element));});
}
function clearCelebration(){clearTimeout(celebrationTimer);$('celebration').replaceChildren();$('praise').className='praise';$('praise').textContent='';}
function celebrate(message,big=false,points=[]){
 clearCelebration();const text=$('praise');text.textContent=message;text.className='praise show'+(big?' big':'');
 const box=$('board').getBoundingClientRect(),valid=points.filter(([r,c])=>cells[r]?.[c]&&!cells[r][c].hidden),anchor=valid.length?valid.map(([r,c])=>cells[r][c].getBoundingClientRect()).reduce((sum,b)=>({x:sum.x+b.left+b.width/2,y:sum.y+b.top+b.height/2}),{x:0,y:0}):null;
 const origin=anchor?{x:anchor.x/valid.length,y:anchor.y/valid.length}:{x:box.left+box.width/2,y:box.top+box.height*.45};
 const colors=['#e9b541','#237f74','#e8767d','#84b9df','#b38dce'];
 for(let i=0;i<(big?38:16);i++){const p=document.createElement('span');p.className='particle'+(i%3===0?' star':'');p.style.left=origin.x+'px';p.style.top=origin.y+'px';const angle=i*2.39996,distance=(big?100:55)+(i%5)*13;p.style.setProperty('--dx',Math.cos(angle)*distance+'px');p.style.setProperty('--dy',(Math.sin(angle)*distance+(big?55:15))+'px');p.style.setProperty('--spin',(i%2?1:-1)*(120+i*23)+'deg');p.style.setProperty('--particle-color',colors[i%colors.length]);p.style.setProperty('--duration',big?'1.2s':'.8s');$('celebration').append(p);}
 celebrationTimer=setTimeout(()=>{if(big){$('celebration').replaceChildren();}else clearCelebration();},1500);
}
function progress(){return session.taskProgress;}
function commit(g,kind,operation={}){
 const before=progress(),wasComplete=session.complete;preview=null;const changed=session.edit(g,kind,operation);if(changed&&wasComplete&&!session.complete)clearCelebration();render();
 if(!changed||kind==='clear')return;
 if(kind==='move')audio[operation.target?'playMoveSound':'playDeleteSound']();
 else if(kind==='tap'||kind==='place'){if(operation.deleted)audio.playDeleteSound();else if(operation.rotation)audio[operation.rotation===270?'playRotateCCWSound':'playRotateCWSound']();else audio.playPlaceSound();}
 if(session.complete&&!wasComplete){audio.playCorrectSound({sparkle:session.index===10});celebrate(session.index===10?'全11課題、クリア！':session.index===3?'一筆で描き直せた！ 完成！':session.index===5?'2つとも置けた！ 完成！':'完成！ よくできました！',true);}
 else if(!session.clearPending&&progress().some((v,i)=>v&&!before[i])){audio.playValidSound();const done=progress(),points=steps[session.index].tasks.filter((t,i)=>done[i]&&!before[i]).map(t=>t.cell||t.route.at(-1));celebrate(kind==='move'?'つかんで消せた！':session.index===5?'ドラッグで置けた！ あと1つ！':session.index===3?'一筆で枝ができた！':kind==='trace'?'いいね！ つながった！':operation.element==='OH'||selected?.element==='OH'?'OHに置き換えられた！':'上手に置き換えられた！',false,operation.target?[operation.target]:operation.source?[operation.source]:points);}
}
function cancel(){if(pending)clearTimeout(pending);pending=null;tapCount=0;tapKey='';if(gesture?.timer)clearTimeout(gesture.timer);gesture=null;preview=null;clearCelebration();audio.clearPending();$('ghost').hidden=true;$('delete-hint').hidden=true;render();}
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
 commit(g,'tap',{deleted:n>=3,rotation:!selected&&p&&(p.element||'C')==='C'?n===2?270:90:0});
}
function start(event,source,panel){
 if(!event.isPrimary||event.button!==0||gesture)return;
 // Keep same-cell taps together; commit a completed tap before another target.
 if(pending){clearTimeout(pending);pending=null;if(!source||tapKey!==source.join(','))performTap();}
 event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);
 audio.beginTrace(source?[source]:[]);
 gesture={id:event.pointerId,x:event.clientX,y:event.clientY,source,panel,base:B.clone(session.grid),path:source?[source]:[],mode:'waiting'};
 if(source&&session.grid[source[0]][source[1]]){const current=gesture;gesture.timer=setTimeout(()=>{if(gesture!==current||gesture.mode!=='waiting')return;gesture.mode='move';audio.playPanelPickupSound();$('delete-hint').hidden=false;$('delete-hint').textContent='枠の外へ運んで離すと削除';$('delete-hint').classList.remove('outside');preview=B.clone(gesture.base);preview[source[0]][source[1]]=null;ghost(gesture.panel,event.clientX,event.clientY);render();},420);}
 render();
}
function extendTrace(g,target){
 if(!target||g.closed)return;let last=g.path.at(-1);if(last[0]===target[0]&&last[1]===target[1])return;
 if(last[0]!==target[0]&&last[1]!==target[1])return;
 const dr=Math.sign(target[0]-last[0]),dc=Math.sign(target[1]-last[1]);
 while(last[0]!==target[0]||last[1]!==target[1]){
  const previousLength=g.path.length;
  const next=[last[0]+dr,last[1]+dc],index=g.path.findIndex(p=>p[0]===next[0]&&p[1]===next[1]);
  if(index===0&&g.path.length>=4){g.path.push(next);g.closed=true;audio.trace(g.path,previousLength,true);break;}
  if(index>=0)g.path=g.path.slice(0,index+1);else g.path.push(next);audio.trace(g.path,previousLength,false);last=g.path.at(-1);
 }
 preview=B.applyTrace(g.base,g.path);
}
function move(event){
 const g=gesture;if(!g||event.pointerId!==g.id)return;event.preventDefault();
 if(g.mode==='waiting'&&Math.hypot(event.clientX-g.x,event.clientY-g.y)>8){clearTimeout(g.timer);g.mode=g.source?'trace':'new';tapCount=0;tapKey='';if(g.mode==='trace')selected=null;}
 g.target=cellAt(event.clientX,event.clientY);
 if(g.mode==='trace')extendTrace(g,g.target);
 else if(g.mode==='move'||g.mode==='new'){ghost(g.panel,event.clientX,event.clientY);if(g.mode==='move'){const outside=!cellAt(event.clientX,event.clientY);$('delete-hint').textContent=outside?'離すと削除':'枠の外へ運んで離すと削除';$('delete-hint').classList.toggle('outside',outside);}}
 render();
}
function finish(event){
 const g=gesture;if(!g||event.pointerId!==g.id)return;clearTimeout(g.timer);gesture=null;$('ghost').hidden=true;$('delete-hint').hidden=true;audio.endTrace();
 if(g.mode==='waiting'){preview=null;if(g.source)tap(...g.source);else{selected=selected&&selected.type===g.panel.type&&selected.element===g.panel.element?null:{...g.panel};audio.playPaletteSound(!!selected);render();}return;}
 if(g.mode==='trace'){commit(preview||g.base,'trace',{path:g.path});return;}
 const target=cellAt(event.clientX,event.clientY),next=B.clone(g.base);
 if(g.mode==='move')next[g.source[0]][g.source[1]]=null;
 if(target)next[target[0]][target[1]]={...g.panel};
 commit(next,g.mode==='move'?'move':'place',{source:g.source,target,fromPalette:g.mode==='new',element:g.panel?.element});
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
 button.addEventListener('pointerdown',e=>start(e,null,panel));button.addEventListener('click',e=>{if(e.detail===0){cancel();selected=selected?.type===panel.type&&selected?.element===panel.element?null:{...panel};audio.playPaletteSound(!!selected);render();}});
 (panel.element==='C'?carbonRow:atomRow).append(button);paletteButtons.push({button,panel});
}
window.addEventListener('pointermove',move,{passive:false});window.addEventListener('pointerup',finish);
window.addEventListener('resize',render);
window.addEventListener('pointercancel',event=>{if(!gesture||event.pointerId===gesture.id)cancel();});window.addEventListener('blur',()=>{windowActive=false;cancel();clearCelebration();});
window.addEventListener('focus',()=>{windowActive=true;render();});
reducedMotion.addEventListener('change',render);
document.addEventListener('visibilitychange',()=>{document.documentElement.classList.toggle('page-hidden',document.hidden);if(document.hidden){cancel();clearCelebration();}else render();});
window.addEventListener('keydown',e=>{if(e.key==='Escape')cancel();});
$('undo').addEventListener('click',()=>{cancel();session.undo();clearCelebration();audio.playUndoSound();render();});
$('clear').addEventListener('click',()=>{cancel();selected=null;clearCelebration();audio.playClearSound();commit(B.emptyGrid(),'clear');});
$('reset').addEventListener('click',()=>{cancel();selected=null;session.reset();clearCelebration();audio.playUiClickSound();render();});
$('next').addEventListener('click',()=>{cancel();selected=null;session.next();clearCelebration();audio.playUiClickSound();render();});
$('restart').addEventListener('click',()=>{cancel();selected=null;session.restart();clearCelebration();audio.playUiClickSound();render();});
audio.render();$('sound-toggle').addEventListener('click',event=>audio.toggle(event));
$('board').addEventListener('contextmenu',e=>e.preventDefault());
$('palette').addEventListener('contextmenu',e=>e.preventDefault());
render();
})(typeof window!=='undefined'?window:globalThis);
