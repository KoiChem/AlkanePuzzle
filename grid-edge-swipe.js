// Safari's history gesture can start before Pointer Events handle the grid.
// Cancel only a single touch starting at the left viewport edge beside the grid.
(function(root){
 'use strict';
 root.installGridEdgeSwipeGuard=function(grid,isEnabled){
  let guarded=false;
  const options={capture:true,passive:false};
  document.addEventListener('touchstart',event=>{
   guarded=false;
   if(!isEnabled()||event.touches.length!==1||!event.cancelable)return;
   const touch=event.touches[0],rect=grid.getBoundingClientRect();
   if(rect.width===0||rect.height===0||touch.clientX<0||touch.clientX>24||touch.clientY<rect.top||touch.clientY>=rect.bottom)return;
   // Do not intercept touches when a dialog covers the grid.
   const hit=document.elementFromPoint(Math.min(innerWidth-1,Math.max(rect.left+2,24)),touch.clientY);
   if(!hit||!grid.contains(hit))return;
   guarded=true;event.preventDefault();
  },options);
  document.addEventListener('touchmove',event=>{
   if(!isEnabled()||event.touches.length!==1)guarded=false;
   if(guarded&&event.cancelable)event.preventDefault();
  },options);
  const clear=()=>{guarded=false;};
  document.addEventListener('touchend',clear,{capture:true,passive:true});
  document.addEventListener('touchcancel',clear,{capture:true,passive:true});
  window.addEventListener('blur',clear);
  document.addEventListener('visibilitychange',clear);
 };
})(window);
