const test=require('node:test');
const assert=require('node:assert/strict');
const B=require('../tutorial-board.js');
const {steps}=require('../tutorial-steps.js');
const {TutorialSession,traceHintFrame}=require('../tutorial.js');
const walk=[[0,2],[1,2],[1,3],[1,4],[2,4],[2,3],[2,2],[1,2],[1,3],[1,4],[0,4]];
const ring=[[1,2],[1,3],[1,4],[2,4],[2,3],[2,2],[1,2]];
function lesson(){const s=new TutorialSession();s.index=8;s.grid=B.clone(steps[7].target);s.begin();return s;}
function trace(s,path){s.edit(B.applyTrace(s.grid,path),'trace',{path});}
test('cyclic lessons use octane, a cleared one-stroke dimethyl ring, then four more branches',()=>{
 assert.equal(steps.length,12);
 assert.deepEqual(steps.slice(7).map(s=>s.name),['シクロオクタン','1,3-ジメチルシクロヘキサン','1,2,3,4,5,6-ヘキサメチルシクロヘキサン','1,2,3,4,5,6-ヘキサクロロシクロヘキサン','2,4,6-トリクロロ-1,3,5-シクロヘキサントリオール']);
 assert.equal(steps[7].target.flat().filter(Boolean).length,8);assert.equal(steps[8].clear,true);
 assert.equal(steps[9].tasks.length,4);let g=B.clone(steps[8].target);
 for(const task of steps[9].tasks)g=B.applyTrace(g,task.route);
 assert.equal(B.generateName(g).name,'1,2,3,4,5,6-ヘキサメチルシクロヘキサン');assert.ok(B.matches(g,steps[9].target));
});
test('one walk unions repeated carbon and bond directions in either direction',()=>{
 for(const path of [walk,walk.slice().reverse()]){
  const g=B.applyTrace(B.emptyGrid(),path);
  assert.deepEqual(B.generateName(g),{ok:true,name:'1,3-ジメチルシクロヘキサン'});
  assert.equal(g.flat().filter(Boolean).length,8);assert.deepEqual([...B.getBondDirections(g,1,2)].sort(),['E','N','S']);
 }
});
test('dimethyl completion requires an empty board and one committed trace, not split strokes or taps',()=>{
 const s=lesson();assert.equal(s.clearPending,true);s.edit(B.emptyGrid(),'clear');
 trace(s,ring);trace(s,[[1,2],[0,2]]);trace(s,[[1,4],[0,4]]);
 assert.ok(B.matches(s.grid,steps[8].target));assert.equal(s.complete,false);
 trace(s,walk);assert.equal(s.complete,false,'retracing an already assembled answer is not drawing from empty');
 s.edit(B.emptyGrid(),'clear');s.edit(steps[8].target,'tap');assert.equal(s.complete,false);
 s.edit(B.emptyGrid(),'clear');s.edit(steps[8].target,'trace');assert.equal(s.complete,false,'shape alone is not stroke evidence');
 s.edit(B.emptyGrid(),'clear');trace(s,walk);assert.equal(s.complete,true);
});
test('one-stroke Undo and clear restore evidence; reset restores octane and its clear gate',()=>{
 const s=lesson();s.edit(B.emptyGrid(),'clear');trace(s,walk);assert.equal(s.complete,true);
 s.undo();assert.equal(s.complete,false);assert.ok(B.matches(s.grid,B.emptyGrid()));
 trace(s,walk.slice().reverse());assert.equal(s.complete,true);s.edit(B.emptyGrid(),'clear');assert.equal(s.complete,false);s.undo();assert.equal(s.complete,true);
 s.reset();assert.ok(B.matches(s.grid,steps[7].target));assert.equal(s.clearPending,true);assert.equal(s.complete,false);
 s.edit(B.emptyGrid(),'clear');trace(s,walk);assert.equal(s.next(),true);assert.equal(s.index,9);assert.deepEqual(s.taskProgress,[false,false,false,false]);assert.equal(s.history.length,0);
});
test('three-cell guide drops one cell per step and relights each repeated visit',()=>{
 const frame=ms=>traceHintFrame(walk,ms,3).points;
 assert.deepEqual(frame(0),[[0,2]]);assert.deepEqual(frame(320),[[0,2],[1,2]]);assert.deepEqual(frame(640),[[0,2],[1,2],[1,3]]);
 assert.deepEqual(frame(960),[[1,2],[1,3],[1,4]]);assert.deepEqual(frame(1280),[[1,3],[1,4],[2,4]]);
 assert.deepEqual(frame(2240),[[2,3],[2,2],[1,2]]);assert.deepEqual(frame(2560),[[2,2],[1,2],[1,3]]);assert.deepEqual(frame(2880),[[1,2],[1,3],[1,4]]);
 assert.deepEqual(frame(3200),[[1,3],[1,4],[0,4]]);assert.deepEqual(frame(3700),[]);assert.deepEqual(frame(4100),[[0,2]]);
});
test('octane guide still hides the start at the fourth cell and relights it when the ring closes',()=>{
 const route=[[0,2],[0,3],[0,4],[1,4],[2,4],[2,3],[2,2],[1,2],[0,2]];
 assert.deepEqual(traceHintFrame(route,960).points,[[0,3],[0,4],[1,4]]);
 assert.deepEqual(traceHintFrame(route,2560).points,route);
});
