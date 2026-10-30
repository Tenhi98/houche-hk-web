const $=s=>document.querySelector(s), names={kmb:'九巴／龍運',ctb:'城巴',nlb:'嶼巴',lrtfeeder:'港鐵巴士',gmb:'專線小巴'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let db,routes=[],stopRoutes=new Map(),point={lat:22.2819,lng:114.1589},located=false,filter='all',mode='near',limit=15,selection,epoch=0,watchId,userMarker,accuracyCircle,items=[],map,markers,selectedMarker,lastUpdated=0,refreshing=false;
let routeView=null;const tripSelections=new Map();
let saved;try{saved=new Set(JSON.parse(localStorage.getItem('houche-favorites')||'[]'))}catch{saved=new Set()}
const tags=cs=>[...new Set(cs)].map(c=>`<span class="tag ${esc(c)}">${esc(names[c]||c)}</span>`).join('');
const distance=(a,b)=>{let rad=x=>x*Math.PI/180,dlat=rad(b.lat-a.lat),dlng=rad(b.lng-a.lng),x=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x))};
const distText=d=>d<1000?`${Math.round(d)} 米`:`${(d/1000).toFixed(1)} 公里`;
const coords=p=>`${Number(p.lat).toFixed(5)}, ${Number(p.lng).toFixed(5)}`;
async function json(url,options={}){let r=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()}
function index(data){db=data;routes=Object.entries(db.routeList).filter(([,r])=>r.co.some(c=>names[c]));stopRoutes=new Map();for(let[id,r]of routes){for(let c of r.co.filter(c=>names[c])){(r.stops[c]||[]).forEach((stop,seq)=>{if(!db.stopList[stop])return;if(!stopRoutes.has(stop))stopRoutes.set(stop,[]);stopRoutes.get(stop).push({id,r,c,seq,stop})})}}}
function render(){if(!db)return;limit=Math.max(15,limit);let q=$('#search').value.trim().toLowerCase();$('#list-title').textContent=mode==='saved'?'收藏車站':q?'搜尋結果':located?'你附近的車站':'地圖中心附近';$('#favorites').textContent=mode==='saved'?'← 返回附近':'☆ 收藏';items=[];
 if(q&&mode!=='saved'){let matches=routes.filter(([,r])=>(filter==='all'||r.co.includes(filter))&&(r.route.toLowerCase().includes(q)||`${r.orig.zh} ${r.dest.zh} ${r.orig.en} ${r.dest.en}`.toLowerCase().includes(q)));matches.sort((a,b)=>(b[1].route.toLowerCase()===q)-(a[1].route.toLowerCase()===q)||a[1].route.localeCompare(b[1].route,undefined,{numeric:true}));items.push(...matches.map(([id,r])=>({kind:'route',id,r})));}
 let stops=[...stopRoutes.keys()].filter(id=>(mode!=='saved'||saved.has(id))&&(filter==='all'||stopRoutes.get(id).some(e=>e.c===filter))&&(!q||`${db.stopList[id].name.zh} ${db.stopList[id].name.en}`.toLowerCase().includes(q))).map(id=>({kind:'stop',id,d:distance(point,db.stopList[id].location)})).sort((a,b)=>a.d-b.d);items.push(...stops);
 $('#status').textContent=items.length?`${items.length} 個${q?'搜尋結果':'車站'} · ${located?'按你的定位排列':q?'選擇路線或車站':'目前以地圖中心排列；按「定位」尋找身邊車站'}`:'沒有符合的結果，試試更改公司或關鍵字。';
 $('#results').innerHTML=items.slice(0,limit).map((v,i)=>{if(v.kind==='route')return `<button class="route-card" data-index="${i}"><div class="card-top"><span class="route-num">${esc(v.r.route)}</span><strong class="stop-name">往 ${esc(v.r.dest.zh)}</strong><span>→</span></div><div class="sub">由 ${esc(v.r.orig.zh)} · 服務 ${esc(v.r.serviceType)}</div><div class="tags">${tags(v.r.co.filter(c=>names[c]))}</div></button>`;let s=db.stopList[v.id],entries=stopRoutes.get(v.id),rs=[...new Set(entries.map(e=>e.r.route))];return `<button class="stop-card ${selection?.stop===v.id?'selected':''}" data-index="${i}"><div class="card-top"><span class="stop-name">${saved.has(v.id)?'★ ':''}${esc(s.name.zh)}</span><span class="distance">${distText(v.d)}</span></div><div class="sub">${esc(coords(s.location))} · ${rs.slice(0,8).map(esc).join(' / ')}${rs.length>8?' …':''}</div><div class="tags">${tags(entries.map(e=>e.c))}</div></button>`}).join('')||'<div class="empty">這裡暫時沒有結果</div>';
 $('#more').hidden=items.length<=limit;if(!routeView)paintMarkers(stops.slice(0,45));}
function paintMarkers(stops){if(!map)return;markers.clearLayers();for(let {id}of stops){let s=db.stopList[id];L.marker([s.location.lat,s.location.lng],{icon:L.divIcon({className:'stop-marker',iconSize:[11,11]})}).addTo(markers).bindTooltip(s.name.zh).on('click',()=>chooseStop(id));}}
function searchNearMapPoint(latlng){
 point={lat:latlng.lat,lng:latlng.lng};located=false;mode='near';limit=15;
 // Map searches replace the route/stop view and invalidate its pending ETA requests.
 routeView=null;selection=null;epoch++;refreshing=false;lastUpdated=0;etaState=[];
 if(watchId!==undefined){navigator.geolocation.clearWatch(watchId);watchId=undefined}
 if(map){
  for(const layer of [selectedMarker,userMarker,accuracyCircle])if(layer)map.removeLayer(layer);
  selectedMarker=userMarker=accuracyCircle=null;
  map.setView([point.lat,point.lng],Math.max(map.getZoom(),15));
 }
 $('#search').value='';$('#loc-title').textContent='以地圖選點搜尋';$('#coords').textContent=coords(point)+' · 非你的定位';
 $('#detail').innerHTML='<div class="detail-empty"><span>↖</span><h2>查看附近車站</h2><p>已按地圖選點更新車站。<br>點選清單或地圖上的車站，查看到站預報。</p></div>';
 render();
}
function setupMap(){if(!window.L){$('#map').innerHTML='<p class="empty">地圖載入失敗；仍可使用車站清單。</p>';return}map=L.map('map',{scrollWheelZoom:false}).setView([point.lat,point.lng],15);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);markers=L.layerGroup().addTo(map);map.on('click',e=>searchNearMapPoint(e.latlng));}
function chooseStop(stop,onlyRoute,routeContext){routeView=null;selection={stop,onlyRoute,routeContext};epoch++;lastUpdated=0;refreshing=false;let s=db.stopList[stop];let entries=stopRoutes.get(stop).filter(e=>(!onlyRoute||e.id===onlyRoute)&&(!routeContext||(e.c===routeContext.c&&e.seq===routeContext.seq))&&(onlyRoute||filter==='all'||e.c===filter));let seen=new Set();entries=entries.filter(e=>{let k=`${e.id}:${e.c}:${e.seq}`;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.r.route.localeCompare(b.r.route,undefined,{numeric:true}));selection.entries=entries;
 $('#detail').innerHTML=`<div class="detail-header"><div><h2>${esc(s.name.zh)}</h2><div class="sub">${esc(s.name.en)}<br>${esc(coords(s.location))}</div></div><button id="save-stop" aria-label="收藏車站">${saved.has(stop)?'★':'☆'}</button></div><div class="detail-links"><a href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coords(s.location))}&travelmode=walking" target="_blank" rel="noopener">步行導航 ↗</a><button id="copy-coords">複製座標</button></div><div id="route-select"></div><div id="etas"></div><div class="update"><span id="updated">正在向營運商取得預報…</span><button id="refresh">↻ 更新</button></div>`;
 $('#save-stop').onclick=()=>{saved.has(stop)?saved.delete(stop):saved.add(stop);try{localStorage.setItem('houche-favorites',JSON.stringify([...saved]))}catch{}$('#save-stop').textContent=saved.has(stop)?'★':'☆';render()};$('#copy-coords').onclick=async()=>{try{await navigator.clipboard.writeText(coords(s.location));$('#copy-coords').textContent='已複製'}catch{$('#copy-coords').textContent=coords(s.location)}};$('#refresh').onclick=()=>refresh();
 if(onlyRoute){let r=db.routeList[onlyRoute],c=routeContext?.c||r.co.find(c=>r.stops[c]?.includes(stop)&&names[c]);if(c){$('#route-select').innerHTML=`<button id="all-stops" class="back-route">← ${esc(r.route)} 全線站點</button><select id="stop-select" aria-label="選擇上車站">${r.stops[c].map((id,i)=>`<option value="${i}" ${(routeContext?i===routeContext.seq:id===stop)?'selected':''}>${i+1}. ${esc(db.stopList[id]?.name.zh||id)}</option>`).join('')}</select>`;$('#all-stops').onclick=()=>showRoute(onlyRoute,c,stop,true,routeContext?.seq);$('#stop-select').onchange=e=>{let seq=Number(e.target.value);chooseStop(r.stops[c][seq],onlyRoute,{c,seq})}}}
 $('#etas').onclick=e=>{let b=e.target.closest('[data-eta-route]');if(!b)return;let entry=selection.entries[Number(b.dataset.etaRoute)];if(entry)showRoute(entry.id,entry.c,stop,true,entry.seq)};

 if(map){if(selectedMarker)map.removeLayer(selectedMarker);selectedMarker=L.circleMarker([s.location.lat,s.location.lng],{radius:11,color:'#c39139',fillOpacity:.3}).addTo(map);map.panTo([s.location.lat,s.location.lng])}render();refresh();if(innerWidth<801)$('#detail').scrollIntoView({behavior:'smooth',block:'start'});}


// A planning estimate, not a live journey-time prediction. The whole-route
// reference comes from the catalogue's jt (Transport Department JOURNEY_TIME).
// Partial trips apportion that reference by consecutive stop-coordinate distances.
function estimateJourney(r,c,a,b){
 const stops=r.stops[c]||[];
 if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=stops.length||b>=stops.length)return {error:'請選擇有效的上車站及下車站。'};
 if(a===b)return {error:'上車站與下車站相同，無需乘車。'};
 if(b<a)return {error:'下車站在上車站之前，請切換上方行車方向，或重新選站。'};
 const count=b-a,total=Number(r.jt);
 if(!Number.isFinite(total)||total<=0)return {count,unavailable:true};
 if(a===0&&b===stops.length-1)return {count,minutes:total,full:true};
 let totalDistance=0,tripDistance=0;
 for(let i=1;i<stops.length;i++){
  const prev=db.stopList[stops[i-1]]?.location,next=db.stopList[stops[i]]?.location;
  if(!prev||!next||![prev.lat,prev.lng,next.lat,next.lng].every(v=>Number.isFinite(Number(v))))return {count,unavailable:true};
  const d=distance(prev,next);totalDistance+=d;if(i>a&&i<=b)tripDistance+=d;
 }
 if(!(totalDistance>0)||!(tripDistance>0))return {count,unavailable:true};
 return {count,minutes:total*tripDistance/totalDistance,full:false};
}
function setupJourney(id,c,originStop,originSeq){
 const r=db.routeList[id],stops=r.stops[c]||[],key=JSON.stringify([id,c]);
 if(stops.length<2){$('#journey-planner').innerHTML='';return}
 let selected=tripSelections.get(key),a=selected?.a??(Number.isInteger(originSeq)?originSeq:Math.max(0,stops.indexOf(originStop))),b=selected?.b??stops.length-1;
 if(a>=stops.length||b>=stops.length){a=0;b=stops.length-1}
 const options=selected=>stops.map((stop,seq)=>`<option value="${seq}" ${seq===selected?'selected':''}>${seq+1}. ${esc(db.stopList[stop]?.name.zh||stop)}</option>`).join('');
 $('#journey-planner').innerHTML=`<h3>A 站到 B 站，要幾耐？</h3><div class="journey-fields"><label for="journey-from">A · 上車站<select id="journey-from">${options(a)}</select></label><label for="journey-to">B · 下車站<select id="journey-to">${options(b)}</select></label></div><div id="journey-result" role="status" aria-live="polite"></div><button id="journey-eta">查看 A 站到站預報 ›</button><details class="journey-method"><summary>估算依據及限制</summary><p>有全程參考耗時的路線才提供估算。部分路段按相鄰車站座標距離佔全線的比例分配全程耗時，並取約數；座標距離並非實際道路長度。</p><p>這是粗略規劃參考，未計即時交通、個別站停留及候車時間。繁忙時段、隧道、繞行或特別班次可能相差較大，請預留時間。</p></details>`;
 const update=()=>{a=Number($('#journey-from').value);b=Number($('#journey-to').value);tripSelections.set(key,{a,b});const result=estimateJourney(r,c,a,b);$('#journey-eta').disabled=!db.stopList[stops[a]];
  if(result.error){$('#journey-result').innerHTML=`<p class="journey-message">${esc(result.error)}</p>`;return}
  const stationText=`乘搭 ${result.count} 站 · 中途 ${Math.max(0,result.count-1)} 站`;
  if(result.unavailable){$('#journey-result').innerHTML=`<strong class="journey-unavailable">暫無足夠資料估算時間</strong><span>${stationText}</span>`;return}
  const minutes=result.minutes<10?Math.max(1,Math.round(result.minutes)):Math.max(5,Math.round(result.minutes/5)*5);
  $('#journey-result').innerHTML=`<strong>約 ${minutes}<small> 分鐘</small></strong><span>${stationText}</span><span class="journey-caution">${result.full?'全程參考耗時':'按距離比例粗略估算'} · 不含候車時間</span>`;
 };
 $('#journey-from').value=String(a);$('#journey-to').value=String(b);
 $('#journey-from').onchange=update;$('#journey-to').onchange=update;
 $('#journey-eta').onclick=()=>{if(db.stopList[stops[a]])chooseStop(stops[a],id,{c,seq:a})};update();
}

function routeVariants(id,c){
 const current=db.routeList[id];
 return routes.filter(([key,r])=>key===id||(r.route===current.route&&r.co.includes(c)&&(c!=='gmb'||r.gtfsId===current.gtfsId)))
  .sort((a,b)=>Number(a[1].serviceType)-Number(b[1].serviceType)||a[1].dest.zh.localeCompare(b[1].dest.zh));
}
function showRoute(id,company,originStop,focus=true,originSeq){
 const r=db.routeList[id];if(!r)return;
 const c=company&&r.stops[company]?company:r.co.find(c=>names[c]&&r.stops[c]&&(filter==='all'||c===filter))||r.co.find(c=>names[c]&&r.stops[c]);
 if(!c)return;
 const stops=r.stops[c]||[],variants=routeVariants(id,c);
 routeView={id,c,originStop};selection=null;epoch++;refreshing=false;lastUpdated=0;etaState=[];
 $('#detail').innerHTML=`<section class="route-detail" aria-labelledby="route-title"><div class="route-heading"><span class="route-num">${esc(r.route)}</span><div><h2 id="route-title" tabindex="-1">往 ${esc(r.dest.zh)}</h2><p class="sub">由 ${esc(r.orig.zh)}</p></div></div>
 <div class="tags">${tags([c])}<span class="tag">全程 ${stops.length} 站</span></div>
 <div class="route-controls"><label for="direction-select">方向／服務</label><select id="direction-select">${variants.map(([key,v])=>`<option value="${esc(key)}" ${key===id?'selected':''}>${esc(v.orig.zh)} → ${esc(v.dest.zh)} · ${String(v.serviceType)==='1'?'一般服務':'特別服務 '+esc(v.serviceType)}</option>`).join('')}</select>
 ${r.co.filter(co=>names[co]&&r.stops[co]).length>1?`<label for="company-select">營運商</label><select id="company-select">${r.co.filter(co=>names[co]&&r.stops[co]).map(co=>`<option value="${esc(co)}" ${co===c?'selected':''}>${esc(names[co])}</option>`).join('')}</select>`:''}</div>
 <section id="journey-planner" class="journey-planner" aria-label="站間乘車時間"></section>
 <p class="route-help">按行車方向排列 · 點選車站查看到站預報</p>
 ${originStop&&db.stopList[originStop]?'<button id="return-stop" class="back-route">← 返回剛才車站</button>':''}
 <ol class="route-stops">${stops.map((stop,seq)=>{const st=db.stopList[stop];return `<li class="${stop===originStop?'current-stop':''}"><button type="button" data-route-seq="${seq}" ${!st?'disabled':''}><span class="stop-sequence">${seq+1}</span><span class="route-stop-name"><strong>${esc(st?.name.zh||'車站資料暫缺')}</strong><small>${esc(st?.name.en||stop)}</small>${seq===0?'<em>起點</em>':seq===stops.length-1?'<em>終點</em>':''}${stop===originStop?'<em>剛才查看的車站</em>':''}</span><span aria-hidden="true">›</span></button></li>`}).join('')}</ol>${stops.length?'':'<p class="empty">此方向暫無站點資料，請選擇其他服務。</p>'}</section>`;
 setupJourney(id,c,originStop,originSeq);
 $('#direction-select').onchange=e=>showRoute(e.target.value,c,originStop,false);
 if($('#company-select'))$('#company-select').onchange=e=>showRoute(id,e.target.value,originStop,false);
 if($('#return-stop'))$('#return-stop').onclick=()=>chooseStop(originStop);
 $('.route-stops').onclick=e=>{let b=e.target.closest('[data-route-seq]');if(!b)return;let seq=Number(b.dataset.routeSeq);if(db.stopList[stops[seq]])chooseStop(stops[seq],id,{c,seq})};
 if(map){if(selectedMarker){map.removeLayer(selectedMarker);selectedMarker=null}markers.clearLayers();let points=[];stops.forEach((stop,seq)=>{const st=db.stopList[stop];if(!st)return;let xy=[st.location.lat,st.location.lng];points.push(xy);L.marker(xy,{icon:L.divIcon({className:'stop-marker',iconSize:[11,11]})}).addTo(markers).bindTooltip(`${seq+1}. ${st.name.zh}`).on('click',()=>chooseStop(stop,id,{c,seq}))});if(points.length)map.fitBounds(points,{padding:[24,24],maxZoom:16})}
 if(!focus)$('#direction-select').focus({preventScroll:true});
 if(focus){$('#route-title').focus({preventScroll:true});if(innerWidth<801)$('#detail').scrollIntoView({behavior:'smooth',block:'start'})}
}

async function arrivals(e){let {r,c,stop,seq}=e,route=encodeURIComponent(r.route),p;const norm=a=>a.map(x=>({time:Date.parse(x.eta),note:x.rmk_tc||'',generated:Date.parse(x.data_timestamp)}));
 if(c==='kmb'){p=await json(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${stop}/${route}/${r.serviceType}`);return norm((p.data||[]).filter(x=>x.dir===r.bound[c]&&x.seq===seq+1))}
 if(c==='ctb'){p=await json(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stop}/${route}`);return norm((p.data||[]).filter(x=>r.bound[c].includes(x.dir)&&x.seq===seq+1))}
 if(c==='nlb'){p=await json(`https://rt.data.gov.hk/v2/transport/nlb/stop.php?action=estimatedArrivals&routeId=${r.nlbId}&stopId=${stop}&language=zh`);return(p.estimatedArrivals||[]).map(x=>({time:Date.parse(x.estimatedArrivalTime.replace(' ','T')+'+08:00'),note:x.departed!=='1'||x.noGPS==='1'?'預定班次':x.routeVariantName||''}))}
 if(c==='lrtfeeder'){p=await json('https://rt.data.gov.hk/v1/transport/mtr/bus/getSchedule',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'zh',routeName:r.route})});return(p.busStop||[]).filter(x=>x.busStopId===stop).flatMap(s=>(s.bus||[]).map(x=>({time:Date.now()+Number(x.arrivalTimeInSecond==='108000'?x.departureTimeInSecond:x.arrivalTimeInSecond)*1000,note:s.busStopRemark||x.busRemark||(x.isScheduled==='1'?'預定班次':'')})))}
 if(c==='gmb'){p=await json(`https://data.etagmb.gov.hk/eta/route-stop/${r.gtfsId}/${stop}`);return(p.data||[]).filter(x=>x.route_seq===(r.bound[c]==='O'?1:2)&&x.stop_seq===seq+1).flatMap(x=>x.enabled?(x.eta||[]).map(v=>({time:Date.parse(v.timestamp),note:v.remarks_tc||'',generated:Date.parse(p.generated_timestamp)})):[{time:NaN,note:x.description_tc||'預報未啟用'}])}return[];}
let etaState=[];
function drawEtas(){if(!selection)return;const etaHtml=etaState.map(({e,values,error,pending,received},i)=>{let valid=(values||[]).filter(v=>Number.isFinite(v.time)&&v.time>=Date.now()-30000).sort((a,b)=>a.time-b.time);let first=valid[0],stale=received&&Date.now()-received>90000||first?.generated&&Date.now()-first.generated>180000;let mins=first?Math.max(0,Math.ceil((first.time-Date.now())/60000)):null;let note=error?'連線失敗，請重試':pending?'正在取得預報…':stale?'資料過期，請更新':first?.note||(values||[]).find(v=>v.note)?.note||(!first?'暫無到站預報':'');return `<button type="button" class="eta-row" data-eta-route="${i}" aria-label="${esc(e.r.route)} 往 ${esc(e.r.dest.zh)}，查看全線站點"><span><span class="route-num">${esc(e.r.route)}</span><span class="tag ${esc(e.c)}">${esc(names[e.c])}</span></span><span><span class="destination">往 ${esc(e.r.dest.zh)}</span><span class="route-hint">全線站點 ›</span><span class="eta-note">${esc(note)}</span>${valid.length>1&&!stale?`<span class="eta-note">其後 ${valid.slice(1,3).map(v=>Math.max(0,Math.ceil((v.time-Date.now())/60000))+' 分').join('、')}</span>`:''}</span><span class="eta ${!first||stale?'error':''}">${stale?'已過期':first?(mins===0?'即將到站':mins):pending?'···':'—'}<small>${first&&!stale?(mins>0?'分鐘 · '+new Date(first.time).toLocaleTimeString('zh-HK',{timeZone:'Asia/Hong_Kong',hour:'2-digit',minute:'2-digit'}):'請留意車輛'):'暫無可用預報'}</small></span></button>`}).join('');if($('#etas').innerHTML!==etaHtml)$('#etas').innerHTML=etaHtml;if(lastUpdated){let age=Math.floor((Date.now()-lastUpdated)/1000);$('#updated').textContent=`${age} 秒前查詢 · 每 60 秒更新${age>90?' · 查詢已過期':''}`;$('#updated').parentElement.classList.toggle('stale',age>90)}}
async function refresh(){if(!selection||refreshing)return;refreshing=true;let token=epoch,entries=selection.entries;$('#refresh').disabled=true;etaState=entries.map(e=>({e,pending:true}));drawEtas();let cursor=0;async function worker(){while(cursor<entries.length){let i=cursor++,e=entries[i];try{let values=await arrivals(e);if(token!==epoch)return;etaState[i]={e,values,received:Date.now()}}catch{if(token!==epoch)return;etaState[i]={e,error:true}}drawEtas()}}await Promise.all(Array.from({length:Math.min(4,entries.length)},worker));if(token!==epoch)return;refreshing=false;lastUpdated=Date.now();$('#refresh').disabled=false;drawEtas()}
$('#search').oninput=()=>{mode='near';limit=15;render()};$('#filters').onclick=e=>{let b=e.target.closest('[data-co]');if(!b)return;filter=b.dataset.co;$('#filters .active')?.classList.remove('active');b.classList.add('active');limit=15;render();if(selection)chooseStop(selection.stop,selection.onlyRoute,selection.routeContext)};$('#results').onclick=e=>{let b=e.target.closest('[data-index]');if(!b)return;let v=items[Number(b.dataset.index)];if(v.kind==='stop')chooseStop(v.id);else showRoute(v.id)};$('#more').onclick=()=>{limit+=20;render()};$('#favorites').onclick=()=>{mode=mode==='saved'?'near':'saved';$('#search').value='';limit=15;render()};
$('#locate').onclick=()=>{if(!navigator.geolocation){$('#coords').textContent='瀏覽器不支援定位，請在地圖選點。';return}$('#loc-title').textContent='正在取得定位…';if(watchId!==undefined)navigator.geolocation.clearWatch(watchId);watchId=navigator.geolocation.watchPosition(p=>{point={lat:p.coords.latitude,lng:p.coords.longitude};located=true;$('#loc-title').textContent='你的位置';$('#coords').textContent=coords(point)+` · 精度約 ±${Math.round(p.coords.accuracy)} 米`;if(map){if(userMarker)map.removeLayer(userMarker);if(accuracyCircle)map.removeLayer(accuracyCircle);userMarker=L.marker([point.lat,point.lng],{icon:L.divIcon({className:'user-marker',iconSize:[17,17]})}).addTo(map);accuracyCircle=L.circle([point.lat,point.lng],{radius:p.coords.accuracy,color:'#4387c0',weight:1,fillOpacity:.05}).addTo(map);map.setView([point.lat,point.lng],16)}render()},e=>{$('#loc-title').textContent='未能取得定位';$('#coords').textContent=e.code===1?'定位權限未開啟，可在瀏覽器設定允許；也可點地圖選點。':'定位逾時或訊號不足，可重試或點地圖選點。'},{enableHighAccuracy:true,timeout:20000,maximumAge:30000})};
$('#about').onclick=()=>$('#info').showModal();$('#close-info').onclick=()=>$('#info').close();$('#install').onclick=()=>{alert('Android：使用 Chrome 選單 →「加入主畫面」或「安裝應用程式」。\n\niPhone：Safari 分享 →「加入主畫面」。\n\n這是手機網頁，使用定位與到站預報需要網絡。')};document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();$('#search').focus()}});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&selection&&Date.now()-lastUpdated>=60000)refresh()});setInterval(()=>{if(!document.hidden){drawEtas();if(selection&&Date.now()-lastUpdated>=60000&&!refreshing)refresh()}},1000);
// Catalogue loading: reuse a validated local copy, then refresh in the background.
const networkCacheName='houche-route-data-v1',networkCacheKey='./route-data-cache';
function validNetwork(data){return data&&['routeList','stopList'].every(key=>data[key]&&typeof data[key]==='object'&&!Array.isArray(data[key])&&Object.keys(data[key]).length>0)}
async function cacheNetwork(data,label){try{const cache=await caches.open(networkCacheName);await cache.put(networkCacheKey,new Response(JSON.stringify({data,label,savedAt:Date.now()}),{headers:{'Content-Type':'application/json'}}))}catch{}}
async function cachedNetwork(){try{const cache=await caches.open(networkCacheName),response=await cache.match(networkCacheKey);if(!response)return;const stored=await response.json();if(!validNetwork(stored.data)||!Number.isFinite(stored.savedAt)){await cache.delete(networkCacheKey);return}return{data:stored.data,label:`已載入裝置路線快取（${new Date(stored.savedAt).toLocaleString('zh-HK',{timeZone:'Asia/Hong_Kong',hour12:false})} 儲存）；正在檢查更新。${stored.label||''}`,needsRefresh:true}}catch{}}
async function loadPartsNetwork(){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000),parts=new Array(10);let next=0;
 async function worker(){while(next<parts.length){const i=next++,response=await fetch('./parts/network.part'+String(i).padStart(2,'0')+'.txt',{signal:controller.signal});if(!response.ok)throw Error('part '+i);parts[i]=await response.text()}}
 try{await Promise.all(Array.from({length:3},worker));const data=JSON.parse(parts.join(''));if(!validNetwork(data))throw Error('格式錯誤');return data}
 catch(error){controller.abort();throw error}finally{clearTimeout(timeout)}
}
async function latestNetwork(){for(const url of ['https://data.hkbus.app/routeFareList.min.json','https://hkbus.github.io/hk-bus-crawling/routeFareList.min.json']){try{const data=await json(url);if(!validNetwork(data))throw Error('格式錯誤');const label='已從 HK Bus Crawling 取得最新路線資料。';void cacheNetwork(data,label);return{data,label,needsRefresh:false}}catch{}}throw Error('no network data')}
async function loadNetwork(){const cached=await cachedNetwork();if(cached)return cached;try{const data=await loadPartsNetwork(),label='內置路線快照：2026-10-28；開啟時嘗試取得最新資料。';void cacheNetwork(data,label);return{data,label,needsRefresh:true}}catch{return latestNetwork()}}
async function start(){setupMap();try{const loaded=await loadNetwork();index(loaded.data);$('#data-date').textContent=loaded.label;render();if(loaded.needsRefresh){try{const latest=await latestNetwork();index(latest.data);render();$('#data-date').textContent=latest.label}catch{}}}catch{$('#status').textContent='車站資料載入失敗，請檢查網絡後重新整理。'}}
start();
