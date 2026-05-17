const app = document.getElementById('app');
let roomKeyHex = localStorage.getItem('veil.roomKeyHex') || '';
let currentCredentialId = localStorage.getItem('veil.credentialId') || '';
let currentDisplayName = localStorage.getItem('veil.displayName') || '';
let ws;
let wsReady = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let activeEmojiPicker = null;
let activeEmojiToggle = null;
let emojiOutsideHandlerBound = false;
let pendingAttachment = null;
let roomName = '';
let seenMessageIDs = new Set();
const VIEW_CHAT = 'chat';
const VIEW_KEYS = 'keys';
const VIEW_CONTROL = 'control';
const VIEW_THEME = 'theme';
let currentView = VIEW_CHAT;
let myRole = 'member';
let myUserID = '';
const knownDisplayNames = new Set();
const SIDEBAR_COLLAPSED_KEY = 'veil.sidebarCollapsed';
let sidebarCollapsed = loadSidebarCollapsed();

const PASTELS = ['#8bd8bd','#ffd166','#f4978e','#90dbf4','#c1d37f','#ffb86b','#b8f2e6','#f7aef8'];
const PASSPHRASE_WORDS = ['amber','atlas','birch','bloom','cinder','cobalt','comet','copper','coral','dawn','drift','ember','fern','flint','frost','glow','grove','harbor','hazel','ivory','jade','lilac','lumen','maple','meadow','mist','moss','night','nova','oak','onyx','opal','pearl','pine','plum','quartz','rain','raven','reef','ridge','river','rose','sage','shade','shore','sky','slate','snow','stone','storm','sun','thistle','timber','topaz','vale','velvet','violet','wave','willow','wind'];
const EMOJI_CHOICES = ['😀','😄','😂','😊','😍','😎','🥳','😭','😅','😐','🙃','😉','👍','👎','👏','🙌','🙏','💪','🔥','✨','💯','❤️','💙','💚','👀','🤔','✅','❌','⚠️','🔒','🫡','🎉'];
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png','image/jpeg','image/webp','image/gif']);
const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const EMOTICON_MAP = {
  ':)':'😊', ':-)':'😊',
  ':D':'😄', ':-D':'😄',
  ':(':'🙁', ':-(':'🙁',
  ';)':'😉', ';-)':'😉',
  ':P':'😛', ':-P':'😛', ':p':'😛', ':-p':'😛',
  ':O':'😮', ':-O':'😮', ':o':'😮', ':-o':'😮',
  ':|':'😐', ':-|':'😐',
  '<3':'❤️',
  ':fire:':'🔥', ':lock:':'🔒', ':thumbsup:':'👍', ':100:':'💯'
};
const PBKDF2_ITERS = 600000;
const THEME_STORAGE_KEY = 'veil.theme';
const USER_COLOR_STORAGE_KEY = 'veil.userColors';
const VEIL_THEME = {
  bg:'#0b0f17',
  bg2:'#121827',
  panel:'#141b2b',
  surface:'#0f1523',
  ink:'#e9edf8',
  muted:'#98a6c3',
  accent:'#6fb4ff',
  accent2:'#72e5c2',
  danger:'#ff8c9c'
};
const DEFAULT_THEME = {
  bg:'#130f12',
  bg2:'#20141c',
  panel:'#2b1b27',
  surface:'#1f141c',
  ink:'#f9edf5',
  muted:'#c3a6b9',
  accent:'#ff9d66',
  accent2:'#ff78b2',
  danger:'#ff7f9b'
};
const THEME_PRESETS = {
  veil: VEIL_THEME,
  ember: DEFAULT_THEME,
  midnight: {bg:'#08101c',bg2:'#111d33',panel:'#162640',surface:'#0e1a2f',ink:'#e8f1ff',muted:'#98aecf',accent:'#67b6ff',accent2:'#60e3d0',danger:'#ff8ea8'},
  graphite: {bg:'#101214',bg2:'#191d23',panel:'#21262f',surface:'#171b22',ink:'#eef0f4',muted:'#a2acbc',accent:'#8ab4ff',accent2:'#88e0c4',danger:'#ff9aa4'}
};

const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const hashName = (n) => { let h=0; for(let i=0;i<n.length;i++) h=((h<<5)-h)+n.charCodeAt(i); return Math.abs(h); };
let customUserColors = loadUserColors();
const userColor = (n) => customUserColors[n] || PASTELS[hashName(n) % PASTELS.length];
const isAdminRole = (role) => role === 'root_admin' || role === 'admin';

function normalizeHexColor(value){
  const v=String(value||'').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';
}
function loadSidebarCollapsed(){
  try{
    const raw=localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    if(raw===null) return true;
    return raw === '1';
  }catch{
    return true;
  }
}
function setSidebarCollapsed(next){
  sidebarCollapsed=!!next;
  try{ localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? '1' : '0'); }catch{}
}
function shouldAutoCollapseSidebarOnNav(){
  return window.matchMedia('(max-width: 980px)').matches;
}
function loadUserColors(){
  try{
    const raw=JSON.parse(localStorage.getItem(USER_COLOR_STORAGE_KEY)||'{}');
    const out={};
    for(const [name,color] of Object.entries(raw||{})){
      const safeName=String(name||'').trim();
      const safeColor=normalizeHexColor(color);
      if(safeName && safeColor) out[safeName]=safeColor;
    }
    return out;
  }catch{
    return {};
  }
}
function saveUserColors(){
  localStorage.setItem(USER_COLOR_STORAGE_KEY, JSON.stringify(customUserColors));
}
function setUserColor(name,color){
  const safeName=String(name||'').trim();
  const safeColor=normalizeHexColor(color);
  if(!safeName || !safeColor) return;
  customUserColors[safeName]=safeColor;
  saveUserColors();
}
function refreshRenderedUserColor(name){
  const safeName=String(name||'').trim();
  if(!safeName) return;
  const c=userColor(safeName);
  const escaped=(window.CSS && typeof window.CSS.escape==='function') ? window.CSS.escape(safeName) : safeName.replace(/["\\]/g,'\\$&');
  document.querySelectorAll(`.line-user[data-user-name="${escaped}"]`).forEach((el)=>{ el.style.color=c; });
}

function fmtTime(ts){ if(!ts) return ''; const d=new Date(ts); if(Number.isNaN(d.getTime())) return ts; return d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
async function api(path, opts={}){
  const headers = {'accept':'application/json', ...(opts.headers || {})};
  if(opts.body && !headers['content-type']) headers['content-type']='application/json';
  const r=await fetch(path,{...opts,headers});
  let data={};
  try{ data=await r.json(); }catch{}
  return {ok:r.ok,data};
}
const $ = (id) => document.getElementById(id);
function escapeRegex(value){ return String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function convertEmoticons(text){
  let out=String(text);
  for(const [code,emoji] of Object.entries(EMOTICON_MAP)){
    const pattern=new RegExp(`(^|\\s)${escapeRegex(code)}(?=$|\\s)`,'g');
    out=out.replace(pattern, `$1${emoji}`);
  }
  return out;
}
function clampByte(n){ return Math.max(0, Math.min(255, Math.round(n))); }
function hexToRgb(hex){
  const match=String(hex).trim().match(/^#([0-9a-f]{6})$/i);
  if(!match) return null;
  const value=parseInt(match[1],16);
  return {r:(value>>16)&255,g:(value>>8)&255,b:value&255};
}
function rgbToHex(rgb){
  return '#'+[rgb.r,rgb.g,rgb.b].map((v)=>clampByte(v).toString(16).padStart(2,'0')).join('');
}
function mixHex(a,b,amount){
  const ar=hexToRgb(a), br=hexToRgb(b);
  if(!ar || !br) return a;
  return rgbToHex({r:ar.r+(br.r-ar.r)*amount,g:ar.g+(br.g-ar.g)*amount,b:ar.b+(br.b-ar.b)*amount});
}
function rgbaHex(hex,alpha){
  const rgb=hexToRgb(hex) || {r:0,g:0,b:0};
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}
function normalizeTheme(theme){
  const out={...DEFAULT_THEME};
  for(const key of Object.keys(DEFAULT_THEME)){
    if(theme && /^#[0-9a-f]{6}$/i.test(String(theme[key]||''))) out[key]=theme[key];
  }
  return out;
}
function applyTheme(theme){
  const t=normalizeTheme(theme);
  const root=document.documentElement.style;
  root.setProperty('--bg',t.bg);
  root.setProperty('--bg-2',t.bg2);
  root.setProperty('--panel',t.panel);
  root.setProperty('--panel-2',mixHex(t.panel,t.ink,.08));
  root.setProperty('--surface',t.surface);
  root.setProperty('--surface-2',mixHex(t.surface,t.ink,.08));
  root.setProperty('--ink',t.ink);
  root.setProperty('--muted',t.muted);
  root.setProperty('--quiet',mixHex(t.muted,t.bg,.28));
  root.setProperty('--line',mixHex(t.surface,t.ink,.18));
  root.setProperty('--line-2',mixHex(t.surface,t.ink,.32));
  root.setProperty('--accent',t.accent);
  root.setProperty('--accent-2',t.accent2);
  root.setProperty('--accent-soft',rgbaHex(t.accent,.14));
  root.setProperty('--focus-ring',rgbaHex(t.accent,.24));
  root.setProperty('--accent-grid',rgbaHex(t.accent,.12));
  root.setProperty('--active-ink',mixHex(t.ink,t.accent,.18));
  root.setProperty('--danger',t.danger);
  root.setProperty('--ok',t.accent);
  root.setProperty('--app-shell',rgbaHex(t.bg,.94));
  root.setProperty('--sidebar-a',rgbaHex(mixHex(t.panel,t.ink,.04),.98));
  root.setProperty('--sidebar-b',rgbaHex(mixHex(t.bg,t.surface,.35),.98));
  root.setProperty('--topbar-bg',rgbaHex(t.surface,.78));
  root.setProperty('--composer-bg',rgbaHex(t.surface,.86));
  root.setProperty('--panel-grad-a',rgbaHex(mixHex(t.panel,t.ink,.04),.92));
  root.setProperty('--panel-grad-b',rgbaHex(mixHex(t.panel,t.bg,.35),.94));
  root.setProperty('--chat-grad-a',rgbaHex(t.panel,.92));
  root.setProperty('--chat-grad-b',rgbaHex(t.surface,.98));
  root.setProperty('--button-a',mixHex(t.accent,t.bg,.46));
  root.setProperty('--button-b',mixHex(t.accent,t.bg,.6));
  root.setProperty('--button-hover-a',mixHex(t.accent,t.ink,.12));
  root.setProperty('--button-hover-b',mixHex(t.accent,t.bg,.48));
  root.setProperty('--placeholder',mixHex(t.muted,t.bg,.18));
}
function currentTheme(){
  try{ return normalizeTheme(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)||'null')); }
  catch{ return {...DEFAULT_THEME}; }
}
function saveTheme(theme){
  const t=normalizeTheme(theme);
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t));
  applyTheme(t);
  return t;
}
function resetTheme(){
  localStorage.removeItem(THEME_STORAGE_KEY);
  applyTheme(DEFAULT_THEME);
}
function formatBytes(bytes){
  if(bytes < 1024) return `${bytes} B`;
  if(bytes < 1024*1024) return `${Math.round(bytes/1024)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
}
function normalizeMime(mime){
  return String(mime || '').toLowerCase().split(';')[0].trim();
}
function registerDisplayName(name){
  const clean=String(name || '').trim();
  if(clean) knownDisplayNames.add(clean);
}
function getMentionCandidates(query=''){
  const q=String(query || '').trim().toLowerCase();
  const list=[...knownDisplayNames].sort((a,b)=>a.localeCompare(b));
  if(!q) return list.slice(0,8);
  return list.filter((name)=>name.toLowerCase().includes(q)).slice(0,8);
}
function findMentionMatch(rawName){
  const target=String(rawName || '').toLowerCase();
  if(!target) return '';
  for(const name of knownDisplayNames){
    if(name.toLowerCase()===target) return name;
  }
  return '';
}
function linkifyText(text){
  const input=String(text ?? '');
  const urlRe=/https?:\/\/[^\s<>"']+|www\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+[^\s<>"']*/gi;
  const trailingPunct=/[),.;:!?]+$/;
  let out='';
  let last=0;
  for(const m of input.matchAll(urlRe)){
    const idx=m.index ?? 0;
    let raw=m[0];
    let suffix='';
    const trim=raw.match(trailingPunct);
    if(trim){
      suffix=trim[0];
      raw=raw.slice(0, raw.length-suffix.length);
    }
    if(!raw) continue;
    const isHTTP=/^https?:\/\//i.test(raw);
    const href=isHTTP ? raw : `https://${raw}`;
    const label=raw;
    out += esc(input.slice(last, idx));
    out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>${esc(suffix)}`;
    last = idx + m[0].length;
  }
  out += esc(input.slice(last));
  return out;
}
function renderMentions(text){
  return String(text ?? '').replace(/(^|[\s(])@([a-z0-9._-]{1,48})\b/gi,(all,prefix,raw)=>{
    const match=findMentionMatch(raw);
    if(!match) return `${prefix}@${raw}`;
    return `${prefix}<span class="mention">@${esc(match)}</span>`;
  });
}
function renderRichText(text){
  return renderMentions(linkifyText(text));
}
function bytesToHex(bytes){ let out=''; for(const b of bytes) out += b.toString(16).padStart(2,'0'); return out; }
function hexToBytes(hex){ if(typeof hex!=='string' || hex.length%2!==0) throw new Error('invalid hex'); const out=new Uint8Array(hex.length/2); for(let i=0;i<hex.length;i+=2) out[i/2]=parseInt(hex.slice(i,i+2),16); return out; }
function randomBytes(n){ const a=new Uint8Array(n); crypto.getRandomValues(a); return a; }
function randomRoomKeyHex(){ return bytesToHex(randomBytes(32)); }
function generatePassphrase(){ return [0,0,0,0,0].map(()=>PASSPHRASE_WORDS[Math.floor(Math.random()*PASSPHRASE_WORDS.length)]).join(' '); }

async function importRoomKey(roomKeyHex){
  const raw = hexToBytes(roomKeyHex);
  if(raw.length!==32) throw new Error('Invalid room key length');
  return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}
async function encryptText(roomKeyHex,text){
  const key=await importRoomKey(roomKeyHex);
  const nonce=randomBytes(12);
  const plain=new TextEncoder().encode(text);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},key,plain);
  return {ciphertext:bytesToHex(new Uint8Array(ct)),nonce:bytesToHex(nonce)};
}
async function decryptText(roomKeyHex,nonceHex,ctHex){
  const key=await importRoomKey(roomKeyHex);
  const nonce=hexToBytes(nonceHex);
  const ct=hexToBytes(ctHex);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},key,ct);
  return new TextDecoder().decode(plain);
}
async function deriveWrapKey(passphrase,salt,iterations){
  const base=await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations,hash:'SHA-256'},base,{name:'AES-GCM',length:256},true,['encrypt','decrypt']);
}
async function wrapRoomKeyWithPassphrase(roomKeyHex,passphrase){
  const salt=randomBytes(16); const nonce=randomBytes(12);
  const wrapKey=await deriveWrapKey(passphrase,salt,PBKDF2_ITERS);
  const roomRaw=hexToBytes(roomKeyHex);
  const wrapped=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce},wrapKey,roomRaw);
  return {kdf:{name:'PBKDF2-HMAC-SHA256',iterations:PBKDF2_ITERS,salt_hex:bytesToHex(salt)},wrap:{alg:'AES-256-GCM',nonce_hex:bytesToHex(nonce),ciphertext_hex:bytesToHex(new Uint8Array(wrapped))}};
}
function encodeTransferPayload(payload){
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let bin = '';
  for(const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function decodeTransferPayload(code){
  const bin = atob(String(code||'').trim());
  const bytes = Uint8Array.from(bin, (ch)=>ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function createDeviceSyncCode(passphrase){
  if(!roomKeyHex) throw new Error('No room key available');
  if(!currentCredentialId) throw new Error('No credential id available');
  const wrapped = await wrapRoomKeyWithPassphrase(roomKeyHex, passphrase);
  return encodeTransferPayload({
    format:'veil.device.v1',
    created_at:new Date().toISOString(),
    server_base:location.origin,
    credential_id:currentCredentialId,
    display_name:currentDisplayName||'',
    ...wrapped
  });
}
async function importDeviceSyncCode(code, passphrase){
  const payload = decodeTransferPayload(code);
  if(!payload || payload.format!=='veil.device.v1' || !payload.credential_id || !payload.wrap || !payload.kdf){
    throw new Error('Invalid device sync code');
  }
  const rk = await unwrapRoomKeyWithPassphrase(payload, passphrase);
  roomKeyHex = rk;
  currentCredentialId = payload.credential_id || '';
  currentDisplayName = payload.display_name || '';
  persistIdentity();
  const r = await api('/api/session/from-credential',{method:'POST',body:JSON.stringify({credential_id:currentCredentialId})});
  if(!r.ok) throw new Error(r.data.error || 'Session restore failed');
}
async function unwrapRoomKeyWithPassphrase(cfg,passphrase){
  const salt=hexToBytes(cfg.kdf.salt_hex);
  const nonce=hexToBytes(cfg.wrap.nonce_hex);
  const ciphertext=hexToBytes(cfg.wrap.ciphertext_hex);
  const wrapKey=await deriveWrapKey(passphrase,salt,cfg.kdf.iterations||PBKDF2_ITERS);
  const roomRaw=await crypto.subtle.decrypt({name:'AES-GCM',iv:nonce},wrapKey,ciphertext);
  const roomBytes=new Uint8Array(roomRaw);
  if(roomBytes.length!==32) throw new Error('Invalid room key in file');
  return bytesToHex(roomBytes);
}
function drawLine(name,text,ts=''){ const c=userColor(name); return `<div class="line"><span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-text">${renderRichText(text)}</span></div>`; }
function parseMessagePayload(text){
  try{
    const payload=JSON.parse(text);
    if(!payload || payload.v!==1) return {type:'text', text};
    const mime=normalizeMime(payload.mime);
    if(payload.type==='image' && IMAGE_TYPES.has(mime) && typeof payload.data==='string'){
      return {
        type:'image',
        mime,
        data:payload.data,
        name:typeof payload.name==='string' ? payload.name.slice(0,120) : 'image',
        size:Number.isFinite(payload.size) ? payload.size : 0,
        caption:typeof payload.caption==='string' ? payload.caption : ''
      };
    }
    if(payload.type==='file' && typeof payload.data==='string'){
      return {
        type:'file',
        mime:mime || 'application/octet-stream',
        data:payload.data,
        name:typeof payload.name==='string' ? payload.name.slice(0,120) : 'attachment.bin',
        size:Number.isFinite(payload.size) ? payload.size : 0,
        caption:typeof payload.caption==='string' ? payload.caption : ''
      };
    }
  }catch{}
  return {type:'text', text};
}
function drawMessage(name,text,ts=''){
  const c=userColor(name);
  const payload=parseMessagePayload(text);
  if(payload.type==='file'){
    const src=`data:${payload.mime};base64,${payload.data}`;
    const caption=payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
    return `<div class="line"><span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-media"><a class="file-link" href="${esc(src)}" download="${esc(payload.name)}">${esc(payload.name)}</a><span class="image-meta">${esc(payload.mime)} · ${esc(formatBytes(payload.size))}</span>${caption}</span></div>`;
  }
  if(payload.type!=='image') return drawLine(name,text,ts);
  const src=`data:${payload.mime};base64,${payload.data}`;
  const caption=payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
  return `<div class="line"><span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-media"><img class="chat-image" src="${esc(src)}" alt="${esc(payload.name)}" data-full-image="${esc(src)}"/><span class="image-meta">${esc(payload.name)} · ${esc(formatBytes(payload.size))}</span>${caption}</span></div>`;
}
function scrollChatToBottom(){
  const messages=$('messages');
  if(!messages) return;
  const scroll=()=>{
    messages.scrollTop=messages.scrollHeight;
    if(messages.parentElement) messages.parentElement.scrollTop=messages.parentElement.scrollHeight;
  };
  scroll();
  requestAnimationFrame(scroll);
  setTimeout(scroll,50);
  setTimeout(scroll,250);
  setTimeout(scroll,750);
}
function bindMessageImageScroll(){
  const messages=$('messages');
  if(!messages) return;
  messages.querySelectorAll('img.chat-image').forEach((img)=>{
    if(img.dataset.scrollBound==='1') return;
    img.dataset.scrollBound='1';
    img.addEventListener('load',scrollChatToBottom,{once:true});
  });
}

function persistIdentity(){
  localStorage.setItem('veil.credentialId', currentCredentialId);
  localStorage.setItem('veil.displayName', currentDisplayName);
  localStorage.setItem('veil.roomKeyHex', roomKeyHex);
}

function clearInviteTokenFromURL(){
  if(!window.location.pathname.startsWith('/invite/')) return;
  const cleanURL = '/' + window.location.search + window.location.hash;
  window.history.replaceState({}, '', cleanURL);
}

function setStatus(el, text, tone=''){
  if(!el) return;
  el.textContent = text;
  el.className = tone ? `status ${tone}` : 'status';
}

function bindImageLightbox(){
  const lightbox=$('imageLightbox');
  const img=$('imageLightboxImg');
  if(!lightbox || !img || lightbox.dataset.bound==='1') return;
  lightbox.dataset.bound='1';

  document.addEventListener('click',(e)=>{
    const target=e.target;
    if(!(target instanceof HTMLImageElement) || !target.dataset.fullImage) return;
    img.src=target.dataset.fullImage;
    img.alt=target.alt || 'Image preview';
    lightbox.classList.add('open');
  });
  lightbox.addEventListener('click',()=>{
    lightbox.classList.remove('open');
    img.removeAttribute('src');
  });
  document.addEventListener('keydown',(e)=>{
    if(e.key!=='Escape' || !lightbox.classList.contains('open')) return;
    lightbox.classList.remove('open');
    img.removeAttribute('src');
  });
}

async function joinWithToken(token, name){
  const credentialId = crypto.randomUUID();
  const res = await api('/api/join',{method:'POST',body:JSON.stringify({token,display_name:name,public_key:'mvp',credential_id:credentialId})});
  if(!res.ok) return res;
  currentCredentialId = credentialId;
  currentDisplayName = name;
  if (res.data && typeof res.data.room_key_enc === 'string' && res.data.room_key_enc.length > 0) {
    roomKeyHex = res.data.room_key_enc;
  }
  persistIdentity();
  return res;
}

async function bootstrapRoom(room, name){
  const credentialId = crypto.randomUUID();
  roomKeyHex = randomRoomKeyHex();
  const res=await api('/api/bootstrap',{method:'POST',body:JSON.stringify({room_name:room,display_name:name,public_key:'mvp',credential_id:credentialId,room_key_enc:roomKeyHex})});
  if(!res.ok) return res;
  currentCredentialId = credentialId;
  currentDisplayName = name;
  persistIdentity();
  return res;
}

async function refreshAdminIdentity(){
  const me = await api('/api/admin/users');
  if(!me.ok) return;
  myRole = me.data.my_role || myRole;
  myUserID = me.data.me || myUserID;
}

async function refreshRoomName(){
  const info = await api('/api/room');
  if(!info.ok) return;
  roomName = (info.data && info.data.room_name) ? String(info.data.room_name).trim() : roomName;
}

async function exportKeys(passphrase){
  if(!roomKeyHex) throw new Error('No room key to export');
  const wrapped=await wrapRoomKeyWithPassphrase(roomKeyHex, passphrase);
  const payload={format:'veil.keys.v3',created_at:new Date().toISOString(),server_base:location.origin,credential_id:currentCredentialId||'',display_name:currentDisplayName||'',...wrapped};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download='room.keys'; a.style.display='none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

function navHTML(){
  const canOpenControl = isAdminRole(myRole);
  return `
    <aside class="sidebar">
      <div class="brand"><div class="eyebrow">encrypted room</div><h1>Veil</h1><span class="muted">private realtime chat</span></div>
      <nav class="nav">
        <button class="nav-btn ${currentView===VIEW_CHAT?'active':''}" id="tabChat">Chat</button>
        <button class="nav-btn ${currentView===VIEW_KEYS?'active':''}" id="tabKeys">Keys</button>
        <button class="nav-btn ${currentView===VIEW_THEME?'active':''}" id="tabTheme">Theme</button>
        ${canOpenControl ? `<button class="nav-btn ${currentView===VIEW_CONTROL?'active':''}" id="tabControl">Control</button>` : ''}
      </nav>
      <div></div>
      <div class="whoami"><strong>${esc(currentDisplayName||'Unknown')}</strong><div class="muted">${esc(myRole)}</div></div>
    </aside>
  `;
}

function chatPanelHTML(){
  const title = roomName || 'Room Chat';
  return `
    <section class="main">
      <header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>${esc(title)}</strong><small>AES-GCM end-to-end encrypted</small></div><div class="top-actions"><span class="muted">${esc(currentDisplayName||'member')}</span></div></header>
      <div class="panel chat-panel"><div id="messages" class="chat-log"></div></div>
      <div id="composer" class="composer">
        <div id="attachmentPreview" class="attachment-preview"></div>
        <input id="m" placeholder="Type message" enterkeyhint="send" autocomplete="off"/>
        <div id="mentionPicker" class="mention-picker" aria-label="Mention picker"></div>
        <button id="attachToggle" class="secondary emoji-btn" type="button" title="Attach image or file" aria-label="Attach image or file">+</button>
        <input id="attachFileInput" type="file" accept="image/png,image/jpeg,image/webp,image/gif,*/*" hidden />
        <div class="emoji-wrap">
          <button id="emojiToggle" class="secondary emoji-btn" type="button" title="Emoji (Ctrl+E)" aria-label="Emoji" aria-expanded="false">☺</button>
          <div id="emojiPicker" class="emoji-picker" aria-label="Emoji picker" role="listbox">
            ${EMOJI_CHOICES.map((emoji)=>`<button class="emoji-choice" type="button" data-emoji="${esc(emoji)}" title="${esc(emoji)}" aria-label="Insert ${esc(emoji)}" role="option">${esc(emoji)}</button>`).join('')}
          </div>
        </div>
        <button id="send">Send</button>
      </div>
    </section>
  `;
}

function keysPanelHTML(){
  return `
    <section class="main utility">
      <header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>Key Vault</strong><small>Backup, restore, and recovery controls</small></div><div class="top-actions"><span class="muted">local only</span></div></header>
      <div class="panel utility-panel">
        <section class="card">
          <h3>Backup + Restore</h3>
          <div class="muted">Use one strong passphrase for export and import. Key material never leaves this browser unencrypted.</div>
          <input id="passphrase" placeholder="Restore passphrase"/>
          <div class="theme-actions">
            <button id="genPass" class="secondary">Generate Passphrase</button>
            <button id="export">Export room.keys (encrypted)</button>
          </div>
          <div class="divider"></div>
          <input id="importFile" type="file" accept=".keys,application/json"/>
          <button id="importBtn" class="secondary">Import + Restore Session</button>
          <div id="importOut" class="status">Store your passphrase securely. Anyone with both files can decrypt room history.</div>
          <div class="status-note">Tip: after admin-level removals, rotate room keys if you need strict forward secrecy.</div>
        </section>
        <section class="card">
          <h3>Add Device (Quick Sync)</h3>
          <div class="muted">Generate a protected sync code and paste it on your other device’s Returning User screen.</div>
          <input id="deviceSyncPassphrase" placeholder="Sync passphrase"/>
          <div class="theme-actions">
            <button id="makeDeviceSync">Generate Sync Code</button>
            <button id="copyDeviceSync" class="secondary">Copy Code</button>
          </div>
          <textarea id="deviceSyncCode" rows="5" placeholder="Device sync code appears here"></textarea>
          <div id="deviceSyncStatus" class="status">Keep this code private. Anyone with code and passphrase can restore this identity.</div>
        </section>
      </div>
    </section>
  `;
}

function themePanelHTML(){
  const t=currentTheme();
  const fields=[
    ['bg','Background','Page base'],
    ['bg2','Depth','Page gradient'],
    ['panel','Panel','Cards and chat log'],
    ['surface','Surface','Inputs and rails'],
    ['ink','Text','Primary copy'],
    ['muted','Muted','Secondary copy'],
    ['accent','Accent','Active states'],
    ['accent2','Secondary','Highlights'],
    ['danger','Danger','Warnings']
  ];
  return `
    <section class="main utility">
      <header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>Theme Studio</strong><small>Custom colors stay in this browser</small></div><div class="top-actions"><span class="muted">local only</span></div></header>
      <div class="panel utility-panel">
        <section class="card">
          <h3>Presets</h3>
          <div class="muted">Start with a preset, then tune individual color tokens below.</div>
          <div class="theme-actions">
            <button class="secondary" data-theme-preset="veil">Veil</button>
            <button class="secondary" data-theme-preset="ember">Ember</button>
            <button class="secondary" data-theme-preset="midnight">Midnight</button>
            <button class="secondary" data-theme-preset="graphite">Graphite</button>
          </div>
          <div class="divider"></div>
          <h3>Custom Theme</h3>
          <div class="theme-grid">
            ${fields.map(([key,label,hint])=>`<div class="theme-row"><label for="theme-${key}">${label}<span>${hint}</span></label><input id="theme-${key}" data-theme-key="${key}" type="color" value="${esc(t[key])}"/></div>`).join('')}
          </div>
          <div class="divider"></div>
          <h3>Chat Identity</h3>
          <div class="theme-row">
            <label for="theme-chat-color">Name Color<span>Used for your display name in chat on this browser</span></label>
            <input id="theme-chat-color" type="color" value="${esc(userColor(currentDisplayName||''))}"/>
          </div>
          <div class="theme-actions">
            <button id="saveTheme">Save Theme</button>
            <button id="resetTheme" class="secondary">Reset</button>
          </div>
          <div id="themeStatus" class="status">Unsaved changes preview immediately.</div>
          <div class="status-note">Theme changes are stored per-browser on this device only.</div>
        </section>
      </div>
    </section>
  `;
}

function controlPanelHTML(){
  const canManageUsers = myRole === 'root_admin';
  return `
    <section class="main utility">
      <header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>Control Center</strong><small>Invites, members, and message retention</small></div><div class="top-actions"><span class="muted">${esc(myRole)}</span></div></header>
      <div class="panel utility-panel">
        <div class="admin-grid">
          <section class="card">
            <h3>Invites</h3>
            <div class="theme-actions">
              <button id="invite">Create Invite</button>
              <button id="revokeUnusedInvites" class="secondary">Revoke Unused</button>
              <button id="purgeUsedRevokedInvites" class="secondary">Purge Used/Revoked</button>
            </div>
            <div id="inviteOut" class="invite-out muted">No invites generated yet.</div>
            <div id="inviteList" class="admin-users"></div>
          </section>
          <section class="card">
            <h3>Message Retention</h3>
            <div id="messageAdminStatus" class="status">Loading message stats...</div>
            <div class="muted">Destructive actions require root admin. Clearing messages affects all clients immediately.</div>
            <div class="theme-actions">
              <input id="retainCountInput" type="number" min="1" step="1" placeholder="Keep latest count"/>
              <button id="retainMessages" class="secondary">Keep Latest</button>
            </div>
            <div class="theme-actions">
              <button id="clearMessages" class="btn-danger">Delete All Messages</button>
            </div>
          </section>

          <section class="card" style="grid-column:1 / -1;">
            <h3>User Roles</h3>
            <div id="roleStatus" class="status">${canManageUsers ? 'Load members to update roles.' : 'Only root admins can change roles.'}</div>
            <div class="muted">Removing a user revokes access immediately. Room key rotation is optional and can be done later if needed.</div>
            <div id="adminUsers" class="admin-users"></div>
            <div class="status-note">Admin changes apply immediately to active sessions.</div>
          </section>
        </div>
      </div>
    </section>
  `;
}

async function bootView(){
  app.innerHTML = `<section class="boot-wrap"><div class="boot-card"><div class="eyebrow">first launch</div><div class="boot-title">Create your Veil room</div><div class="muted">This becomes the private room and your first root admin identity.</div><div class="boot-grid"><input id="room" placeholder="Room name"/><input id="name" placeholder="Display name"/><button id="go">Create Room</button><div id="bootOut" class="status"></div></div></div></section>`;
  $('go').onclick=async()=>{
    const room=$('room').value.trim();
    const name=$('name').value.trim();
    const res=await bootstrapRoom(room, name);
    if(!res.ok){ setStatus($('bootOut'), res.data.error||'failed', 'err'); return; }
    chatView();
  };
}

async function accessView(){
  app.innerHTML = `<section class="boot-wrap"><div class="boot-card auth-shell"><div class="eyebrow">room found</div><div class="boot-title">Welcome Back</div><div class="muted">Restore your saved identity to re-enter this Veil room.</div><section class="auth-card"><h3>Returning User</h3><div class="auth-copy">Import your encrypted <code>room.keys</code> file and unlock it with your passphrase.</div><input id="accessPassphrase" placeholder="Restore passphrase" autocomplete="off"/><input id="accessImportFile" type="file" accept=".keys,application/json"/><div class="auth-actions"><button id="accessImportBtn">Restore Session</button></div><div id="importOut" class="status"></div><div class="status-note">Passphrase and key handling stay in your browser.</div></section><section class="auth-card"><h3>Quick Device Sync</h3><div class="auth-copy">Paste a sync code from another trusted device and enter its sync passphrase.</div><input id="accessDevicePassphrase" placeholder="Sync passphrase" autocomplete="off"/><textarea id="accessDeviceCode" rows="4" placeholder="Paste device sync code"></textarea><div class="auth-actions"><button id="accessDeviceSyncBtn" class="secondary">Import Device Sync</button></div><div id="deviceSyncOut" class="status"></div></section></div></section>`;

  $('accessImportBtn').onclick=async()=>{
    const fileEl=$('accessImportFile'); const out=$('importOut');
    const file=fileEl.files&&fileEl.files[0]; if(!file){ out.textContent='Select a room.keys file first.'; return; }
    const pass=$('accessPassphrase').value.trim(); if(!pass){ out.textContent='Enter restore passphrase first.'; return; }
    try{
      const raw=await file.text(); const cfg=JSON.parse(raw);
      if(!cfg||cfg.format!=='veil.keys.v3'||!cfg.credential_id||!cfg.wrap){ out.textContent='Invalid or legacy key file format.'; return; }
      const rk=await unwrapRoomKeyWithPassphrase(cfg,pass);
      roomKeyHex=rk; currentCredentialId=cfg.credential_id||''; currentDisplayName=cfg.display_name||'';
      persistIdentity();
      const r=await api('/api/session/from-credential',{method:'POST',body:JSON.stringify({credential_id:currentCredentialId})});
      if(!r.ok){ out.textContent=r.data.error||'Import worked, but login failed.'; return; }
      out.textContent='Keys imported and session restored.';
      window.location.reload();
    }catch{
      out.textContent='Could not import keys (wrong passphrase or invalid file).';
    }
  };

  const accessDeviceSyncBtn = $('accessDeviceSyncBtn');
  if(accessDeviceSyncBtn){
    accessDeviceSyncBtn.onclick=async()=>{
      const out = $('deviceSyncOut');
      const pass = $('accessDevicePassphrase').value.trim();
      const code = $('accessDeviceCode').value.trim();
      if(!pass){ out.textContent='Enter sync passphrase first.'; return; }
      if(!code){ out.textContent='Paste a device sync code first.'; return; }
      try{
        await importDeviceSyncCode(code, pass);
        out.textContent='Device sync imported and session restored.';
        window.location.reload();
      }catch(e){
        out.textContent=e.message || 'Could not import device sync code.';
      }
    };
  }

}

async function inviteView(token){
  app.innerHTML = `<section class="boot-wrap"><div class="boot-card auth-shell"><div class="eyebrow">invite link</div><div class="boot-title">Join Veil Room</div><div class="muted">Create your room identity with a display name to continue.</div><section class="auth-card"><h3>New Member</h3><div class="auth-copy">This invite can be used once. After joining, the token is cleared from your address bar automatically.</div><input id="name" placeholder="Display name" autocomplete="nickname"/><div class="auth-actions"><button id="join">Join Securely</button></div><div id="joinOut" class="status">Invite token detected and ready.</div></section></div></section>`;
  $('join').onclick=async()=>{
    const name=$('name').value.trim();
    const out=$('joinOut');
    if(!name){ out.textContent='Display name is required.'; return; }
    const res = await joinWithToken(token, name);
    if(!res.ok){ out.textContent=res.data.error||'Join failed'; return; }
    clearInviteTokenFromURL();
    out.textContent='Joined successfully. Import room.keys to decrypt history.';
    chatView();
  };
}

async function loadHistory(){
  const messages = $('messages');
  if(!messages) return;
  const history = await api('/api/messages');
  if(!history.ok) return;
  seenMessageIDs = new Set();
  messages.innerHTML='';
  for(const m of history.data.messages.reverse()){
    await appendMessageRecord(messages, m);
  }
  bindMessageImageScroll();
  scrollChatToBottom();
}

async function appendMessageRecord(messagesEl, record){
  if(!messagesEl || !record) return false;
  const messageID = String(record.id || '').trim();
  if(messageID){
    if(seenMessageIDs.has(messageID)) return false;
    seenMessageIDs.add(messageID);
  }
  registerDisplayName(record.display_name || '');
  let plain='[decrypt failed]';
  try{ if(roomKeyHex) plain=await decryptText(roomKeyHex,record.nonce,record.ciphertext); }catch{}
  const row = drawMessage(record.display_name, plain, record.created_at || new Date().toISOString());
  messagesEl.insertAdjacentHTML('beforeend', row);
  return true;
}

function scheduleSocketReconnect(){
  if(wsReconnectTimer || currentView!==VIEW_CHAT) return;
  const delay=Math.min(8000, 750 * Math.pow(2, wsReconnectAttempts++));
  wsReconnectTimer=setTimeout(()=>{
    wsReconnectTimer=null;
    ensureSocket();
  },delay);
}

function ensureSocket(){
  if(ws && ws.readyState===WebSocket.OPEN) return Promise.resolve(ws);
  if(ws && ws.readyState===WebSocket.CONNECTING && wsReady) return wsReady;

  const socket = new WebSocket((location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/ws');
  ws = socket;
  wsReady = new Promise((resolve)=>{
    let settled=false;
    const finish=(conn)=>{
      if(settled) return;
      settled=true;
      clearTimeout(timeout);
      resolve(conn);
    };
    const timeout=setTimeout(()=>finish(null),5000);

    socket.onopen=()=>{
      wsReconnectAttempts=0;
      if(currentView===VIEW_CHAT){
        loadHistory();
      }
      finish(socket);
    };
    socket.onerror=()=>finish(null);
  });
  socket.onmessage = async(ev)=>{
    let x;
    try{ x=JSON.parse(ev.data); }catch{ return; }
    if(x.type!=='message') return;
    const messages=document.getElementById('messages');
    if(!messages) return;
    const sender = String((x.data && x.data.display_name) || '').trim();
    await appendMessageRecord(messages, x.data || {});
    bindMessageImageScroll();
    scrollChatToBottom();
  };
  socket.onclose=()=>{
    if(ws===socket) ws=null;
    wsReady=null;
    scheduleSocketReconnect();
  };
  return wsReady;
}

async function renderAdminUsers(){
  const box=document.getElementById('adminUsers');
  const status=document.getElementById('roleStatus');
  if(!box || !status) return;

  const r = await api('/api/admin/users');
  if(!r.ok){
    status.textContent = r.data.error || 'Failed to load users';
    status.className = 'status err';
    box.innerHTML = '';
    return;
  }

  myRole = r.data.my_role || myRole;
  myUserID = r.data.me || myUserID;
  status.className = 'status';
  box.innerHTML='';

  const users = Array.isArray(r.data.users) ? r.data.users : [];
  const seenUserIDs = new Set(users.map((u)=>String(u.id || '')));
  if(myUserID && !seenUserIDs.has(myUserID)){
    users.unshift({id: myUserID, display_name: currentDisplayName || 'You', role: myRole || 'member'});
  }

  if(users.length===0){
    status.textContent = 'No active users returned.';
    status.className = 'status err';
    return;
  }

  for(const u of users){
    const canChange = myRole === 'root_admin' && u.role !== 'root_admin';
    const roleOptions = ['member','admin'].map(role => `<option value="${role}" ${u.role===role?'selected':''}>${role}</option>`).join('');
    const row = document.createElement('div');
    row.className = 'admin-user';
    const isMe = String(u.id||'') === String(myUserID||'');
    row.innerHTML = `<div><strong>${esc(u.display_name)}${isMe?' (you)':''}</strong><div class="admin-role">${esc(u.role)}</div></div>${canChange?`<div class="admin-actions"><select data-user="${esc(u.id)}">${roleOptions}</select><button class="btn-danger" data-remove-user="${esc(u.id)}">Remove</button></div>`:'<div class="muted">locked</div>'}`;
    box.appendChild(row);
  }

  if(myRole !== 'root_admin'){
    status.textContent = 'Members loaded. Root admin permission required to update roles.';
    return;
  }

  box.querySelectorAll('select[data-user]').forEach((sel)=>{
    sel.addEventListener('change', async()=>{
      const userId = sel.getAttribute('data-user');
      const role = sel.value;
      const res = await api('/api/admin/role',{method:'POST',body:JSON.stringify({user_id:userId,role})});
      if(!res.ok){
        status.textContent = res.data.error || 'Failed to update role';
        status.className = 'status err';
        await renderAdminUsers();
        return;
      }
      status.textContent = 'Role updated.';
      status.className = 'status ok';
      await renderAdminUsers();
    });
  });

  box.querySelectorAll('button[data-remove-user]').forEach((btn)=>{
    btn.addEventListener('click', async()=>{
      const userId = btn.getAttribute('data-remove-user');
      if(!confirm('Remove this user and revoke access?')) return;
      const res = await api('/api/admin/remove-user',{method:'POST',body:JSON.stringify({user_id:userId})});
      if(!res.ok){
        status.textContent = res.data.error || 'Failed to remove user';
        status.className = 'status err';
        return;
      }
      status.textContent = 'User removed. Access revoked.';
      status.className = 'status ok';
      await renderAdminUsers();
    });
  });
}

function bindChatActions(){
  const sendBtn=$('send');
  const input=$('m');
  if(!sendBtn || !input) return;
  const preview=$('attachmentPreview');
  const mentionPicker=$('mentionPicker');
  const composer=$('composer');
  const messages=$('messages');
  const emojiToggle=$('emojiToggle');
  const emojiPicker=$('emojiPicker');
  const attachToggle=$('attachToggle');
  const attachFileInput=$('attachFileInput');
  let mentionOpen=false;
  let mentionQuery='';
  let mentionStart=-1;
  let mentionCandidates=[];
  let mentionIndex=0;
  registerDisplayName(currentDisplayName);
  activeEmojiPicker=emojiPicker;
  activeEmojiToggle=emojiToggle;
  const emojiButtons=emojiPicker ? [...emojiPicker.querySelectorAll('button[data-emoji]')] : [];

  const closeEmojiPicker=()=>{
    if(!emojiPicker || !emojiToggle) return;
    emojiPicker.classList.remove('open');
    emojiToggle.setAttribute('aria-expanded','false');
  };
  const toggleEmojiPicker=()=>{
    if(!emojiPicker || !emojiToggle) return;
    const open=!emojiPicker.classList.contains('open');
    emojiPicker.classList.toggle('open',open);
    emojiToggle.setAttribute('aria-expanded',String(open));
  };
  const insertEmoji=(emoji)=>{
    const start=input.selectionStart ?? input.value.length;
    const end=input.selectionEnd ?? input.value.length;
    input.value=input.value.slice(0,start)+emoji+input.value.slice(end);
    const cursor=start+emoji.length;
    input.setSelectionRange(cursor,cursor);
    input.focus();
  };
  const convertInputEmoticons=()=>{
    const before=input.value;
    const after=convertEmoticons(before);
    if(after===before) return;
    const diff=before.length-after.length;
    const start=input.selectionStart ?? after.length;
    const end=input.selectionEnd ?? after.length;
    input.value=after;
    input.setSelectionRange(Math.max(0,start-diff), Math.max(0,end-diff));
  };
  const clearAttachment=()=>{
    pendingAttachment=null;
    if(preview){
      preview.classList.remove('ready');
      preview.innerHTML='';
    }
  };
  const closeMentionPicker=()=>{
    mentionOpen=false;
    mentionQuery='';
    mentionStart=-1;
    mentionCandidates=[];
    mentionIndex=0;
    if(mentionPicker){
      mentionPicker.classList.remove('open');
      mentionPicker.innerHTML='';
    }
  };
  const applyMention=(name)=>{
    if(mentionStart<0) return;
    const start=mentionStart;
    const end=input.selectionStart ?? input.value.length;
    input.value=input.value.slice(0,start)+`@${name} `+input.value.slice(end);
    const cursor=start+name.length+2;
    input.setSelectionRange(cursor,cursor);
    input.focus();
    closeMentionPicker();
  };
  const renderMentionPicker=()=>{
    if(!mentionPicker) return;
    mentionCandidates=getMentionCandidates(mentionQuery);
    if(mentionCandidates.length===0){
      closeMentionPicker();
      return;
    }
    mentionOpen=true;
    mentionIndex=Math.max(0, Math.min(mentionIndex, mentionCandidates.length-1));
    mentionPicker.classList.add('open');
    mentionPicker.innerHTML=mentionCandidates.map((name,idx)=>`<button type="button" class="mention-choice${idx===mentionIndex?' active':''}" data-mention-name="${esc(name)}">@${esc(name)}</button>`).join('');
    mentionPicker.querySelectorAll('button[data-mention-name]').forEach((btn)=>{
      btn.addEventListener('click',()=>{
        applyMention(btn.getAttribute('data-mention-name') || '');
      });
    });
  };
  const refreshMentionPicker=()=>{
    const cursor=input.selectionStart ?? input.value.length;
    const before=input.value.slice(0,cursor);
    const at=before.lastIndexOf('@');
    if(at<0){ closeMentionPicker(); return; }
    const prefix=before.slice(at+1);
    if(/\s/.test(prefix) || prefix.length>48 || /[^a-z0-9._-]/i.test(prefix)){ closeMentionPicker(); return; }
    mentionStart=at;
    mentionQuery=prefix;
    mentionIndex=0;
    renderMentionPicker();
  };
  const showAttachment=()=>{
    if(!preview || !pendingAttachment) return;
    preview.classList.add('ready');
    const previewMedia=pendingAttachment.kind==='image' ? `<img src="${esc(pendingAttachment.url)}" alt="${esc(pendingAttachment.name)}"/>` : `<div class="attachment-file-icon" aria-hidden="true">FILE</div>`;
    preview.innerHTML=`${previewMedia}<div><strong>${esc(pendingAttachment.name)}</strong><small>${esc(pendingAttachment.mime)} · ${esc(formatBytes(pendingAttachment.size))}</small></div><button id="clearAttachment" class="secondary" type="button">Remove</button>`;
    const clearBtn=$('clearAttachment');
    if(clearBtn) clearBtn.onclick=clearAttachment;
  };
  const attachFile=async(file)=>{
    if(!file) return;
    const mime=normalizeMime(file.type) || 'application/octet-stream';
    if(IMAGE_TYPES.has(mime) && file.size > IMAGE_MAX_BYTES){
      alert(`Image is too large. Limit is ${formatBytes(IMAGE_MAX_BYTES)} (GIF supported).`);
      return;
    }
    if(file.size > ATTACHMENT_MAX_BYTES){
      alert(`Attachment is too large. Limit is ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
      return;
    }
    const dataURL=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(reader.error||new Error('read failed'));
      reader.readAsDataURL(file);
    });
    const marker=`data:${mime};base64,`;
    if(!dataURL.startsWith(marker)){
      alert('Attachment could not be prepared safely.');
      return;
    }
    pendingAttachment={kind:IMAGE_TYPES.has(mime) ? 'image' : 'file', name:file.name||'attachment.bin', mime, size:file.size, data:dataURL.slice(marker.length), url:dataURL};
    showAttachment();
  };

  if(attachToggle && attachFileInput){
    attachToggle.onclick=()=>attachFileInput.click();
    attachFileInput.addEventListener('change',()=>{
      const file=attachFileInput.files && attachFileInput.files[0];
      if(!file) return;
      attachFile(file).catch(()=>alert('Attachment failed.'));
      attachFileInput.value='';
      input.focus();
    });
  }

  if(emojiToggle && emojiPicker){
    emojiToggle.onclick=()=>{
      toggleEmojiPicker();
      input.focus();
    };
    emojiButtons.forEach((btn)=>{
      btn.addEventListener('click',()=>{
        insertEmoji(btn.dataset.emoji || '');
        closeEmojiPicker();
      });
      btn.addEventListener('keydown',(e)=>{
        const idx=emojiButtons.indexOf(btn);
        const cols=8;
        let next=-1;
        if(e.key==='ArrowRight') next=idx+1;
        if(e.key==='ArrowLeft') next=idx-1;
        if(e.key==='ArrowDown') next=idx+cols;
        if(e.key==='ArrowUp') next=idx-cols;
        if(e.key==='Home') next=0;
        if(e.key==='End') next=emojiButtons.length-1;
        if(e.key==='Escape'){
          e.preventDefault();
          closeEmojiPicker();
          input.focus();
          return;
        }
        if(e.key==='Enter' || e.key===' '){
          e.preventDefault();
          insertEmoji(btn.dataset.emoji || '');
          closeEmojiPicker();
          return;
        }
        if(next>=0 && next<emojiButtons.length){
          e.preventDefault();
          emojiButtons[next].focus();
        }
      });
    });
    if(!emojiOutsideHandlerBound){
      emojiOutsideHandlerBound=true;
      document.addEventListener('click',(e)=>{
        if(!activeEmojiPicker || !activeEmojiToggle) return;
        if(!activeEmojiPicker.contains(e.target) && e.target!==activeEmojiToggle){
          activeEmojiPicker.classList.remove('open');
          activeEmojiToggle.setAttribute('aria-expanded','false');
        }
      },{capture:true});
    }
  }
  if(preview && pendingAttachment) showAttachment();
  if(input) input.addEventListener('input',refreshMentionPicker);

  input.addEventListener('paste',(e)=>{
    const item=[...(e.clipboardData?.items || [])].find((it)=>it.kind==='file' && IMAGE_TYPES.has(it.type));
    if(!item) return;
    const file=item.getAsFile();
    if(!file) return;
    e.preventDefault();
    attachFile(file).catch(()=>alert('Image paste failed.'));
  });

  input.addEventListener('dragover',(e)=>{
    if([...(e.dataTransfer?.items || [])].some((it)=>it.kind==='file' && IMAGE_TYPES.has(it.type))){
      e.preventDefault();
      input.classList.add('drop-ready');
    }
  });
  input.addEventListener('dragleave',()=>input.classList.remove('drop-ready'));
  input.addEventListener('drop',(e)=>{
    input.classList.remove('drop-ready');
    const file=[...(e.dataTransfer?.files || [])].find((f)=>IMAGE_TYPES.has(f.type));
    if(!file) return;
    e.preventDefault();
    attachFile(file).catch(()=>alert('Image drop failed.'));
  });
  if(composer){
    composer.addEventListener('dragover',(e)=>{
      if([...(e.dataTransfer?.items || [])].some((it)=>it.kind==='file' && IMAGE_TYPES.has(it.type))){
        e.preventDefault();
        input.classList.add('drop-ready');
      }
    });
    composer.addEventListener('dragleave',()=>input.classList.remove('drop-ready'));
    composer.addEventListener('drop',(e)=>{
      input.classList.remove('drop-ready');
      const file=[...(e.dataTransfer?.files || [])].find((f)=>IMAGE_TYPES.has(f.type));
      if(!file) return;
      e.preventDefault();
      attachFile(file).catch(()=>alert('Image drop failed.'));
    });
  }
  if(messages){
    messages.addEventListener('dragover',(e)=>{
      if([...(e.dataTransfer?.items || [])].some((it)=>it.kind==='file' && IMAGE_TYPES.has(it.type))){
        e.preventDefault();
        input.classList.add('drop-ready');
      }
    });
    messages.addEventListener('dragleave',()=>input.classList.remove('drop-ready'));
    messages.addEventListener('drop',(e)=>{
      input.classList.remove('drop-ready');
      const file=[...(e.dataTransfer?.files || [])].find((f)=>IMAGE_TYPES.has(f.type));
      if(!file) return;
      e.preventDefault();
      attachFile(file).catch(()=>alert('Image drop failed.'));
      input.focus();
    });
  }

  sendBtn.onclick=async()=>{
    convertInputEmoticons();
    const text=input.value.trim();
    if(!text && !pendingAttachment) return;
    if(!roomKeyHex){ alert('No room key loaded. Import room.keys first.'); return; }
    try{
      const payload=pendingAttachment ? JSON.stringify({v:1,type:pendingAttachment.kind,mime:pendingAttachment.mime,name:pendingAttachment.name,size:pendingAttachment.size,data:pendingAttachment.data,caption:text}) : text;
      const enc=await encryptText(roomKeyHex,payload);
      const conn=await ensureSocket();
      if(!conn || conn.readyState!==WebSocket.OPEN){
        alert('Connection lost. Reconnecting...');
        scheduleSocketReconnect();
        return;
      }
      conn.send(JSON.stringify({ciphertext:enc.ciphertext,nonce:enc.nonce}));
      input.value='';
      clearAttachment();
      closeMentionPicker();
      input.focus();
    }catch{ alert('Message could not be sent.'); }
  };
  input.addEventListener('keydown',(e)=>{
    if(mentionOpen){
      if(e.key==='ArrowDown'){
        e.preventDefault();
        mentionIndex=(mentionIndex+1)%mentionCandidates.length;
        renderMentionPicker();
        return;
      }
      if(e.key==='ArrowUp'){
        e.preventDefault();
        mentionIndex=(mentionIndex-1+mentionCandidates.length)%mentionCandidates.length;
        renderMentionPicker();
        return;
      }
      if(e.key==='Enter' || e.key==='Tab'){
        e.preventDefault();
        applyMention(mentionCandidates[mentionIndex] || '');
        return;
      }
      if(e.key==='Escape'){
        e.preventDefault();
        closeMentionPicker();
        return;
      }
    }
    if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='e'){
      e.preventDefault();
      toggleEmojiPicker();
      return;
    }
    if(e.key==='ArrowDown' && emojiPicker && emojiPicker.classList.contains('open') && emojiButtons[0]){
      e.preventDefault();
      emojiButtons[0].focus();
      return;
    }
    if(e.key==='Escape'){
      closeEmojiPicker();
      closeMentionPicker();
    }
    if(e.key===' '){
      setTimeout(convertInputEmoticons,0);
      return;
    }
    if(e.key==='Enter'){
      e.preventDefault();
      sendBtn.click();
    }
  });
  document.addEventListener('click',(e)=>{
    if(!mentionPicker || !input) return;
    if(e.target===input || mentionPicker.contains(e.target)) return;
    closeMentionPicker();
  },{capture:true});
}

function bindKeyActions(){
  const genPass=$('genPass');
  if(genPass) genPass.onclick=()=>{ $('passphrase').value=generatePassphrase(); };

  const exportBtn=$('export');
  if(exportBtn){
    exportBtn.onclick=async()=>{
      const out=$('importOut');
      let pass=$('passphrase').value.trim();
      if(!pass){ pass=generatePassphrase(); $('passphrase').value=pass; }
      setStatus(out, 'Preparing encrypted key export...');
      exportBtn.disabled=true;
      try{ await exportKeys(pass); setStatus(out, `Exported encrypted keys. Save this passphrase: ${pass}`, 'ok'); }
      catch(e){ setStatus(out, e.message||'Export failed', 'err'); }
      finally{ exportBtn.disabled=false; }
    };
  }

  const importBtn=$('importBtn');
  if(importBtn){
    importBtn.onclick=async()=>{
      const fileEl=$('importFile'); const out=$('importOut');
      const file=fileEl.files&&fileEl.files[0]; if(!file){ setStatus(out, 'Select a room.keys file first.', 'err'); return; }
      const pass=$('passphrase').value.trim(); if(!pass){ setStatus(out, 'Enter restore passphrase first.', 'err'); return; }
      try{
        const raw=await file.text(); const cfg=JSON.parse(raw);
        if(!cfg||cfg.format!=='veil.keys.v3'||!cfg.credential_id||!cfg.wrap){ setStatus(out, 'Invalid or legacy key file format.', 'err'); return; }
        const rk=await unwrapRoomKeyWithPassphrase(cfg,pass);
        roomKeyHex=rk; currentCredentialId=cfg.credential_id||''; currentDisplayName=cfg.display_name||'';
        persistIdentity();
        const r=await api('/api/session/from-credential',{method:'POST',body:JSON.stringify({credential_id:currentCredentialId})});
        if(!r.ok){ setStatus(out, r.data.error||'Import worked, but login failed.', 'err'); return; }
        setStatus(out, 'Keys imported and session restored.', 'ok');
        window.location.reload();
      }catch{ setStatus(out, 'Could not import keys (wrong passphrase or invalid file).', 'err'); }
    };
  }

  const makeDeviceSyncBtn = $('makeDeviceSync');
  const copyDeviceSyncBtn = $('copyDeviceSync');
  if(makeDeviceSyncBtn){
    makeDeviceSyncBtn.onclick=async()=>{
      const out=$('deviceSyncStatus');
      const pass=$('deviceSyncPassphrase').value.trim();
      const codeEl=$('deviceSyncCode');
      if(!pass){ setStatus(out, 'Enter a sync passphrase first.', 'err'); return; }
      try{
        const code = await createDeviceSyncCode(pass);
        codeEl.value = code;
        setStatus(out, 'Device sync code generated.', 'ok');
      }catch(e){
        setStatus(out, e.message || 'Failed to generate sync code.', 'err');
      }
    };
  }
  if(copyDeviceSyncBtn){
    copyDeviceSyncBtn.onclick=async()=>{
      const out=$('deviceSyncStatus');
      const codeEl=$('deviceSyncCode');
      const code=String(codeEl.value || '').trim();
      if(!code){ setStatus(out, 'Generate a sync code first.', 'err'); return; }
      try{
        await navigator.clipboard.writeText(code);
        setStatus(out, 'Sync code copied.', 'ok');
      }catch{
        codeEl.focus();
        codeEl.select();
        setStatus(out, 'Copy failed. Code selected for manual copy.', 'err');
      }
    };
  }
}

function bindThemeActions(){
  const status=$('themeStatus');
  const inputs=[...document.querySelectorAll('input[data-theme-key]')];
  const chatColorInput=$('theme-chat-color');
  const readThemeFromInputs=()=>{
    const theme={};
    for(const input of inputs) theme[input.dataset.themeKey]=input.value;
    return normalizeTheme(theme);
  };
  const fillInputs=(theme)=>{
    const t=normalizeTheme(theme);
    for(const input of inputs) input.value=t[input.dataset.themeKey];
  };

  inputs.forEach((input)=>{
    input.addEventListener('input',()=>{
      applyTheme(readThemeFromInputs());
      setStatus(status, 'Previewing unsaved theme.');
    });
  });

  document.querySelectorAll('button[data-theme-preset]').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      const preset=THEME_PRESETS[btn.dataset.themePreset] || DEFAULT_THEME;
      fillInputs(preset);
      saveTheme(preset);
      setStatus(status, 'Theme preset saved.', 'ok');
    });
  });

  const saveBtn=$('saveTheme');
  if(saveBtn){
    saveBtn.onclick=()=>{
      saveTheme(readThemeFromInputs());
      setStatus(status, 'Theme saved.', 'ok');
    };
  }

  const resetBtn=$('resetTheme');
  if(resetBtn){
    resetBtn.onclick=()=>{
      resetTheme();
      fillInputs(DEFAULT_THEME);
      if(chatColorInput) chatColorInput.value=userColor(currentDisplayName || '');
      setStatus(status, 'Theme reset.', 'ok');
    };
  }
  if(chatColorInput){
    chatColorInput.addEventListener('input',()=>{
      setUserColor(currentDisplayName || '', chatColorInput.value);
      refreshRenderedUserColor(currentDisplayName || '');
      setStatus(status, 'Previewing chat name color.');
    });
  }
}

function bindControlActions(){
  const inviteBtn=$('invite');
  const inviteOut=$('inviteOut');
  const inviteList=$('inviteList');
  const revokeUnusedBtn=$('revokeUnusedInvites');
  const purgeUsedRevokedBtn=$('purgeUsedRevokedInvites');
  const messageStatus=$('messageAdminStatus');
  const retainCountInput=$('retainCountInput');
  const retainMessagesBtn=$('retainMessages');
  const clearMessagesBtn=$('clearMessages');

  const refreshInvites=async()=>{
    if(!inviteList) return;
    const r=await api('/api/admin/invites');
    if(!r.ok){
      inviteList.innerHTML = `<div class="muted">${esc(r.data.error || 'failed to load invites')}</div>`;
      return;
    }
    inviteList.innerHTML='';
    const invites = [...(r.data.invites || [])];
    invites.sort((a,b)=>{
      const aRemaining=Math.max(0, Number(a.max_uses||0)-Number(a.uses||0));
      const bRemaining=Math.max(0, Number(b.max_uses||0)-Number(b.uses||0));
      const aInactive=!!a.revoked || aRemaining===0;
      const bInactive=!!b.revoked || bRemaining===0;
      if(aInactive===bInactive) return 0;
      return aInactive ? 1 : -1;
    });
    for(const inv of invites){
      const row=document.createElement('div');
      row.className='admin-user';
      const remaining=Math.max(0, Number(inv.max_uses||0)-Number(inv.uses||0));
      const state=inv.revoked ? 'revoked' : (remaining===0 ? 'used' : 'active');
      row.innerHTML=`<div><strong>${esc(inv.id)}</strong><div class="admin-role">${esc(state)} · uses ${esc(String(inv.uses||0))}/${esc(String(inv.max_uses||0))} · expires ${esc(inv.expires_at||'n/a')}</div></div><div class="admin-actions">${inv.revoked?'<span class="muted">locked</span>':`<button class="secondary" data-revoke-invite="${esc(inv.id)}">Revoke</button>`}</div>`;
      inviteList.appendChild(row);
    }
    inviteList.querySelectorAll('button[data-revoke-invite]').forEach((btn)=>{
      btn.addEventListener('click', async()=>{
        const inviteID = btn.getAttribute('data-revoke-invite');
        const resp = await api('/api/admin/revoke-invite',{method:'POST',body:JSON.stringify({invite_id:inviteID})});
        if(!resp.ok){
          if(inviteOut) inviteOut.textContent = resp.data.error || 'failed';
          return;
        }
        if(inviteOut) inviteOut.textContent = `Revoked invite ${inviteID}`;
        refreshInvites();
      });
    });
  };

  const refreshMessageStats=async()=>{
    if(!messageStatus) return;
    const r = await api('/api/admin/messages/stats');
    if(!r.ok){
      messageStatus.textContent = r.data.error || 'failed to load message stats';
      messageStatus.className = 'status err';
      return;
    }
    messageStatus.textContent = `Stored messages: ${r.data.count} · policy days: ${r.data.retain_days || 'off'} · policy count: ${r.data.retain_count || 'off'}`;
    messageStatus.className = 'status';
  };

  if(inviteBtn){
    inviteBtn.onclick=async()=>{
      const r=await api('/api/invite',{method:'POST'});
      if(inviteOut){
        if(r.ok){
          const url = `${location.origin}${r.data.invite_link}`;
          let copied=false;
          try{
            await navigator.clipboard.writeText(url);
            copied=true;
          }catch{}
          inviteOut.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${copied ? '<div class="muted">Copied to clipboard.</div>' : '<div class="muted">Copy to clipboard blocked by browser; link is ready above.</div>'}`;
        }else{
          inviteOut.textContent = r.data.error || 'failed';
        }
      }
      refreshInvites();
    };
  }
  if(revokeUnusedBtn){
    revokeUnusedBtn.onclick=async()=>{
      const r=await api('/api/admin/revoke-unused-invites',{method:'POST',body:JSON.stringify({})});
      if(inviteOut) inviteOut.textContent = r.ok ? `Revoked ${r.data.revoked} unused invites` : (r.data.error || 'failed');
      refreshInvites();
    };
  }
  if(purgeUsedRevokedBtn){
    purgeUsedRevokedBtn.onclick=async()=>{
      const r=await api('/api/admin/purge-used-revoked-invites',{method:'POST',body:JSON.stringify({})});
      if(inviteOut) inviteOut.textContent = r.ok ? `Purged ${r.data.purged} used/revoked invites` : (r.data.error || 'failed');
      refreshInvites();
    };
  }
  if(retainMessagesBtn){
    retainMessagesBtn.onclick=async()=>{
      const keepLatest = Number((retainCountInput && retainCountInput.value) || 0);
      if(!Number.isFinite(keepLatest) || keepLatest <= 0){
        if(messageStatus){
          messageStatus.textContent='Enter a valid keep-latest count.';
          messageStatus.className='status err';
        }
        return;
      }
      if(!confirm(`Keep only the latest ${keepLatest} messages? This cannot be undone.`)) return;
      const r = await api('/api/admin/messages/retain',{method:'POST',body:JSON.stringify({keep_latest:keepLatest})});
      if(!r.ok){
        if(messageStatus){
          messageStatus.textContent = r.data.error || 'failed';
          messageStatus.className = 'status err';
        }
        return;
      }
      if(messageStatus){
        messageStatus.textContent = `Pruned successfully. Remaining messages: ${r.data.remaining}`;
        messageStatus.className = 'status ok';
      }
      refreshMessageStats();
    };
  }
  if(clearMessagesBtn){
    clearMessagesBtn.onclick=async()=>{
      if(!confirm('Delete all messages for all users? This is permanent.')) return;
      const r = await api('/api/admin/messages/clear',{method:'POST',body:JSON.stringify({})});
      if(!r.ok){
        if(messageStatus){
          messageStatus.textContent = r.data.error || 'failed';
          messageStatus.className = 'status err';
        }
        return;
      }
      if(messageStatus){
        messageStatus.textContent = `Deleted ${r.data.deleted} messages.`;
        messageStatus.className = 'status ok';
      }
      refreshMessageStats();
    };
  }

  renderAdminUsers();
  refreshInvites();
  refreshMessageStats();
}

function renderPanelHTML(){
  if(currentView === VIEW_KEYS) return keysPanelHTML();
  if(currentView === VIEW_THEME) return themePanelHTML();
  if(currentView === VIEW_CONTROL) return controlPanelHTML();
  return chatPanelHTML();
}

async function renderMain(){
  if(currentView === VIEW_CONTROL && !isAdminRole(myRole)){
    currentView = VIEW_CHAT;
  }
  app.innerHTML = `<section class="chat-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}"><div id="sidebarBackdrop" class="sidebar-backdrop ${sidebarCollapsed ? '' : 'open'}"></div>${navHTML()}${renderPanelHTML()}</section>`;

  const sidebarToggle=$('sidebarToggle');
  if(sidebarToggle){
    sidebarToggle.onclick=()=>{
      setSidebarCollapsed(!sidebarCollapsed);
      renderMain();
    };
  }
  const sidebarBackdrop=$('sidebarBackdrop');
  if(sidebarBackdrop){
    sidebarBackdrop.onclick=()=>{
      if(shouldAutoCollapseSidebarOnNav()){
        setSidebarCollapsed(true);
        renderMain();
      }
    };
  }
  $('tabChat').onclick=()=>{ currentView=VIEW_CHAT; if(shouldAutoCollapseSidebarOnNav()) setSidebarCollapsed(true); renderMain(); };
  $('tabKeys').onclick=()=>{ currentView=VIEW_KEYS; if(shouldAutoCollapseSidebarOnNav()) setSidebarCollapsed(true); renderMain(); };
  $('tabTheme').onclick=()=>{ currentView=VIEW_THEME; if(shouldAutoCollapseSidebarOnNav()) setSidebarCollapsed(true); renderMain(); };
  const tabControl = $('tabControl');
  if(tabControl){
    tabControl.onclick=()=>{ currentView=VIEW_CONTROL; if(shouldAutoCollapseSidebarOnNav()) setSidebarCollapsed(true); renderMain(); };
  }

  if(currentView===VIEW_CHAT){
    bindChatActions();
    await loadHistory();
    ensureSocket();
    return;
  }
  if(currentView===VIEW_KEYS){
    bindKeyActions();
    return;
  }
  if(currentView===VIEW_THEME){
    bindThemeActions();
    return;
  }
  if(currentView===VIEW_CONTROL){
    if(!isAdminRole(myRole)){
      currentView = VIEW_CHAT;
      return renderMain();
    }
    bindControlActions();
  }
}

async function chatView(){
  await refreshAdminIdentity();
  await refreshRoomName();
  ensureSocket();
  await renderMain();
}

(async()=>{
  if('scrollRestoration' in history) history.scrollRestoration='manual';
  bindImageLightbox();
  applyTheme(currentTheme());
  const path=window.location.pathname;
  const inviteMatch=path.match(/^\/invite\/([^/]+)$/);
  if(inviteMatch){ await inviteView(inviteMatch[1]); return; }

  const h=await api('/health');
  if(!h.ok){ await bootView(); return; }
  const m=await api('/api/messages');
  if(m.ok){ await chatView(); return; }
  if(h.data && h.data.initialized){ await accessView(); return; }
  await bootView();
})();
