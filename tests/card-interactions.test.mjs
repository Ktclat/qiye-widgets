import test from 'node:test';
import assert from 'node:assert/strict';
import { bindWidgetCardInteractions } from '../src/widget-card-interactions.js';

function harness(){
 const doc=new EventTarget(),win=new EventTarget(),classes=new Set(),messages=[];let captured=null;
 const surface={classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)},setPointerCapture:id=>{captured=id;},releasePointerCapture:()=>{captured=null;}};
 Object.assign(doc,{defaultView:win,documentElement:surface,getSelection:()=>({removeAllRanges(){}})});
 const bridge={init:{environment:{mode:'card',hostFeatures:['interactions','long-press']}},port:{postMessage:message=>messages.push(message)}};
 const controls=bindWidgetCardInteractions(bridge,doc);
 function emit(type,fields={}){
  const event=new Event(type,{cancelable:true});
  for(const [key,value] of Object.entries({pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:1,clientX:20,clientY:20,detail:1,...fields}))Object.defineProperty(event,key,{value});
  doc.dispatchEvent(event);return event;
 }
 return {doc,bridge,controls,emit,messages,surface,classes,captured:()=>captured};
}
test('short clicks and pre-hold text selection retain native defaults',()=>{
 const h=harness();h.emit('pointerdown');assert.equal(h.captured(),null);
 assert.equal(h.emit('pointerup').defaultPrevented,false);assert.equal(h.emit('click').defaultPrevented,false);
 h.emit('pointerdown');assert.equal(h.emit('pointermove',{clientX:40}).defaultPrevented,false);
 assert.equal(h.messages.at(-1).action,'pointercancel');assert.equal(h.emit('click').defaultPrevented,false);
 h.controls.destroy();
});
test('confirmed hold captures once and suppresses the release action, including Escape',()=>{
 for(const cancel of [false,true]){
  const h=harness();h.emit('pointerdown');h.bridge.onDragState({pointerId:1,active:true});assert.equal(h.captured(),1);
  assert.equal(h.emit('pointermove',{clientX:50}).defaultPrevented,true);
  if(cancel)assert.equal(h.emit('keydown',{key:'Escape'}).defaultPrevented,true);
  h.emit('pointerup');assert.equal(h.captured(),null);assert.equal(h.classes.size,0);
  assert.equal(h.emit('click').defaultPrevented,true);
  h.emit('pointerdown');h.emit('pointerup');assert.equal(h.emit('click').defaultPrevented,false);h.controls.destroy();
 }
});
test('context menus work over inputs; preview/window modes never start desktop interactions',()=>{
 const h=harness();assert.equal(h.emit('contextmenu',{target:{tagName:'TEXTAREA'}}).defaultPrevented,true);
 assert.equal(h.messages.at(-1).action,'contextmenu');
 for(const environment of [{mode:'window'},{mode:'card',preview:true}]){
  Object.assign(h.bridge.init.environment,environment);const count=h.messages.length;
  h.emit('pointerdown');assert.equal(h.emit('contextmenu').defaultPrevented,false);assert.equal(h.messages.length,count);
 }
 h.controls.destroy();
});
test('touch cancellation, extra pointers and lost capture clear pending sessions',()=>{
 for(const event of ['pointercancel','second','lostpointercapture']){
  const h=harness();h.emit('pointerdown',{pointerType:'touch'});h.bridge.onDragState({pointerId:1,active:true});
  if(event==='second')h.emit('pointerdown',{pointerId:2,isPrimary:false});
  else h.emit(event,{target:h.surface});
  assert.equal(h.captured(),null);assert.equal(h.classes.size,0);h.controls.destroy();
 }
});
