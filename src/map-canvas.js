// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { project, unproject, convertMapPoint, pointOnly } from './map-model.js';
import { mapTileUrls, amapStaticUrl } from './map-sources.js';

// Only the visible viewport is requested. Native image caching respects each
// provider's HTTP headers; no prefetch, service worker cache or remote script.
export function createMapCanvas(element, {onMove,onPick,onStatus}) {
  const events=new AbortController(),options={signal:events.signal};
  const plane=element.querySelector('.map-image-plane'),marker=element.querySelector('.map-selected-marker');
  let state=null,generation=0,resizeTimer,renderTimer,drag=null,disposed=false,scale=1;
  const nodes=new Map();
  const dimensions=()=>({width:Math.max(1,element.clientWidth),height:Math.max(1,element.clientHeight)});
  const centerPoint=()=>convertMapPoint(state.center,state.source.crs,state.region);
  const centerPixel=()=>project(centerPoint(),state.zoom);
  function release(record) {
    clearTimeout(record.timer);record.controller?.abort();
    if(record.objectUrl)URL.revokeObjectURL(record.objectUrl);
    record.image.onload=null;record.image.onerror=null;record.image.removeAttribute('src');record.image.remove();
  }
  function clear() {generation++;for(const record of nodes.values())release(record);nodes.clear();plane.replaceChildren();marker.hidden=true;}
  function positionMarker() {
    if(!state)return;
    const {width,height}=dimensions(),center=centerPixel(),world=256*2**state.zoom;
    marker.hidden=true;
    if(state.selected){
      const point=project(convertMapPoint(state.selected,state.source.crs,state.selected.region),state.zoom);
      let dx=point.x-center.x;if(dx>world/2)dx-=world;if(dx<-world/2)dx+=world;
      const x=width/2+dx*scale,y=height/2+(point.y-center.y)*scale;
      marker.hidden=x<0||x>width||y<0||y>height;
      marker.style.left=`${x}px`;marker.style.top=`${y}px`;
      marker.setAttribute('aria-label',state.selected.name);
    }
    const metres=156543.03392*Math.cos(centerPoint().latitude*Math.PI/180)/2**state.zoom/scale*90;
    const power=10**Math.floor(Math.log10(metres)),value=[1,2,5,10].map(n=>n*power).filter(n=>n<=metres).at(-1)||power;
    const bar=element.querySelector('.map-scale');
    bar.style.width=`${Math.round(value/metres*90)}px`;bar.textContent=value>=1000?`${value/1000} km`:`${value} m`;
  }
  function render() {
    if(disposed||!state)return;
    const token=++generation,{width,height}=dimensions(),source=state.source,z=state.zoom,center=centerPixel();
    const wanted=[];
    scale=source.id==='amap'?Math.max(1,width/1024,height/1024):1;
    if(source.id==='amap') {
      const url=amapStaticUrl(centerPoint(),z,width/scale,height/scale,state.local);
      wanted.push({key:url,url,left:0,top:0,width,height,layer:0});
    } else {
      const left=center.x-width/2,top=center.y-height/2,count=2**z;
      for(let y=Math.max(0,Math.floor(top/256));y<=Math.min(count-1,Math.floor((top+height-1)/256));y++) {
        for(let x=Math.floor(left/256);x<=Math.floor((left+width-1)/256);x++) {
          mapTileUrls(source,state.layer,state.local,z,((x%count)+count)%count,y).forEach((url,layer)=>wanted.push({key:`${x}:${y}:${url}`,url,left:x*256-left,top:y*256-top,width:256,height:256,layer}));
        }
      }
    }
    const keys=new Set(wanted.map(row=>row.key));
    for(const [key,record] of nodes)if(!keys.has(key)){release(record);nodes.delete(key);}
    const report=()=>{
      if(disposed||token!==generation)return;
      const records=[...nodes.values()],pending=records.some(row=>row.status==='loading');
      const failed=records.filter(row=>row.status==='error').length;
      onStatus(pending?'loading':failed?'error':'ready',failed);
    };
    for(const row of wanted) {
      let record=nodes.get(row.key);
      if(!record) {
        const image=document.createElement('img');image.alt='';image.draggable=false;image.decoding='async';
        image.referrerPolicy='strict-origin-when-cross-origin';
        record={image,status:'loading',timer:null,report};nodes.set(row.key,record);
        const finish=status=>{clearTimeout(record.timer);record.status=status;image.classList.toggle('is-failed',status==='error');record.report();};
        image.onload=()=>finish('ready');image.onerror=()=>finish('error');
        record.timer=setTimeout(()=>{if(record.status==='loading'){record.controller?.abort();image.removeAttribute('src');finish('error');}},12000);
        plane.append(image);
        // Extension/file contexts do not send an HTTP Referer. Identify Qiye
        // explicitly to OSM instead of disguising the request as a website.
        if(source.id==='osm' && globalThis.chrome?.runtime?.id) {
          record.controller=new AbortController();
          fetch(row.url,{signal:record.controller.signal,credentials:'omit',redirect:'error',cache:'default',headers:{'X-Requested-With':'Qiye (https://github.com/Ktclat/qiye)'}})
            .then(response=>{if(!response.ok)throw new Error('Tile request failed');return response.blob();})
            .then(blob=>{if(!disposed&&nodes.get(row.key)===record&&record.status==='loading'){record.objectUrl=URL.createObjectURL(blob);image.src=record.objectUrl;}})
            .catch(()=>{if(!disposed&&nodes.get(row.key)===record)finish('error');});
        } else image.src=row.url;
      }
      record.report=report;
      Object.assign(record.image.style,{left:`${row.left}px`,top:`${row.top}px`,width:`${row.width}px`,height:`${row.height}px`,zIndex:String(row.layer)});
    }
    plane.style.transform='';positionMarker();report();
  }
  function schedule() {clearTimeout(renderTimer);renderTimer=setTimeout(render,160);}
  function moveTo(center,zoom=state.zoom) {
    if(!state)return;
    state={...state,center,zoom:Math.max(state.source.minZoom,Math.min(state.source.maxZoom,zoom))};
    onMove(pointOnly(center),state.zoom);schedule();
  }
  function zoomBy(delta,anchor) {
    if(!state)return;
    const next=Math.max(state.source.minZoom,Math.min(state.source.maxZoom,state.zoom+delta));
    if(next===state.zoom)return;
    const {width,height}=dimensions(),center=centerPixel(),dx=((anchor?.x??width/2)-width/2)/scale,dy=((anchor?.y??height/2)-height/2)/scale,factor=2**(next-state.zoom);
    moveTo(unproject({x:(center.x+dx)*factor-dx,y:(center.y+dy)*factor-dy},next,state.source.crs),next);
  }
  element.addEventListener('pointerdown',event=>{
    if(!state||event.button!==0||event.target.closest('button,a')||drag)return;
    clearTimeout(renderTimer);element.focus({preventScroll:true});
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,center:centerPixel(),moved:false};
    element.setPointerCapture(event.pointerId);element.classList.add('is-dragging');
  },options);
  element.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const dx=event.clientX-drag.x,dy=event.clientY-drag.y;
    drag.moved ||= Math.hypot(dx,dy)>4;
    if(drag.moved){plane.style.transform=`translate(${dx}px,${dy}px)`;marker.style.transform=`translate(${dx}px,${dy}px)`;}
  },options);
  const endDrag=event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const current=drag;drag=null;element.classList.remove('is-dragging');marker.style.transform='';
    if(element.hasPointerCapture(event.pointerId))element.releasePointerCapture(event.pointerId);
    if(event.type==='pointercancel'){plane.style.transform='';return;}
    if(current.moved)moveTo(unproject({x:current.center.x-(event.clientX-current.x)/scale,y:current.center.y-(event.clientY-current.y)/scale},state.zoom,state.source.crs));
    else {const rect=element.getBoundingClientRect(),{width,height}=dimensions();onPick(unproject({x:current.center.x+(event.clientX-rect.left-width/2)/scale,y:current.center.y+(event.clientY-rect.top-height/2)/scale},state.zoom,state.source.crs));}
  };
  element.addEventListener('pointerup',endDrag,options);element.addEventListener('pointercancel',endDrag,options);
  element.addEventListener('wheel',event=>{
    if(!state||event.target.closest('button,a'))return;event.preventDefault();
    const rect=element.getBoundingClientRect();zoomBy(event.deltaY<0?1:-1,{x:event.clientX-rect.left,y:event.clientY-rect.top});
  },{...options,passive:false});
  element.addEventListener('keydown',event=>{
    if(!state||event.target!==element)return;
    if(['+','=','-'].includes(event.key)){event.preventDefault();zoomBy(event.key==='-'?-1:1);}
    const delta={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]}[event.key];
    if(delta){event.preventDefault();const p=centerPixel();moveTo(unproject({x:p.x+delta[0]/scale,y:p.y+delta[1]/scale},state.zoom,state.source.crs));}
  },options);
  const resize=new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state)render();},180);});resize.observe(element);
  return {
    set(next) {clearTimeout(renderTimer);if(!next){state=null;clear();return;}const sourceChanged=state?.source.id!==next.source.id;state={...next,zoom:Math.max(next.source.minZoom,Math.min(next.source.maxZoom,next.zoom))};if(sourceChanged)clear();render();},
    mark(selected) {if(state){state={...state,selected};positionMarker();}},
    zoom:zoomBy,
    retry() {clear();render();},
    destroy() {disposed=true;events.abort();resize.disconnect();clearTimeout(resizeTimer);clearTimeout(renderTimer);clear();state=null;},
  };
}
