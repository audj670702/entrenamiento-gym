import { resolveSysTransmission } from "./gym-tv-model.js?v=0.1.55";
// GYM · Monitor TV · v0.1.55
// Conserva el comportamiento de pantalla completa y navegación de CPC/NEXUS:
//   nexus/js/tv.js        → reproducción, canales, sonido y pantalla completa.
//   nexus/js/modes.js     → initTvOptions (menú de opciones del monitor).
//   nexus/js/back-nav.js  → el botón Atrás cierra el menú y la pantalla completa.
// Única adaptación: el canal propio ("eo" en NEXUS, "cpc" en CPC) aquí es "gym" = Canal GYM,
// configurado desde el Panel ADM en Wix (TV_SCaD_Canal / TV_SCaD_Parrilla, app = GYM) y
// entregado en gymPwaContext → tv. Se vuelve a consultar cada POLL_MS mientras está al aire.

const TVDI_HLS = "https://tvdigital.scad.mx/cfcx/canal/index.m3u8";
const GYM_CHANNEL_NAME = "Canal GYM";
const DIGITAL_CHANNEL_NAME = "TV Digital";
const POLL_MS = 10000;

const API_BASE = "https://www.scad.mx/_functions";
const DIGITAL_CHANNELS = [
  { codigo: "CH01", numero: 1, nombre: "TV Digital Internet", tipo: "VPS", senal: TVDI_HLS },
  { codigo: "CH02", numero: 2, nombre: "Programación variada", tipo: "VPS", senal: "https://tvdigital.scad.mx/cfcx/prueba/index.m3u8" }
];
let channels = [{ codigo: "gym", numero: 0, nombre: GYM_CHANNEL_NAME, tipo: "EO" }, ...DIGITAL_CHANNELS];
let selected = "gym", catalogTimer = null, clockOffset = 0, sysTransmission = null;
let selectionVersion = 0, sysLoading = false, gymLoading = false;
let context = null, hls = null, tvMuted = true, communityVideoKey = "";
const $ = s => document.querySelector(s);

// ---------- marcado (idéntico a nexus/index.html) ----------
export function tvMarkup() {
  return `<section class="tv-section" aria-label="${GYM_CHANNEL_NAME}">
      <div class="tv-console">
        <div id="tvMonitor" class="tv-monitor"><video id="tvVideo" autoplay muted playsinline preload="auto" aria-label="Canal en vivo"></video><div id="tvPlaceholder" class="tv-placeholder"></div><div id="tvScreenCenter" class="tv-screen-center"><span class="tv-play">▶</span></div></div>
        <button id="tvResume" class="tv-resume" type="button" hidden>▶ Reproducir</button>
        <div class="tv-bar">
          <div class="tv-caption"><strong id="tvChannelNumber">CH 00</strong><span id="tvNowLabel" class="tv-now">${GYM_CHANNEL_NAME}</span><small id="tvContentTitle"></small></div>
          <button id="tvDial" class="tv-dial" type="button" aria-label="Canal siguiente; usa las flechas para cambiar" title="Cambiar canal"><span aria-hidden="true"></span></button>
          <button id="btnTvOptions" class="tv-options-trigger" type="button" aria-label="Opciones del monitor" aria-expanded="false"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>
        </div>
        <div id="tvFsLayer" class="tv-fs-layer" hidden><button id="btnCloseTvFs" class="tv-fs-close" type="button" aria-label="Salir de pantalla completa"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
        <div id="tvOptions" class="tv-controls tv-options" role="dialog" aria-label="Opciones del monitor" hidden>
          <div class="tv-options-head"><strong>Monitor</strong><button id="btnTvOptionsClose" class="tv-options-close" type="button" aria-label="Cerrar">×</button></div>
          <span class="tv-options-label">Canal</span>
          <div class="tv-channels" id="tvChannelList"></div>
          <div class="tv-options-actions">
            <button id="btnTvMute" class="tv-opt-btn" type="button"><span id="tvMuteIcon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg></span><span id="tvMuteText">Activar sonido</span></button>
            <button id="btnTvExpand" class="tv-opt-btn" type="button"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg><span>Pantalla completa</span></button>
          </div>
        </div>
      </div>
    </section>`;
}

// ---------- nexus/js/tv.js ----------
function esc(v=""){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function destroyHls(){if(hls){hls.destroy();hls=null}const v=$("#tvVideo");if(!v)return;v.pause();v.removeAttribute("src");v.load()}
function setPlaceholder(active){const v=$("#tvVideo"),p=$("#tvPlaceholder"),c=$("#tvScreenCenter");if(p)p.hidden=!active;if(c)c.hidden=!active;if(v)v.hidden=active}
function playUrl(url){communityVideoKey="";const c=$("#tvScreenCenter");if(c)c.innerHTML='<span class="tv-play">▶</span>';destroyHls();const v=$("#tvVideo");if(!v||!url){setPlaceholder(true);return}setPlaceholder(false);v.muted=tvMuted;if(/\.m3u8($|\?)/i.test(url)){if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=url;v.play().catch(()=>{if(currentChannel()?.tipo==='VPS')showPlayFallback()});return}if(window.Hls&&Hls.isSupported()){hls=new Hls({enableWorker:true,lowLatencyMode:false,backBufferLength:30});hls.loadSource(url);hls.attachMedia(v);hls.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{if(currentChannel()?.tipo==='VPS')showPlayFallback()}));hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal)setPlaceholder(true)});return}}v.src=url;v.play().catch(()=>{if(currentChannel()?.tipo==='VPS')showPlayFallback()})}
function youtubeEmbedUrl(tv){const id=String(tv?.youtubeId||"").trim();if(!id)return"";const start=Math.max(0,Math.floor(Number(tv?.segundoInicio)||0));const u=new URL(`https://www.youtube.com/embed/${encodeURIComponent(id)}`);u.searchParams.set("autoplay","1");u.searchParams.set("mute",tvMuted?"1":"0");u.searchParams.set("playsinline","1");u.searchParams.set("controls","1");u.searchParams.set("rel","0");u.searchParams.set("enablejsapi","1");u.searchParams.set("start",String(start));u.searchParams.set("origin",location.origin);return u.toString()}
function sendYoutubeCommand(func){const f=$("#tvCommunityFrame");if(f?.contentWindow)f.contentWindow.postMessage(JSON.stringify({event:"command",func,args:[]}),"https://www.youtube.com")}
function renderGymTransmission(force=false){const tv=context?.tv,id=String(tv?.youtubeId||"").trim(),center=$("#tvScreenCenter");if(!id){communityVideoKey="";destroyHls();setPlaceholder(true);if(center)center.innerHTML='<span class="tv-play">▶</span>';return}const key=`${tv?.modo||""}:${tv?.itemId||""}:${tv?.occurrence??""}:${id}`;if(!force&&communityVideoKey===key)return;communityVideoKey=key;$("#tvResume").hidden=true;destroyHls();const v=$("#tvVideo"),p=$("#tvPlaceholder");if(v)v.hidden=true;if(p)p.hidden=false;if(center){center.hidden=false;center.innerHTML=`<iframe id="tvCommunityFrame" class="tv-youtube-frame" src="${esc(youtubeEmbedUrl(tv))}" title="${esc(tv.titulo||GYM_CHANNEL_NAME)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen"></iframe>`;
const frame=$("#tvCommunityFrame");frame?.addEventListener('load',()=>{for(const event of ['onStateChange','onAutoplayBlocked'])frame.contentWindow?.postMessage(JSON.stringify({event:'command',func:'addEventListener',args:[event]}),'https://www.youtube.com')});}}
function playGym(){renderGymTransmission(true)}
function currentChannel(){return channels.find(c=>c.codigo===selected)}
function renderChannels(){
  const list=$("#tvChannelList");
  if(list)list.innerHTML=channels.map(c=>`<button class="channel ${c.codigo===selected?'is-active':''}" type="button" data-channel="${esc(c.codigo)}" aria-pressed="${c.codigo===selected}"><span>CH ${String(c.numero).padStart(2,'0')} · ${esc(c.nombre)}</span></button>`).join('');
  const c=currentChannel();
  if(!c)return;
  $("#tvChannelNumber").textContent=`CH ${String(c.numero).padStart(2,'0')}`;
  $("#tvNowLabel").textContent=c.nombre;
  $("#tvDial")?.setAttribute('aria-label',`CH ${String(c.numero).padStart(2,'0')}, ${c.nombre}. Canal siguiente; flechas para cambiar`);
}
function showPlayFallback(){const b=$("#tvResume");if(b)b.hidden=false}
function setTitle(title=''){const el=$("#tvContentTitle");if(el){el.textContent=title;el.title=title}}
function setChannel(ch){
  if(!channels.some(c=>c.codigo===ch))return;
  selected=ch;selectionVersion++;sysTransmission=null;sysLoading=false;
  stopGymPolling();
  const m=$("#tvMonitor");if(m){m.dataset.channel=ch;m.dataset.source=currentChannel()?.tipo==='VPS'?'hls':'youtube'}
  communityVideoKey='';
  // Remove the old YouTube iframe before switching to an HLS signal.
  const center=$("#tvScreenCenter");if(center)center.innerHTML='<span class="tv-play">▶</span>';
  renderChannels();setTitle();$("#tvResume").hidden=true;
  if(ch==='gym'){playGym();setTitle(context?.tv?.titulo||'');startGymPolling()}
  else {
    const c=currentChannel();
    if(c.tipo==='VPS')playUrl(c.senal);else {destroyHls();setPlaceholder(true)}
    refreshSys();pollTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshSys()},POLL_MS);
  }
}
export function setTvContext(next){context=next||null;if(selected==='gym'){renderGymTransmission(false);setTitle(context?.tv?.titulo||'')}}
function stepChannel(direction){const i=channels.findIndex(c=>c.codigo===selected);setChannel(channels[(i+direction+channels.length)%channels.length].codigo)}
async function readPublic(path){
  const response=await fetch(`${API_BASE}/${path}`,{cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`TV ${response.status}`);
  const data=await response.json();
  if(data.ok!==true)throw new Error(data.mensaje||data.codigo||'Sin programación');
  const server=Date.parse(response.headers.get('Date'));
  if(Number.isFinite(server))clockOffset=server-Date.now();
  return data;
}
async function refreshCatalog(){
  try{
    const data=await readPublic('tvdCanales');
    if(!Array.isArray(data.canales))throw new Error('Catálogo inválido');
    const seen=new Set();
    const sys=data.canales.filter(c=>/^CH\d{2}$/.test(c.codigo)&&Number(c.numero)>0&&Number(c.numero)===Number(c.codigo.slice(2))&&['VPS','VIRTUAL'].includes(c.tipo)&&!seen.has(c.codigo)&&seen.add(c.codigo));
    const previous=currentChannel();
    channels=[{codigo:'gym',numero:0,nombre:GYM_CHANNEL_NAME,tipo:'EO'},...DIGITAL_CHANNELS.map(f=>({...f,...sys.find(c=>c.codigo===f.codigo)})),...sys.filter(c=>c.numero>2)];
    const next=currentChannel();
    if(!next)setChannel('CH01');
    else if(previous&&(previous.tipo!==next.tipo||previous.senal!==next.senal))setChannel(selected);
    else renderChannels();
  }catch(error){console.warn('[GYM TV] Catálogo SYS:',error)}
}
async function refreshSys(){
  if(selected==='gym'||sysLoading)return;
  const version=selectionVersion,code=selected;
  sysLoading=true;
  try{
    const data=await readPublic(`tvdTransmision?canal=${encodeURIComponent(code)}`);
    if(version!==selectionVersion)return;
    sysTransmission=data;
    renderSysTransmission();
  }catch(error){
    if(version===selectionVersion){sysTransmission=null;setTitle('');if(currentChannel()?.tipo==='VIRTUAL'){destroyHls();setPlaceholder(true)}}
  }finally{if(version===selectionVersion)sysLoading=false}
}
function renderSysTransmission(){
  if(!sysTransmission||selected==='gym')return;
  const tv=resolveSysTransmission(sysTransmission,Date.now()+clockOffset);
  if(currentChannel()?.tipo==='VPS'){setTitle(sysTransmission.transmision?.videoAlAire||'');return}
  setTitle(tv?.titulo||'');
  if(!tv){destroyHls();setPlaceholder(true);return}
  const previous=context;
  context={tv};renderGymTransmission(false);context=previous;
}
// v0.3.3 · Pantalla completa del monitor.
// 1) API nativa (Android, escritorio, iPad). 2) iPhone con canal de video: reproductor nativo.
// 3) Si nada de lo anterior existe (iPhone con YouTube): el monitor ocupa toda la pantalla
//    dentro de la app, con botón para salir; el botón Atrás también lo cierra.
function closeTvOptions(){const o=$("#tvOptions"),t=$("#btnTvOptions");if(o&&!o.hidden){o.hidden=true;t?.setAttribute("aria-expanded","false")}}
function nativeFsElement(){return document.fullscreenElement||document.webkitFullscreenElement||null}
function enterTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.add("tv-fs");if(layer)layer.hidden=false;try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}
function exitTvPseudoFullscreen(){const layer=$("#tvFsLayer");document.body.classList.remove("tv-fs");if(layer&&!layer.hidden)layer.hidden=true;try{screen.orientation?.unlock?.()}catch{}}
function toggleTvFullscreen(){
  const m=$("#tvMonitor");if(!m)return;
  if(nativeFsElement()){const ex=document.exitFullscreen||document.webkitExitFullscreen;try{ex?.call(document)?.catch?.(()=>{})}catch{}return}
  if(document.body.classList.contains("tv-fs")){exitTvPseudoFullscreen();return}
  const req=m.requestFullscreen||m.webkitRequestFullscreen;
  if(req){
    closeTvOptions();
    try{const r=req.call(m);if(r&&typeof r.then==="function"){r.then(()=>{try{screen.orientation?.lock?.("landscape").catch(()=>{})}catch{}}).catch(()=>setTimeout(enterTvPseudoFullscreen,200))}return}catch{}
  }
  const v=$("#tvVideo");
  if(currentChannel()?.tipo==="VPS"&&v&&!v.hidden&&typeof v.webkitEnterFullscreen==="function"){try{v.webkitEnterFullscreen();closeTvOptions();return}catch{}}
  closeTvOptions();setTimeout(enterTvPseudoFullscreen,200);
}
function initTv(){const m=$("#tvMonitor"),x=$("#btnTvExpand"),c=$(".tv-controls");if(!m||!c)return;m.dataset.channel="gym";c.addEventListener("click",e=>{const b=e.target.closest("[data-channel]");if(b)setChannel(b.dataset.channel)});x?.addEventListener("click",()=>toggleTvFullscreen());$("#btnCloseTvFs")?.addEventListener("click",exitTvPseudoFullscreen);$("#btnTvMute")?.addEventListener("click",()=>{tvMuted=!tvMuted;const v=$("#tvVideo"),i=$("#tvMuteIcon");if(v)v.muted=tvMuted;if(i)i.innerHTML=tvMuted?'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>':'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11"/></svg>';const tt=$("#tvMuteText");if(tt)tt.textContent=tvMuted?"Activar sonido":"Silenciar";if(currentChannel()?.tipo!=="VPS")sendYoutubeCommand(tvMuted?"mute":"unMute");else if(!tvMuted)v?.play().catch(()=>{})});$("#tvDial")?.addEventListener('click',()=>stepChannel(1));
$("#tvDial")?.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowDown','ArrowRight','ArrowUp'].includes(e.key)){e.preventDefault();stepChannel(['ArrowLeft','ArrowDown'].includes(e.key)?-1:1)}});
let wheelAt=0;
$("#tvDial")?.addEventListener('wheel',e=>{e.preventDefault();if(Date.now()-wheelAt>250&&e.deltaY){wheelAt=Date.now();stepChannel(e.deltaY>0?1:-1)}},{passive:false});
$("#tvResume")?.addEventListener('click',()=>{if(currentChannel()?.tipo==='VPS')$("#tvVideo")?.play().then(()=>$("#tvResume").hidden=true).catch(()=>{});else{sendYoutubeCommand('playVideo');$("#tvResume").hidden=true}});
setChannel("gym")}

// ---------- nexus/js/modes.js · initTvOptions ----------
function initTvOptions() {
  const trigger = $("#btnTvOptions"), panel = $("#tvOptions");
  if (!trigger || !panel) return;
  const setOpen = open => { panel.hidden = !open; trigger.setAttribute("aria-expanded", String(open)); };
  trigger.addEventListener("click", e => { e.stopPropagation(); setOpen(panel.hidden); });
  $("#btnTvOptionsClose")?.addEventListener("click", () => setOpen(false));
  panel.addEventListener("click", e => { if (e.target.closest("[data-channel]")) setTimeout(() => setOpen(false), 150); });
}

// ---------- nexus/js/back-nav.js (sólo las capas del monitor) ----------
// Cada capa que se abre agrega un paso al historial del navegador.
// Así, el botón Atrás cierra la capa superior en lugar de salir de la app.
// Si la capa se cierra con su propio botón, se consume ese paso del historial.
const MODAL_SELECTOR = ["#tvOptions", "#tvFsLayer"].join(",");
const CLOSE_SELECTOR = ["#btnCloseTvFs", "#btnTvOptionsClose"].join(",");
const stack = [];
let ignorePops = 0;
function isOpen(el) { return !!el && el.isConnected && !el.hidden; }
function closeModal(el) {
  const own = [...el.querySelectorAll(CLOSE_SELECTOR)].find(b => b.closest(MODAL_SELECTOR) === el);
  if (own) own.click();
  if (isOpen(el)) el.hidden = true;
}
function onOpened(el) {
  if (stack.includes(el)) return;
  stack.push(el);
  history.pushState({ gymTvModal: el.id || true }, "");
}
function onClosed(el) {
  const i = stack.indexOf(el);
  if (i === -1) return;
  stack.splice(i, 1);
  if (history.state && history.state.gymTvModal) { ignorePops++; history.back(); }
}
function scan() {
  document.querySelectorAll(MODAL_SELECTOR).forEach(el => { if (isOpen(el)) onOpened(el); });
  [...stack].forEach(el => { if (!isOpen(el)) onClosed(el); });
}

// ---------- listeners de documento (una sola vez, aunque app.js vuelva a pintar) ----------
let docBound = false;
function bindDocumentOnce() {
  if (docBound) return;
  docBound = true;
  // modes.js: un toque fuera del menú lo cierra.
  document.addEventListener("click", e => {
    const panel = $("#tvOptions"), trigger = $("#btnTvOptions");
    if (panel && !panel.hidden && !panel.contains(e.target) && !trigger?.contains(e.target)) { panel.hidden = true; trigger?.setAttribute("aria-expanded", "false"); }
  });
  window.addEventListener('message',event=>{
    const frame=$("#tvCommunityFrame");
    if(event.origin!=='https://www.youtube.com'||event.source!==frame?.contentWindow)return;
    let data;try{data=typeof event.data==='string'?JSON.parse(event.data):event.data}catch{return}
    if(data?.event==='onAutoplayBlocked')showPlayFallback();
    if(data?.event==='onStateChange'&&data.info===1)$("#tvResume").hidden=true;
    if(data?.event==='onStateChange'&&data.info===0){communityVideoKey='';if(selected==='gym')refreshGym();else refreshSys()}
  });
  setInterval(()=>{if(document.visibilityState==='visible'&&selected!=='gym')renderSysTransmission()},1000);
  // tv.js: Esc sale de la pantalla completa dentro de la app.
  document.addEventListener("keydown", e => { if (e.key === "Escape" && document.body.classList.contains("tv-fs")) exitTvPseudoFullscreen(); });
  // back-nav.js
  window.addEventListener("popstate", () => {
    if (ignorePops > 0) { ignorePops--; return; }
    const top = stack.pop();
    if (top) closeModal(top);
  });
  new MutationObserver(scan).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") { refreshCatalog(); communityVideoKey=''; if(selected === "gym") refreshGym(); else refreshSys(); } });
}

// ---------- Canal GYM: contexto desde el Panel ADM (Wix) ----------
let loadContext = null, pollTimer = null;
function stopGymPolling() { if (pollTimer) clearInterval(pollTimer); pollTimer = null; }
async function refreshGym() {
  if (!loadContext || gymLoading) return;
  gymLoading=true;
  try { const next = await loadContext(); if ($("#tvMonitor")?.dataset.channel === "gym") setTvContext(next); }
  catch (error) { console.warn("[GYM TV] Canal GYM:", error); }
  finally { gymLoading=false; }
}
function startGymPolling() {
  stopGymPolling();
  if (!loadContext) return;
  refreshGym();
  pollTimer = setInterval(() => { if (document.visibilityState === "visible") refreshGym(); }, POLL_MS);
}

// options.loadContext: () => Promise<contexto gymPwaContext> (con .tv). Sin sesión: se omite
// y Canal GYM muestra el monitor en espera (▶), igual que NEXUS sin transmisión.
export function initGymTv(options = {}) {
  loadContext = typeof options.loadContext === "function" ? options.loadContext : null;
  stopGymPolling();
  communityVideoKey = "";
  bindDocumentOnce();
  initTvOptions();
  initTv();
  clearInterval(catalogTimer);
  refreshCatalog();
  catalogTimer=setInterval(()=>{if(document.visibilityState==='visible')refreshCatalog()},60000);
}
