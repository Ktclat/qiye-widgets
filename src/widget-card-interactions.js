// SPDX-License-Identifier: GPL-3.0-only
// Register before card handlers: releasing a held button must never click it.
export function bindWidgetCardInteractions(bridge, doc=globalThis.document) {
 const win=doc.defaultView, events=new AbortController();
 let gesture=null, guard=null;
 const enabled=()=>bridge.init.environment.mode==='card'&&!bridge.init.environment.preview&&bridge.init.environment.hostFeatures?.includes('interactions');
 const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{capture:true,signal:events.signal,...options});
 const send=(event,action)=>bridge.port.postMessage({type:'interaction',action,x:event.clientX,y:event.clientY,screenX:event.screenX,screenY:event.screenY,pointerId:event.pointerId,pointerType:event.pointerType,buttons:event.buttons});
 function finish(notify=false){
  const current=gesture;if(!current)return;gesture=null;
  if(current.active)guard={id:current.id,waiting:!['pointerup','pointercancel'].includes(current.last.type),until:Date.now()+700};
  doc.documentElement.classList.remove('widget-dragging');
  if(notify)send(current.last,'pointercancel');
  try{current.capture?.releasePointerCapture(current.id);}catch{}
 }
 bridge.onDragState=message=>{
  if(gesture?.id!==message.pointerId)return;
  if(!message.active){finish();return;}
  gesture.active=true;
  // A stable element keeps the pointer across card rendering and live reordering.
  gesture.capture=doc.documentElement;
  try{gesture.capture.setPointerCapture(gesture.id);}catch{finish(true);return;}
  doc.documentElement.classList.add('widget-dragging');doc.getSelection()?.removeAllRanges();
 };
 listen(doc,'pointerdown',event=>{
  if(!enabled()||!bridge.init.environment.hostFeatures?.includes('long-press'))return;
  if(event.isPrimary===false){finish(true);return;}
  if(event.button!==0)return;
  finish(true);guard=null;
  gesture={id:event.pointerId,pointerType:event.pointerType,x:event.clientX,y:event.clientY,last:event,active:false,capture:null};
  send(event,'pointerdown');
 });
 for(const type of ['pointermove','pointerup','pointercancel'])listen(doc,type,event=>{
  if(type==='pointerup'&&guard?.id===event.pointerId){guard.waiting=false;guard.until=Date.now()+700;}
  if(gesture?.id!==event.pointerId)return;
  // Once a held touch is active, TouchEvents own movement/end. A browser may
  // cancel PointerEvents when it considers panning, before touchmove can veto
  // scrolling; the touch stream still runs until touchend/touchcancel.
  if(gesture.active&&gesture.touchId!==undefined){event.preventDefault();event.stopImmediatePropagation();return;}
  gesture.last=event;
  if(!gesture.active&&type==='pointermove'&&Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>=7){finish(true);return;}
  if(gesture.active){event.preventDefault();event.stopImmediatePropagation();}
  send(event,type);
  if(type!=='pointermove')finish();
 },{passive:false});
 listen(doc,'lostpointercapture',event=>{if(gesture?.id===event.pointerId&&gesture.capture===event.target&&!(gesture.active&&gesture.touchId!==undefined))finish(true);});
 listen(doc,'click',event=>{
  if(gesture?.active||(guard&&event.detail!==0&&(guard.waiting||Date.now()<guard.until)&&(event.pointerId===undefined||event.pointerId===guard.id))){event.preventDefault();event.stopImmediatePropagation();guard=null;}
 });
 listen(doc,'contextmenu',event=>{
  if(!enabled())return;event.preventDefault();event.stopImmediatePropagation();
  if(gesture?.active)return;
  finish(true);send(event,'contextmenu');
 });
 listen(doc,'keydown',event=>{
  if(event.key==='Escape'&&gesture){const active=gesture.active;finish(true);if(active){event.preventDefault();event.stopImmediatePropagation();}return;}
  if(enabled()&&(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')){
   event.preventDefault();event.stopImmediatePropagation();finish(true);
   const rect=event.target.getBoundingClientRect();send({clientX:rect.left+12,clientY:rect.top+12},'contextmenu');
  }
 });
 listen(doc,'dragstart',event=>{if(enabled())event.preventDefault();});
 listen(doc,'selectstart',event=>{if(gesture?.active)event.preventDefault();});
 listen(doc,'touchstart',event=>{
  if(!gesture||gesture.pointerType!=='touch')return;
  if(event.touches.length!==1){finish(true);return;}
  gesture.touchId=event.changedTouches[0]?.identifier;
 },{passive:true});
 for(const type of ['touchmove','touchend','touchcancel'])listen(doc,type,event=>{
  if(!gesture?.active||gesture.touchId===undefined)return;
  const touch=[...event.changedTouches].find(t=>t.identifier===gesture.touchId);if(!touch)return;
  event.preventDefault();event.stopImmediatePropagation();
  const action=type==='touchmove'?'pointermove':type==='touchend'?'pointerup':'pointercancel';
  const point={type:action,clientX:touch.clientX,clientY:touch.clientY,screenX:touch.screenX,screenY:touch.screenY,pointerId:gesture.id,pointerType:'touch',buttons:type==='touchmove'?1:0};
  gesture.last=point;send(point,action);if(type!=='touchmove')finish();
 },{passive:false});
 listen(doc,'visibilitychange',()=>{if(doc.hidden)finish(true);});
 listen(win,'blur',event=>{if(event.target===win)finish(true);});
 return {cancel:()=>finish(true),destroy:()=>{finish(true);events.abort();bridge.onDragState=null;}};
}
