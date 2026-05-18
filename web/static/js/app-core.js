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
const VIEW_PROFILE = 'profile';
let currentView = VIEW_CHAT;
let myRole = 'member';
let myUserID = '';
let currentUserChatColor = '';
let currentAvatarRingColor = '';
let currentAvatarRingColor2 = '';
let currentAvatarRingColor3 = '';
let currentAvatarRingColor4 = '';
let currentAvatarRingMode = 'none';
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
const VEIL_THEME = {
  bg:'#0b0f17',
  bg2:'#121827',
  panel:'#141b2b',
  surface:'#0f1523',
  ink:'#e9edf8',
  muted:'#98a6c3',
  accent:'#6fb4ff',
  accent2:'#72e5c2',
  danger:'#ff8c9c',
  mentionSelf:'#4bffa8'
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
  danger:'#ff7f9b',
  mentionSelf:'#4bffa8'
};
const THEME_PRESETS = {
  veil: VEIL_THEME,
  ember: DEFAULT_THEME,
  midnight: {bg:'#08101c',bg2:'#111d33',panel:'#162640',surface:'#0e1a2f',ink:'#e8f1ff',muted:'#98aecf',accent:'#67b6ff',accent2:'#60e3d0',danger:'#ff8ea8',mentionSelf:'#4bffa8'},
  graphite: {bg:'#101214',bg2:'#191d23',panel:'#21262f',surface:'#171b22',ink:'#eef0f4',muted:'#a2acbc',accent:'#8ab4ff',accent2:'#88e0c4',danger:'#ff9aa4',mentionSelf:'#4bffa8'}
};

const esc = (s) => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const hashName = (n) => { let h=0; for(let i=0;i<n.length;i++) h=((h<<5)-h)+n.charCodeAt(i); return Math.abs(h); };
let customUserColors = {};
let historyLoadSeq = 0;
let oldestLoadedRowID = 0;
let hasMoreHistory = true;
let historyLoadingMore = false;
let knownMessages = new Map();
let pendingOutgoing = new Map();
let readReceipts = new Map();
let typingUsers = new Map();
let onlineUsers = new Set();
let roomMembers = [];
let replyToMessageID = '';
let reconnectNeedsCatchup = false;
let typingTimer = null;
const NOTIFY_SOUND_KEY = 'veil.notifySound';
const NOTIFY_VOLUME_KEY = 'veil.notifyVolume';
const SHOW_AVATARS_KEY = 'veil.showAvatars';
const SHOW_AVATAR_RINGS_KEY = 'veil.showAvatarRings';
const TIMESTAMP_MODE_KEY = 'veil.timestampMode';
const LOCAL_BACKGROUND_KEY = 'veil.localBackgroundImage';
const LOCAL_BACKGROUND_STRENGTH_KEY = 'veil.localBackgroundStrength';
let notifySoundEnabled = (() => {
  try {
    return localStorage.getItem(NOTIFY_SOUND_KEY) !== '0';
  } catch {
    return true;
  }
})();
let notifyVolume = (() => {
  try {
    const raw = Number(localStorage.getItem(NOTIFY_VOLUME_KEY));
    if(Number.isFinite(raw)) return Math.max(0, Math.min(2, raw));
  } catch {}
  return 0.25;
})();
let showAvatars = (() => {
  try {
    return localStorage.getItem(SHOW_AVATARS_KEY) !== '0';
  } catch {
    return true;
  }
})();
let showAvatarRings = (() => {
  try {
    return localStorage.getItem(SHOW_AVATAR_RINGS_KEY) !== '0';
  } catch {
    return true;
  }
})();
let timestampMode = (() => {
  try {
    const raw = String(localStorage.getItem(TIMESTAMP_MODE_KEY) || '').trim();
    return raw === 'hover' ? 'hover' : 'always';
  } catch {
    return 'always';
  }
})();
let audioUnlocked = false;
const userColor = (n) => customUserColors[n] || PASTELS[hashName(n) % PASTELS.length];
const isAdminRole = (role) => role === 'root_admin' || role === 'admin';

function normalizeHexColor(value){
  const v=String(value||'').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';
}
function normalizeHexColorAlpha(value){
  const v=String(value||'').trim();
  return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase() : '';
}
function hexColorBase(value, fallback='#000000'){
  const color=normalizeHexColorAlpha(value);
  return color ? color.slice(0,7) : fallback;
}
function hexColorAlpha(value){
  const color=normalizeHexColorAlpha(value);
  if(!color || color.length !== 9) return 100;
  return Math.round((parseInt(color.slice(7,9), 16) / 255) * 100);
}
function hexWithAlpha(value, alphaPercent=100){
  const base=normalizeHexColor(value) || hexColorBase(value, '');
  if(!base) return '';
  const alpha=Math.max(0, Math.min(100, Math.round(Number(alphaPercent))));
  const hex=Math.round((alpha/100)*255).toString(16).padStart(2,'0');
  return alpha >= 100 ? base : `${base}${hex}`;
}
function normalizeAvatarRingMode(value){
  const v=String(value||'').trim().toLowerCase();
  return ['none','pulse','glow','rainbow'].includes(v) ? v : 'none';
}
function avatarRingStyle(record={}, fallbackColor=''){
  if(!showAvatarRings){
    return {color:'', color2:'', mode:'none', className:'avatar-ring', style:''};
  }
  const ringColor=normalizeHexColorAlpha(record.avatar_ring_color || '') || normalizeHexColor(fallbackColor || '');
  const ringColor2=normalizeHexColorAlpha(record.avatar_ring_color2 || '') || ringColor;
  const ringColor3=normalizeHexColorAlpha(record.avatar_ring_color3 || '') || '#57db84';
  const ringColor4=normalizeHexColorAlpha(record.avatar_ring_color4 || '') || '#9d7bff';
  const ringMode=ringColor ? normalizeAvatarRingMode(record.avatar_ring_mode || '') : 'none';
  return {
    color:ringColor,
    color2:ringColor2,
    mode:ringMode,
    className:`avatar-ring${ringColor ? ' has-ring' : ''}${ringMode !== 'none' ? ` ring-${ringMode}` : ''}`,
    style:ringColor ? ` style="--avatar-ring:${esc(ringColor)};--avatar-ring-2:${esc(ringColor2)};--avatar-ring-3:${esc(ringColor3)};--avatar-ring-4:${esc(ringColor4)}"` : ''
  };
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
function setUserColor(name,color){
  const safeName=String(name||'').trim();
  const safeColor=normalizeHexColor(color);
  if(!safeName || !safeColor) return;
  customUserColors[safeName]=safeColor;
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
function cssEscape(value){
  if(window.CSS && typeof window.CSS.escape==='function') return window.CSS.escape(value);
  return String(value).replace(/["\\]/g,'\\$&');
}
function getMessageByID(messageID){
  const id=String(messageID || '').trim();
  if(!id) return null;
  return knownMessages.get(id) || null;
}
function setReplyTarget(messageID){
  replyToMessageID = String(messageID || '').trim();
}
function clearReplyTarget(){
  replyToMessageID = '';
}
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
  root.setProperty('--mention-self',t.mentionSelf);
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
function localBackgroundImage(){
  try{
    const raw=String(localStorage.getItem(LOCAL_BACKGROUND_KEY) || '').trim();
    return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw) ? raw : '';
  }catch{
    return '';
  }
}
function normalizeLocalBackgroundStrength(value){
  const n=Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
}
function localBackgroundStrength(){
  try{
    const raw=localStorage.getItem(LOCAL_BACKGROUND_STRENGTH_KEY);
    return raw === null ? 45 : normalizeLocalBackgroundStrength(raw);
  }catch{
    return 45;
  }
}
function applyLocalBackgroundStrength(strength=localBackgroundStrength()){
  const value=normalizeLocalBackgroundStrength(strength);
  const show=value/100;
  const dim=(lightest,darkest)=>(darkest - ((darkest-lightest)*show)).toFixed(2);
  const root=document.documentElement.style;
  root.setProperty('--local-bg-app-a', dim(.34,.86));
  root.setProperty('--local-bg-app-b', dim(.5,.9));
  root.setProperty('--local-bg-main-a', dim(.22,.8));
  root.setProperty('--local-bg-main-b', dim(.36,.86));
  root.setProperty('--local-bg-chat-a', dim(.2,.78));
  root.setProperty('--local-bg-chat-b', dim(.34,.84));
  root.setProperty('--local-bg-bar', dim(.32,.84));
}
function applyLocalBackground(imageURL=localBackgroundImage()){
  const root=document.documentElement;
  applyLocalBackgroundStrength();
  if(imageURL){
    root.style.setProperty('--local-bg-image', `url("${imageURL}")`);
    root.classList.add('has-local-bg');
  }else{
    root.style.setProperty('--local-bg-image', 'none');
    root.classList.remove('has-local-bg');
  }
}
function saveLocalBackground(imageURL){
  const value=String(imageURL || '').trim();
  if(value){
    localStorage.setItem(LOCAL_BACKGROUND_KEY, value);
  }else{
    localStorage.removeItem(LOCAL_BACKGROUND_KEY);
  }
  applyLocalBackground(value);
}
function saveLocalBackgroundStrength(strength){
  const value=normalizeLocalBackgroundStrength(strength);
  localStorage.setItem(LOCAL_BACKGROUND_STRENGTH_KEY, String(value));
  applyLocalBackgroundStrength(value);
  return value;
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
    const selfMention = !!currentDisplayName && match.toLowerCase()===String(currentDisplayName).toLowerCase();
    const mentionClass = selfMention ? 'mention mention-self' : 'mention';
    return `${prefix}<span class="${mentionClass}">@${esc(match)}</span>`;
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
function drawLine(name,text,ts='', color=''){ const c=color || userColor(name); return `<span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-text">${renderRichText(text)}</span>`; }
function avatarMarkup(name, avatarURL='', record={}){
  const clean = String(name || '').trim();
  const initial = clean ? clean.slice(0, 1).toUpperCase() : '?';
  const src = String(avatarURL || '').trim();
  const ring=avatarRingStyle(record, record.chat_color || userColor(clean || '?'));
  if(isAvatarImageURL(src)){
    return `<span class="${ring.className}"${ring.style}><img class="line-avatar-img" src="${esc(src)}" alt="${esc(clean || 'avatar')}" loading="lazy" /></span>`;
  }
  const bg = userColor(clean || '?');
  return `<span class="${ring.className}"${ring.style}><span class="line-avatar" aria-hidden="true" style="background:${esc(bg)}">${esc(initial)}</span></span>`;
}
function isAvatarImageURL(value){
  const src = String(value || '').trim();
  return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src) || /^\/(static\/avatars|avatars)\/[a-z0-9._-]+(\?[^\s]*)?$/i.test(src);
}
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
    if(payload.type==='text' && typeof payload.text==='string'){
      return {
        type:'text',
        text:payload.text,
        replyToID:typeof payload.reply_to_id==='string' ? payload.reply_to_id : ''
      };
    }
  }catch{}
  return {type:'text', text};
}
function drawMessage(record, text){
  const name = record.display_name || '';
  const ts = record.created_at || '';
  const messageID = String(record.id || '');
  const senderID = String(record.sender_id || '');
  const rowID = Number(record.row_id || 0);
  const isMine = !!myUserID && senderID === myUserID;
  const c=normalizeHexColor(record.chat_color || '') || userColor(name);
  const payload=parseMessagePayload(text);
  const replyToID = String(record.reply_to_id || payload.replyToID || '');
  const deleted = String(record.deleted_at || '').trim() !== '';
  const edited = !deleted && String(record.edited_at || '').trim() !== '';
  const status = isMine ? messageDeliveryLabel(rowID, messageID, senderID) : '';
  const statusHTML = `<span class="line-meta" data-meta-msg="${esc(messageID)}">${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}</span>`;
  const replyHTML = replyToID ? renderReplySnippet(replyToID) : '';
  const actions = `<span class="line-actions">${isMine ? `<button class="tiny-action" data-edit-msg="${esc(messageID)}">Edit</button><button class="tiny-action danger" data-delete-msg="${esc(messageID)}">Delete</button>` : ''}<button class="tiny-action" data-reply-msg="${esc(messageID)}">Reply</button></span>`;
  const lineClass = `line${showAvatars ? '' : ' no-avatar'}`;
  const avatarHTML = showAvatars ? avatarMarkup(name, record.avatar_url || '', record) : '';
  if(deleted){
    return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}${drawLine(name,'[message deleted]',ts,c)}${statusHTML}${actions}</div>`;
  }
  if(payload.type==='file'){
    const src=`data:${payload.mime};base64,${payload.data}`;
    const caption=payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
    return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}<span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-media">${replyHTML}<a class="file-link" href="${esc(src)}" download="${esc(payload.name)}">${esc(payload.name)}</a><span class="image-meta">${esc(payload.mime)} · ${esc(formatBytes(payload.size))}</span>${caption}${statusHTML}${actions}</span></div>`;
  }
  if(payload.type!=='image'){
    const textValue = payload.type === 'text' ? payload.text : text;
    return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}<span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-media">${replyHTML}<span class="line-text">${renderRichText(textValue)}</span>${statusHTML}${actions}</span></div>`;
  }
  const src=`data:${payload.mime};base64,${payload.data}`;
  const caption=payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
  return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}<span class="line-time">${esc(fmtTime(ts))}</span><span class="line-user" data-user-name="${esc(name)}" style="color:${c}">${esc(name)}:</span><span class="line-media">${replyHTML}<img class="chat-image" src="${esc(src)}" alt="${esc(payload.name)}" data-full-image="${esc(src)}"/><span class="image-meta">${esc(payload.name)} · ${esc(formatBytes(payload.size))}</span>${caption}${statusHTML}${actions}</span></div>`;
}
function latestOwnMessageRowID(){
  let maxRow = 0;
  for(const item of knownMessages.values()){
    if(String(item?.sender_id||'')!==String(myUserID||'')) continue;
    const row=Number(item?.row_id||0);
    if(row>maxRow) maxRow=row;
  }
  return maxRow;
}
function messageDeliveryLabel(rowID, messageID, senderID, latestMineRowID=0){
  if(String(senderID||'')!==String(myUserID||'')) return '';
  if(latestMineRowID>0 && Number(rowID||0)!==latestMineRowID) return '';
  if(pendingOutgoing.has(messageID)) return 'sending...';
  if(!rowID) return 'sent';
  let seenByOther = false;
  for(const [uid,lastRow] of readReceipts.entries()){
    if(uid===myUserID) continue;
    if(Number(lastRow||0) >= rowID){ seenByOther=true; break; }
  }
  return seenByOther ? 'seen' : 'sent';
}
function renderReplySnippet(replyToID){
  const source = knownMessages.get(replyToID);
  if(!source) return `<span class="reply-snippet">Replying to earlier message</span>`;
  const shortText = String(source.preview || '').slice(0,80);
  return `<span class="reply-snippet">Reply to ${esc(source.display_name || 'message')}: ${esc(shortText || '[attachment]')}</span>`;
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
function updateTypingBanner(){
  const el=$('typingStatus');
  if(!el) return;
  const names=[...typingUsers.values()].filter((name)=>name && name!==currentDisplayName);
  if(names.length===0){ el.textContent=''; return; }
  el.textContent = names.length===1 ? `${names[0]} is typing...` : `${names.slice(0,2).join(', ')} are typing...`;
}
function updatePresenceCount(){
  const countEl=$('memberCount');
  const toggleEl=$('memberToggle');
  if(countEl) countEl.textContent = String(onlineUsers.size);
  if(toggleEl) toggleEl.setAttribute('aria-label', `Open online members list (${onlineUsers.size} online)`);
}
function setNotifySoundEnabled(next){
  notifySoundEnabled = !!next;
  try {
    localStorage.setItem(NOTIFY_SOUND_KEY, notifySoundEnabled ? '1' : '0');
  } catch {}
}
function setNotifyVolume(next){
  const n = Number(next);
  if(!Number.isFinite(n)) return;
  notifyVolume = Math.max(0, Math.min(2, n));
  try {
    localStorage.setItem(NOTIFY_VOLUME_KEY, String(notifyVolume));
  } catch {}
}
function setShowAvatars(next){
  showAvatars = !!next;
  try {
    localStorage.setItem(SHOW_AVATARS_KEY, showAvatars ? '1' : '0');
  } catch {}
}
function setShowAvatarRings(next){
  showAvatarRings = !!next;
  try {
    localStorage.setItem(SHOW_AVATAR_RINGS_KEY, showAvatarRings ? '1' : '0');
  } catch {}
}
function applyTimestampMode(){
  document.documentElement.classList.toggle('timestamps-hover', timestampMode === 'hover');
}
function setTimestampMode(next){
  timestampMode = next === 'hover' ? 'hover' : 'always';
  try {
    localStorage.setItem(TIMESTAMP_MODE_KEY, timestampMode);
  } catch {}
  applyTimestampMode();
}
function unlockAudio(){
  audioUnlocked = true;
}
function playNotificationSound(){
  if(!notifySoundEnabled || !audioUnlocked) return;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if(!Ctor) return;
  const ctx = new Ctor();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.value = 0.0001;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  const peak = Math.max(0.0001, 0.2 * notifyVolume);
  gain.gain.exponentialRampToValueAtTime(peak, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
  osc.start(now);
  osc.stop(now + 0.17);
  setTimeout(()=>ctx.close(), 250);
}
function refreshAllMessageMeta(){
  const latestMineRowID = latestOwnMessageRowID();
  document.querySelectorAll('.line[data-msg-id]').forEach((row)=>{
    const msgID=row.getAttribute('data-msg-id') || '';
    const rowID=Number(row.getAttribute('data-row-id')||0);
    const senderID=row.getAttribute('data-sender-id') || '';
    if(senderID!==myUserID) return;
    const meta=row.querySelector('.line-meta');
    if(!meta) return;
    const edited = String(knownMessages.get(msgID)?.edited_at || '').trim() !== '';
    const status = messageDeliveryLabel(rowID, msgID, senderID, latestMineRowID);
    meta.textContent = `${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}`;
  });
}
async function sendReadReceiptForVisible(){
  const messages=$('messages');
  if(!messages) return;
  const rows=[...messages.querySelectorAll('.line[data-row-id]')];
  if(rows.length===0) return;
  const last=rows[rows.length-1];
  const rowID=Number(last.getAttribute('data-row-id')||0);
  if(!rowID) return;
  await api('/api/messages/read',{method:'POST',body:JSON.stringify({last_seen_rowid:rowID})});
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
