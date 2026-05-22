const app = document.getElementById('app');
const APP_VERSION = 'mvp-01';
let appVersion = APP_VERSION;
let roomKeyHex = localStorage.getItem('veil.roomKeyHex') || '';
let currentCredentialId = localStorage.getItem('veil.credentialId') || '';
let currentDeviceSecret = localStorage.getItem('veil.deviceSecret') || '';
let currentDisplayName = localStorage.getItem('veil.displayName') || '';
let currentStatusText = '';
let ws;
let wsReady = null;
let wsReconnectTimer = null;
let wsReconnectAttempts = 0;
let activeEmojiPicker = null;
let activeEmojiToggle = null;
let activeStickerPicker = null;
let activeStickerToggle = null;
let emojiOutsideHandlerBound = false;
let activeMemberPopover = null;
let activeMemberToggle = null;
let activePinPopover = null;
let activePinToggle = null;
let activePublicProfileCard = null;
let activeMentionPicker = null;
let activeMentionInput = null;
let activeMentionClose = null;
let memberOutsideHandlerBound = false;
let pinOutsideHandlerBound = false;
let mentionOutsideHandlerBound = false;
let pendingAttachment = null;
let roomName = '';
let activeRoomID = localStorage.getItem('veil.activeRoomID') || 'main';
let availableRooms = [];
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
let currentProfileAbout = '';
let currentProfileAccent = '';
let currentProfileBannerURL = '';
let currentProfileCardBgURL = '';
let currentProfileBannerOpacity = 100;
let currentProfileCardBgOpacity = 100;
const knownDisplayNames = new Set();

const PASTELS = ['#8bd8bd', '#ffd166', '#f4978e', '#90dbf4', '#c1d37f', '#ffb86b', '#b8f2e6', '#f7aef8'];
const PASSPHRASE_WORDS = ['amber', 'atlas', 'birch', 'bloom', 'cinder', 'cobalt', 'comet', 'copper', 'coral', 'dawn', 'drift', 'ember', 'fern', 'flint', 'frost', 'glow', 'grove', 'harbor', 'hazel', 'ivory', 'jade', 'lilac', 'lumen', 'maple', 'meadow', 'mist', 'moss', 'night', 'nova', 'oak', 'onyx', 'opal', 'pearl', 'pine', 'plum', 'quartz', 'rain', 'raven', 'reef', 'ridge', 'river', 'rose', 'sage', 'shade', 'shore', 'sky', 'slate', 'snow', 'stone', 'storm', 'sun', 'thistle', 'timber', 'topaz', 'vale', 'velvet', 'violet', 'wave', 'willow', 'wind'];
const EMOJI_CHOICES = ['😀', '😃', '😄', '😁', '😆', '😂', '🤣', '🙂', '😊', '😇', '😉', '😍', '🥰', '😘', '😎', '🤩', '🥳', '🤗', '😭', '😢', '😅', '😐', '🙃', '🤔', '🫡', '🙌', '👏', '👍', '👎', '🙏', '💪', '✌️', '🤝', '🔥', '✨', '💯', '❤️', '🧡', '💛', '💚', '💙', '💜', '🤍', '🖤', '👀', '✅', '❌', '⚠️', '🔒', '🎉', '🚀', '⭐', '🎯', '😴', '🤯', '😤', '😬', '🥲', '🤖', '👋', '💬', '📌', '📎', '🛡️', '🌈'];
const ICON_REACT = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="9" cy="10" r="1.1" fill="currentColor"/><circle cx="15" cy="10" r="1.1" fill="currentColor"/><path d="M8.7 14.3c.9 1.3 2 2 3.3 2s2.4-.7 3.3-2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
const ICON_REPLY = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 7 4.5 12 10 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 12h8.2c3.4 0 6.3 1.7 6.3 5.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
const ICON_EDIT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.8V20h3.2L17 10.2l-3.2-3.2L4 16.8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="m12.9 7.8 3.2 3.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l-2.1 4.6v3.2l2.8 2.7H7.3l2.8-2.7V8.6L8 4Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M12 14.5V20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
const ICON_DELETE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.8 7.2h12.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M9.2 7.2V5.8h5.6v1.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.2 7.2 9 18.3h6l.8-11.1" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const ATTACHMENT_MAX_BYTES = 8 * 1024 * 1024;
const EMOTICON_MAP = {
    ':)': '😊', ':-)': '😊',
    ':D': '😄', ':-D': '😄',
    ':(': '🙁', ':-(': '🙁',
    ';)': '😉', ';-)': '😉',
    ':P': '😛', ':-P': '😛', ':p': '😛', ':-p': '😛',
    ':O': '😮', ':-O': '😮', ':o': '😮', ':-o': '😮',
    ':|': '😐', ':-|': '😐',
    '<3': '❤️',
    ':fire:': '🔥', ':lock:': '🔒', ':thumbsup:': '👍', ':100:': '💯'
};
const SIDEBAR_OPEN_KEY = 'veil.sidebarOpen';
const MOBILE_SIDEBAR_QUERY = '(max-width: 980px)';
const PBKDF2_ITERS = 600000;
const THEME_STORAGE_KEY = 'veil.theme';
const VEIL_THEME = {
    bg: '#0b0f17',
    bg2: '#121827',
    panel: '#141b2b',
    surface: '#0f1523',
    ink: '#e9edf8',
    muted: '#98a6c3',
    accent: '#6fb4ff',
    accent2: '#72e5c2',
    danger: '#ff8c9c',
    mentionSelf: '#4bffa8'
};
const DEFAULT_THEME = {
    bg: '#130f12',
    bg2: '#20141c',
    panel: '#2b1b27',
    surface: '#1f141c',
    ink: '#f9edf5',
    muted: '#c3a6b9',
    accent: '#ff9d66',
    accent2: '#ff78b2',
    danger: '#ff7f9b',
    mentionSelf: '#4bffa8'
};
const THEME_PRESETS = {
    veil: VEIL_THEME,
    ember: DEFAULT_THEME,
    midnight: {
        bg: '#08101c',
        bg2: '#111d33',
        panel: '#162640',
        surface: '#0e1a2f',
        ink: '#e8f1ff',
        muted: '#98aecf',
        accent: '#67b6ff',
        accent2: '#60e3d0',
        danger: '#ff8ea8',
        mentionSelf: '#4bffa8'
    },
    graphite: {
        bg: '#101214',
        bg2: '#191d23',
        panel: '#21262f',
        surface: '#171b22',
        ink: '#eef0f4',
        muted: '#a2acbc',
        accent: '#8ab4ff',
        accent2: '#88e0c4',
        danger: '#ff9aa4',
        mentionSelf: '#4bffa8'
    }
};

const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
const hashName = (n) => {
    let h = 0;
    for (let i = 0; i < n.length; i++) h = ((h << 5) - h) + n.charCodeAt(i);
    return Math.abs(h);
};
let customUserColors = {};
let sidebarOpen = (() => {
    try {
        const raw = localStorage.getItem(SIDEBAR_OPEN_KEY);
        if (raw === null) return true;
        return raw === '1';
    } catch {
        return true;
    }
})();
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
let readReceiptTimer = null;
let activeNotificationAudio = null;
let messageReactions = new Map();
let myReactions = new Map();
let reactionAuthors = new Map();
let pinnedMessageIDs = new Set();
let customEmojiMap = new Map();
let customStickerMap = new Map();
let unreadDividerRowID = 0;
let jumpToUnreadAfterSwitch = false;
const NOTIFY_SOUND_KEY = 'veil.notifySound';
const NOTIFY_VOLUME_KEY = 'veil.notifyVolume';
const NOTIFY_CUSTOM_NAME_KEY = 'veil.notifyCustomName';
const NOTIFY_CUSTOM_DATA_KEY = 'veil.notifyCustomDataURL';
const SHOW_AVATARS_KEY = 'veil.showAvatars';
const SHOW_AVATAR_RINGS_KEY = 'veil.showAvatarRings';
const TIMESTAMP_MODE_KEY = 'veil.timestampMode';
const LOCAL_BACKGROUND_KEY = 'veil.localBackgroundImage';
const LOCAL_BACKGROUND_STRENGTH_KEY = 'veil.localBackgroundStrength';
const DEFAULT_ROOM_STATUS_TEXT = 'encrypted room';
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
        if (Number.isFinite(raw)) return Math.max(0, Math.min(2, raw));
    } catch {
    }
    return 0.25;
})();
let customNotificationName = (() => {
    try {
        return String(localStorage.getItem(NOTIFY_CUSTOM_NAME_KEY) || '').trim();
    } catch {
        return '';
    }
})();
let customNotificationDataURL = (() => {
    try {
        return String(localStorage.getItem(NOTIFY_CUSTOM_DATA_KEY) || '').trim();
    } catch {
        return '';
    }
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
let roomStatusText = DEFAULT_ROOM_STATUS_TEXT;
let audioUnlocked = false;
const userColor = (n) => customUserColors[n] || PASTELS[hashName(n) % PASTELS.length];
const isAdminRole = (role) => role === 'root_admin' || role === 'admin';

function normalizeHexColor(value) {
    const v = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : '';
}

function normalizeHexColorAlpha(value) {
    const v = String(value || '').trim();
    return /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase() : '';
}

function hexColorBase(value, fallback = '#000000') {
    const color = normalizeHexColorAlpha(value);
    return color ? color.slice(0, 7) : fallback;
}

function hexColorAlpha(value) {
    const color = normalizeHexColorAlpha(value);
    if (!color || color.length !== 9) return 100;
    return Math.round((parseInt(color.slice(7, 9), 16) / 255) * 100);
}

function hexWithAlpha(value, alphaPercent = 100) {
    const base = normalizeHexColor(value) || hexColorBase(value, '');
    if (!base) return '';
    const alpha = Math.max(0, Math.min(100, Math.round(Number(alphaPercent))));
    const hex = Math.round((alpha / 100) * 255).toString(16).padStart(2, '0');
    return alpha >= 100 ? base : `${base}${hex}`;
}

function normalizeAvatarRingMode(value) {
    const v = String(value || '').trim().toLowerCase();
    return ['none', 'pulse', 'glow', 'rainbow'].includes(v) ? v : 'none';
}

function avatarRingStyle(record = {}, fallbackColor = '') {
    if (!showAvatarRings) {
        return {color: '', color2: '', mode: 'none', className: 'avatar-ring', style: ''};
    }
    const ringColor = normalizeHexColorAlpha(record.avatar_ring_color || '') || normalizeHexColor(fallbackColor || '');
    const ringColor2 = normalizeHexColorAlpha(record.avatar_ring_color2 || '') || ringColor;
    const ringColor3 = normalizeHexColorAlpha(record.avatar_ring_color3 || '') || '#57db84';
    const ringColor4 = normalizeHexColorAlpha(record.avatar_ring_color4 || '') || '#9d7bff';
    const ringMode = ringColor ? normalizeAvatarRingMode(record.avatar_ring_mode || '') : 'none';
    return {
        color: ringColor,
        color2: ringColor2,
        mode: ringMode,
        className: `avatar-ring${ringColor ? ' has-ring' : ''}${ringMode !== 'none' ? ` ring-${ringMode}` : ''}`,
        style: ringColor ? ` style="--avatar-ring:${esc(ringColor)};--avatar-ring-2:${esc(ringColor2)};--avatar-ring-3:${esc(ringColor3)};--avatar-ring-4:${esc(ringColor4)}"` : ''
    };
}

function setUserColor(name, color) {
    const safeName = String(name || '').trim();
    const safeColor = normalizeHexColor(color);
    if (!safeName || !safeColor) return;
    customUserColors[safeName] = safeColor;
}

function refreshRenderedUserColor(name) {
    const safeName = String(name || '').trim();
    if (!safeName) return;
    const c = userColor(safeName);
    const escaped = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(safeName) : safeName.replace(/["\\]/g, '\\$&');
    document.querySelectorAll(`.line-user[data-user-name="${escaped}"]`).forEach((el) => {
        el.style.color = c;
    });
}

function fmtTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return ts;
    return d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
}

async function api(path, opts = {}) {
    const headers = {'accept': 'application/json', ...(opts.headers || {})};
    if (opts.body && !headers['content-type']) headers['content-type'] = 'application/json';
    const r = await fetch(path, {...opts, headers});
    let data = {};
    try {
        data = await r.json();
    } catch {
    }
    return {ok: r.ok, data};
}

function withRoomQuery(path) {
    const roomID = String(activeRoomID || 'main').trim() || 'main';
    const u = new URL(path, location.origin);
    if (!u.searchParams.get('room_id')) u.searchParams.set('room_id', roomID);
    return u.pathname + u.search;
}

const $ = (id) => document.getElementById(id);

function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/["\\]/g, '\\$&');
}

function getMessageByID(messageID) {
    const id = String(messageID || '').trim();
    if (!id) return null;
    return knownMessages.get(id) || null;
}

function setReplyTarget(messageID) {
    replyToMessageID = String(messageID || '').trim();
}

function clearReplyTarget() {
    replyToMessageID = '';
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function convertEmoticons(text) {
    let out = String(text);
    for (const [code, emoji] of Object.entries(EMOTICON_MAP)) {
        const pattern = new RegExp(`(^|\\s)${escapeRegex(code)}(?=$|\\s)`, 'g');
        out = out.replace(pattern, `$1${emoji}`);
    }
    return out;
}

function clampByte(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex) {
    const match = String(hex).trim().match(/^#([0-9a-f]{6})$/i);
    if (!match) return null;
    const value = parseInt(match[1], 16);
    return {r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255};
}

function rgbToHex(rgb) {
    return '#' + [rgb.r, rgb.g, rgb.b].map((v) => clampByte(v).toString(16).padStart(2, '0')).join('');
}

function mixHex(a, b, amount) {
    const ar = hexToRgb(a), br = hexToRgb(b);
    if (!ar || !br) return a;
    return rgbToHex({
        r: ar.r + (br.r - ar.r) * amount,
        g: ar.g + (br.g - ar.g) * amount,
        b: ar.b + (br.b - ar.b) * amount
    });
}

function rgbaHex(hex, alpha) {
    const rgb = hexToRgb(hex) || {r: 0, g: 0, b: 0};
    return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
}

function normalizeTheme(theme) {
    const out = {...DEFAULT_THEME};
    for (const key of Object.keys(DEFAULT_THEME)) {
        if (theme && /^#[0-9a-f]{6}$/i.test(String(theme[key] || ''))) out[key] = theme[key];
    }
    return out;
}

function applyTheme(theme) {
    const t = normalizeTheme(theme);
    const root = document.documentElement.style;
    root.setProperty('--bg', t.bg);
    root.setProperty('--bg-2', t.bg2);
    root.setProperty('--panel', t.panel);
    root.setProperty('--panel-2', mixHex(t.panel, t.ink, .08));
    root.setProperty('--surface', t.surface);
    root.setProperty('--surface-2', mixHex(t.surface, t.ink, .08));
    root.setProperty('--ink', t.ink);
    root.setProperty('--muted', t.muted);
    root.setProperty('--quiet', mixHex(t.muted, t.bg, .28));
    root.setProperty('--line', mixHex(t.surface, t.ink, .18));
    root.setProperty('--line-2', mixHex(t.surface, t.ink, .32));
    root.setProperty('--accent', t.accent);
    root.setProperty('--accent-2', t.accent2);
    root.setProperty('--accent-soft', rgbaHex(t.accent, .14));
    root.setProperty('--focus-ring', rgbaHex(t.accent, .24));
    root.setProperty('--accent-grid', rgbaHex(t.accent, .12));
    root.setProperty('--active-ink', mixHex(t.ink, t.accent, .18));
    root.setProperty('--danger', t.danger);
    root.setProperty('--mention-self', t.mentionSelf);
    root.setProperty('--ok', t.accent);
    root.setProperty('--app-shell', rgbaHex(t.bg, .94));
    root.setProperty('--sidebar-a', rgbaHex(mixHex(t.panel, t.ink, .04), .98));
    root.setProperty('--sidebar-b', rgbaHex(mixHex(t.bg, t.surface, .35), .98));
    root.setProperty('--topbar-bg', rgbaHex(t.surface, .78));
    root.setProperty('--composer-bg', rgbaHex(t.surface, .86));
    root.setProperty('--panel-grad-a', rgbaHex(mixHex(t.panel, t.ink, .04), .92));
    root.setProperty('--panel-grad-b', rgbaHex(mixHex(t.panel, t.bg, .35), .94));
    root.setProperty('--chat-grad-a', rgbaHex(t.panel, .92));
    root.setProperty('--chat-grad-b', rgbaHex(t.surface, .98));
    root.setProperty('--button-a', mixHex(t.accent, t.bg, .46));
    root.setProperty('--button-b', mixHex(t.accent, t.bg, .6));
    root.setProperty('--button-hover-a', mixHex(t.accent, t.ink, .12));
    root.setProperty('--button-hover-b', mixHex(t.accent, t.bg, .48));
    root.setProperty('--placeholder', mixHex(t.muted, t.bg, .18));
}

function currentTheme() {
    try {
        return normalizeTheme(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY) || 'null'));
    } catch {
        return {...DEFAULT_THEME};
    }
}

function saveTheme(theme) {
    const t = normalizeTheme(theme);
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(t));
    applyTheme(t);
    return t;
}

function resetTheme() {
    localStorage.removeItem(THEME_STORAGE_KEY);
    applyTheme(DEFAULT_THEME);
}

function localBackgroundImage() {
    try {
        const raw = String(localStorage.getItem(LOCAL_BACKGROUND_KEY) || '').trim();
        return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(raw) ? raw : '';
    } catch {
        return '';
    }
}

function normalizeLocalBackgroundStrength(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 45;
}

function localBackgroundStrength() {
    try {
        const raw = localStorage.getItem(LOCAL_BACKGROUND_STRENGTH_KEY);
        return raw === null ? 45 : normalizeLocalBackgroundStrength(raw);
    } catch {
        return 45;
    }
}

function applyLocalBackgroundStrength(strength = localBackgroundStrength()) {
    const value = normalizeLocalBackgroundStrength(strength);
    const show = value / 100;
    const dim = (lightest, darkest) => (darkest - ((darkest - lightest) * show)).toFixed(2);
    const root = document.documentElement.style;
    root.setProperty('--local-bg-app-a', dim(.34, .86));
    root.setProperty('--local-bg-app-b', dim(.5, .9));
    root.setProperty('--local-bg-main-a', dim(.22, .8));
    root.setProperty('--local-bg-main-b', dim(.36, .86));
    root.setProperty('--local-bg-chat-a', dim(.2, .78));
    root.setProperty('--local-bg-chat-b', dim(.34, .84));
    root.setProperty('--local-bg-bar', dim(.32, .84));
}

function applyLocalBackground(imageURL = localBackgroundImage()) {
    const root = document.documentElement;
    applyLocalBackgroundStrength();
    if (imageURL) {
        root.style.setProperty('--local-bg-image', `url("${imageURL}")`);
        root.classList.add('has-local-bg');
    } else {
        root.style.setProperty('--local-bg-image', 'none');
        root.classList.remove('has-local-bg');
    }
}

function saveLocalBackground(imageURL) {
    const value = String(imageURL || '').trim();
    if (value) {
        localStorage.setItem(LOCAL_BACKGROUND_KEY, value);
    } else {
        localStorage.removeItem(LOCAL_BACKGROUND_KEY);
    }
    applyLocalBackground(value);
}

function saveLocalBackgroundStrength(strength) {
    const value = normalizeLocalBackgroundStrength(strength);
    localStorage.setItem(LOCAL_BACKGROUND_STRENGTH_KEY, String(value));
    applyLocalBackgroundStrength(value);
    return value;
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeMime(mime) {
    return String(mime || '').toLowerCase().split(';')[0].trim();
}

function registerDisplayName(name) {
    const clean = String(name || '').trim();
    if (clean) knownDisplayNames.add(clean);
}

function getMentionCandidates(query = '') {
    const q = String(query || '').trim().toLowerCase();
    const list = [...knownDisplayNames].sort((a, b) => a.localeCompare(b));
    if (!q) return list.slice(0, 8);
    return list.filter((name) => name.toLowerCase().includes(q)).slice(0, 8);
}

function findMentionMatch(rawName) {
    const target = String(rawName || '').toLowerCase();
    if (!target) return '';
    for (const name of knownDisplayNames) {
        if (name.toLowerCase() === target) return name;
    }
    return '';
}

function linkifyText(text) {
    const input = String(text ?? '');
    const urlRe = /https?:\/\/[^\s<>"']+|www\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+[^\s<>"']*/gi;
    const trailingPunct = /[),.;:!?]+$/;
    let out = '';
    let last = 0;
    for (const m of input.matchAll(urlRe)) {
        const idx = m.index ?? 0;
        let raw = m[0];
        let suffix = '';
        const trim = raw.match(trailingPunct);
        if (trim) {
            suffix = trim[0];
            raw = raw.slice(0, raw.length - suffix.length);
        }
        if (!raw) continue;
        const isHTTP = /^https?:\/\//i.test(raw);
        const href = isHTTP ? raw : `https://${raw}`;
        const label = raw;
        out += esc(input.slice(last, idx));
        out += `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>${esc(suffix)}`;
        last = idx + m[0].length;
    }
    out += esc(input.slice(last));
    return out;
}

function renderMentions(text) {
    return String(text ?? '').replace(/(^|[\s(])@([a-z0-9._-]{1,48})\b/gi, (all, prefix, raw) => {
        const match = findMentionMatch(raw);
        if (!match) return `${prefix}@${raw}`;
        const selfMention = !!currentDisplayName && match.toLowerCase() === String(currentDisplayName).toLowerCase();
        const mentionClass = selfMention ? 'mention mention-self' : 'mention';
        return `${prefix}<span class="${mentionClass}">@${esc(match)}</span>`;
    });
}

function renderRichText(text) {
    return renderCustomEmojiTokens(renderMentions(linkifyText(text)));
}

function renderCustomEmojiTokens(text) {
    if ((!customEmojiMap || customEmojiMap.size === 0) && (!customStickerMap || customStickerMap.size === 0)) return String(text ?? '');
    return String(text ?? '').replace(/:([a-z0-9_-]{1,32}):/gi, (full, rawName) => {
        const name = String(rawName || '').toLowerCase();
        const emojiItem = customEmojiMap.get(name);
        if (emojiItem && emojiItem.url) {
            return `<img class="inline-custom-emoji" src="${esc(emojiItem.url)}" alt=":${esc(name)}:" title=":${esc(name)}:" loading="lazy"/>`;
        }
        const stickerItem = customStickerMap.get(name);
        if (stickerItem && stickerItem.url) {
            return `<img class="inline-custom-sticker" src="${esc(stickerItem.url)}" alt=":${esc(name)}:" title=":${esc(name)}:" loading="lazy"/>`;
        }
        return full;
    });
}

function renderEmojiVisual(value) {
    const raw = String(value || '');
    const match = raw.match(/^:([a-z0-9_-]{1,32}):$/i);
    if (match) {
        const name = String(match[1] || '').toLowerCase();
        const item = customEmojiMap.get(name);
        if (item && item.url) {
            return `<img class="reaction-emoji-img" src="${esc(item.url)}" alt=":${esc(name)}:" title=":${esc(name)}:" loading="lazy"/>`;
        }
    }
    return esc(raw);
}

function renderEmojiChoicesHTML() {
    const baseChoices = EMOJI_CHOICES.map((emoji) => `<button class="emoji-choice" type="button" data-emoji="${esc(emoji)}" title="${esc(emoji)}" aria-label="Insert ${esc(emoji)}" role="option">${esc(emoji)}</button>`);
    const customChoices = [...customEmojiMap.values()].map((item) => {
        const token = `:${item.name}:`;
        return `<button class="emoji-choice emoji-choice-custom" type="button" data-emoji="${esc(token)}" title="${esc(token)}" aria-label="Insert ${esc(token)}" role="option"><img src="${esc(item.url)}" alt="${esc(token)}" loading="lazy"/></button>`;
    });
    return [...baseChoices, ...customChoices].join('');
}

function renderStickerChoicesHTML() {
    const stickerChoices = [...customStickerMap.values()].map((item) => {
        const token = `:${item.name}:`;
        return `<button class="emoji-choice emoji-choice-custom" type="button" data-sticker="${esc(token)}" title="Insert sticker ${esc(token)}" aria-label="Insert sticker ${esc(token)}" role="option"><img src="${esc(item.url)}" alt="${esc(token)}" loading="lazy"/></button>`;
    });
    return stickerChoices.join('');
}

function renderReactionChoicesHTML() {
    const baseChoices = EMOJI_CHOICES.map((emoji) => `<button class="reaction-choice" type="button" data-reaction-emoji="${esc(emoji)}" aria-label="React with ${esc(emoji)}">${esc(emoji)}</button>`);
    const customChoices = [...customEmojiMap.values()].map((item) => {
        const token = `:${item.name}:`;
        return `<button class="reaction-choice reaction-choice-custom" type="button" data-reaction-emoji="${esc(token)}" aria-label="React with ${esc(token)}"><img src="${esc(item.url)}" alt="${esc(token)}" loading="lazy"/></button>`;
    });
    return [...baseChoices, ...customChoices].join('');
}

function bytesToHex(bytes) {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

function hexToBytes(hex) {
    if (typeof hex !== 'string' || hex.length % 2 !== 0) throw new Error('invalid hex');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) out[i / 2] = parseInt(hex.slice(i, i + 2), 16);
    return out;
}

function randomBytes(n) {
    const a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return a;
}

function randomRoomKeyHex() {
    return bytesToHex(randomBytes(32));
}

function generatePassphrase() {
    const picks = new Uint32Array(5);
    crypto.getRandomValues(picks);
    return [...picks].map((n) => PASSPHRASE_WORDS[n % PASSPHRASE_WORDS.length]).join(' ');
}

async function importRoomKey(roomKeyHex) {
    const raw = hexToBytes(roomKeyHex);
    if (raw.length !== 32) throw new Error('Invalid room key length');
    return crypto.subtle.importKey('raw', raw, {name: 'AES-GCM'}, false, ['encrypt', 'decrypt']);
}

async function encryptText(roomKeyHex, text) {
    const key = await importRoomKey(roomKeyHex);
    const nonce = randomBytes(12);
    const plain = new TextEncoder().encode(text);
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, key, plain);
    return {ciphertext: bytesToHex(new Uint8Array(ct)), nonce: bytesToHex(nonce)};
}

async function decryptText(roomKeyHex, nonceHex, ctHex) {
    const key = await importRoomKey(roomKeyHex);
    const nonce = hexToBytes(nonceHex);
    const ct = hexToBytes(ctHex);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce}, key, ct);
    return new TextDecoder().decode(plain);
}

async function deriveWrapKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations, hash: 'SHA-256'}, base, {
        name: 'AES-GCM',
        length: 256
    }, true, ['encrypt', 'decrypt']);
}

async function wrapRoomKeyWithPassphrase(roomKeyHex, passphrase) {
    const salt = randomBytes(16);
    const nonce = randomBytes(12);
    const wrapKey = await deriveWrapKey(passphrase, salt, PBKDF2_ITERS);
    const roomRaw = hexToBytes(roomKeyHex);
    const wrapped = await crypto.subtle.encrypt({name: 'AES-GCM', iv: nonce}, wrapKey, roomRaw);
    return {
        kdf: {name: 'PBKDF2-HMAC-SHA256', iterations: PBKDF2_ITERS, salt_hex: bytesToHex(salt)},
        wrap: {alg: 'AES-256-GCM', nonce_hex: bytesToHex(nonce), ciphertext_hex: bytesToHex(new Uint8Array(wrapped))}
    };
}

function encodeTransferPayload(payload) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
}

function decodeTransferPayload(code) {
    const bin = atob(String(code || '').trim());
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
}

async function createDeviceSyncCode(passphrase) {
    if (!roomKeyHex) throw new Error('No room key available');
    if (!currentCredentialId) throw new Error('No credential id available');
    const wrapped = await wrapRoomKeyWithPassphrase(roomKeyHex, passphrase);
    return encodeTransferPayload({
        format: 'veil.device.v1',
        created_at: new Date().toISOString(),
        server_base: location.origin,
        credential_id: currentCredentialId,
        device_secret: currentDeviceSecret,
        display_name: currentDisplayName || '',
        ...wrapped
    });
}

async function importDeviceSyncCode(code, passphrase) {
    const payload = decodeTransferPayload(code);
    if (!payload || payload.format !== 'veil.device.v1' || !payload.credential_id || !payload.wrap || !payload.kdf) {
        throw new Error('Invalid device sync code');
    }
    const rk = await unwrapRoomKeyWithPassphrase(payload, passphrase);
    roomKeyHex = rk;
    currentCredentialId = payload.credential_id || '';
    currentDeviceSecret = payload.device_secret || currentDeviceSecret || '';
    currentDisplayName = payload.display_name || '';
    persistIdentity();
    const r = await api('/api/session/from-credential', {
        method: 'POST',
        body: JSON.stringify({credential_id: currentCredentialId, device_secret: currentDeviceSecret})
    });
    if (!r.ok) throw new Error(r.data.error || 'Session restore failed');
}

async function unwrapRoomKeyWithPassphrase(cfg, passphrase) {
    const salt = hexToBytes(cfg.kdf.salt_hex);
    const nonce = hexToBytes(cfg.wrap.nonce_hex);
    const ciphertext = hexToBytes(cfg.wrap.ciphertext_hex);
    const wrapKey = await deriveWrapKey(passphrase, salt, cfg.kdf.iterations || PBKDF2_ITERS);
    const roomRaw = await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce}, wrapKey, ciphertext);
    const roomBytes = new Uint8Array(roomRaw);
    if (roomBytes.length !== 32) throw new Error('Invalid room key in file');
    return bytesToHex(roomBytes);
}

function messageHeaderHTML(name, ts = '', color = '') {
    const c = color || userColor(name);
    return `<span class="line-header"><span class="line-user" data-user-name="${esc(name)}" style="color:${esc(c)}">${esc(name)}</span><span class="line-time">${esc(fmtTime(ts))}</span></span>`;
}

function roleBadgeHTML(role) {
    const normalized = String(role || '').trim().toLowerCase();
    if (normalized === 'root_admin') return '<span class="role-badge role-badge-root">Root Admin</span>';
    if (normalized === 'admin') return '<span class="role-badge role-badge-admin">Admin</span>';
    if (normalized === 'moderator') return '<span class="role-badge role-badge-mod">Moderator</span>';
    return '';
}

function drawLine(name, text, ts = '', color = '') {
    return `${messageHeaderHTML(name, ts, color)}<span class="line-text">${renderRichText(text)}</span>`;
}

function avatarMarkup(name, avatarURL = '', record = {}) {
    const clean = String(name || '').trim();
    const initial = clean ? clean.slice(0, 1).toUpperCase() : '?';
    const src = String(avatarURL || '').trim();
    const ring = avatarRingStyle(record, record.chat_color || userColor(clean || '?'));
    if (isAvatarImageURL(src)) {
        return `<span class="${ring.className}"${ring.style}><img class="line-avatar-img" src="${esc(src)}" alt="${esc(clean || 'avatar')}" loading="lazy" /></span>`;
    }
    const bg = userColor(clean || '?');
    return `<span class="${ring.className}"${ring.style}><span class="line-avatar" aria-hidden="true" style="background:${esc(bg)}">${esc(initial)}</span></span>`;
}

function profileCardHTML(member = {}) {
    const name = String(member.display_name || 'member');
    const role = String(member.room_role || member.role || 'member');
    const accent = normalizeHexColor(member.profile_accent || '') || normalizeHexColor(member.chat_color || '') || userColor(name);
    const status = String(member.status_text || '').trim();
    const about = String(member.profile_about || '').trim();
    const bannerURL = String(member.profile_banner_url || '').trim();
    const cardBgURL = String(member.profile_card_bg_url || '').trim();
    const bannerOpacity = Math.max(0, Math.min(100, Number(member.profile_banner_opacity ?? 100)));
    const cardBgOpacity = Math.max(0, Math.min(100, Number(member.profile_card_bg_opacity ?? 100)));
    const avatar = avatarMarkup(name, member.avatar_url || '', member);
    const roleBadges = `${roleBadgeHTML(member.role)}${roleBadgeHTML(member.room_role)}`;
    const bannerImage = isAvatarImageURL(bannerURL) ? `url('${esc(bannerURL)}')` : 'none';
    const cardBgImage = isAvatarImageURL(cardBgURL) ? `url('${esc(cardBgURL)}')` : 'none';
    return `
      <div class="public-profile-card" style="--profile-card-accent:${esc(accent)};--profile-banner-image:${bannerImage};--profile-card-bg-image:${cardBgImage};--profile-banner-opacity:${esc(String(bannerOpacity / 100))};--profile-card-bg-opacity:${esc(String(cardBgOpacity / 100))}">
        <div class="public-profile-banner"></div>
        <div class="public-profile-body">
          <div class="public-profile-avatar">${avatar}</div>
          <div class="public-profile-name"><strong>${esc(name)}</strong>${roleBadges}</div>
          <div class="public-profile-role">${esc(role || 'member')}</div>
          ${status ? `<div class="public-profile-status">${esc(status)}</div>` : ''}
          <div class="public-profile-about">${about ? renderRichText(about) : '<span class="muted">No profile note yet.</span>'}</div>
        </div>
      </div>`;
}

function openPublicProfileCard(member, anchorEl) {
    closePublicProfileCard();
    if (!member || !anchorEl) return;
    const pop = document.createElement('div');
    pop.className = 'public-profile-popover open';
    pop.innerHTML = profileCardHTML(member);
    document.body.appendChild(pop);
    const rect = anchorEl.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    const gap = 10;
    let left = rect.left;
    let top = rect.bottom + gap;
    if (left + popRect.width > window.innerWidth - 10) left = window.innerWidth - popRect.width - 10;
    if (top + popRect.height > window.innerHeight - 10) top = Math.max(10, rect.top - popRect.height - gap);
    pop.style.left = `${Math.max(10, left)}px`;
    pop.style.top = `${Math.max(10, top)}px`;
    activePublicProfileCard = pop;
}

function closePublicProfileCard() {
    if (activePublicProfileCard) activePublicProfileCard.remove();
    activePublicProfileCard = null;
}

function isAvatarImageURL(value) {
    const src = String(value || '').trim();
    return /^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(src) || /^\/(static\/avatars|avatars)\/[a-z0-9._-]+(\?[^\s]*)?$/i.test(src);
}

function parseMessagePayload(text) {
    try {
        const payload = JSON.parse(text);
        if (!payload || payload.v !== 1) return {type: 'text', text};
        const mime = normalizeMime(payload.mime);
        if (payload.type === 'image' && IMAGE_TYPES.has(mime) && typeof payload.data === 'string') {
            return {
                type: 'image',
                mime,
                data: payload.data,
                name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : 'image',
                size: Number.isFinite(payload.size) ? payload.size : 0,
                caption: typeof payload.caption === 'string' ? payload.caption : ''
            };
        }
        if (payload.type === 'file' && typeof payload.data === 'string') {
            return {
                type: 'file',
                mime: mime || 'application/octet-stream',
                data: payload.data,
                name: typeof payload.name === 'string' ? payload.name.slice(0, 120) : 'attachment.bin',
                size: Number.isFinite(payload.size) ? payload.size : 0,
                caption: typeof payload.caption === 'string' ? payload.caption : ''
            };
        }
        if (payload.type === 'text' && typeof payload.text === 'string') {
            return {
                type: 'text',
                text: payload.text,
                replyToID: typeof payload.reply_to_id === 'string' ? payload.reply_to_id : ''
            };
        }
    } catch {
    }
    return {type: 'text', text};
}

function drawMessage(record, text) {
    const name = record.display_name || '';
    const ts = record.created_at || '';
    const messageID = String(record.id || '');
    const senderID = String(record.sender_id || '');
    const rowID = Number(record.row_id || 0);
    const isMine = !!myUserID && senderID === myUserID;
    const c = normalizeHexColor(record.chat_color || '') || userColor(name);
    const payload = parseMessagePayload(text);
    const replyToID = String(record.reply_to_id || payload.replyToID || '');
    const deleted = String(record.deleted_at || '').trim() !== '';
    const edited = !deleted && String(record.edited_at || '').trim() !== '';
    const status = isMine ? messageDeliveryLabel(rowID, messageID, senderID) : '';
    const statusHTML = `<span class="line-meta" data-meta-msg="${esc(messageID)}">${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}</span>`;
    const editedTitle = edited ? ` title="edited ${esc(new Date(record.edited_at).toLocaleString())}"` : '';
    const replyHTML = replyToID ? renderReplySnippet(replyToID) : '';
    const reactionHTML = renderReactionsHTML(messageID);
    const canDelete = isMine || isAdminRole(myRole);
    const pinBtn = isAdminRole(myRole) ? `<button class="tiny-action" data-pin-msg="${esc(messageID)}" title="${pinnedMessageIDs.has(messageID) ? 'Unpin message' : 'Pin message'}" aria-label="${pinnedMessageIDs.has(messageID) ? 'Unpin message' : 'Pin message'}">${ICON_PIN}</button>` : '';
    const actions = `<span class="line-actions"><button class="tiny-action" data-react-msg="${esc(messageID)}" title="Add reaction" aria-label="Add reaction">${ICON_REACT}</button><button class="tiny-action" data-reply-msg="${esc(messageID)}" title="Reply" aria-label="Reply">${ICON_REPLY}</button>${isMine ? `<button class="tiny-action" data-edit-msg="${esc(messageID)}" title="Edit message" aria-label="Edit message">${ICON_EDIT}</button>` : ''}${pinBtn}${canDelete ? `<button class="tiny-action danger" data-delete-msg="${esc(messageID)}" title="Delete message" aria-label="Delete message">${ICON_DELETE}</button>` : ''}</span>`;
    const lineClass = `line${showAvatars ? '' : ' no-avatar'}`;
    const avatarHTML = showAvatars ? `<button class="line-avatar-button" type="button" data-profile-user="${esc(senderID)}" aria-label="Open ${esc(name || 'member')} profile">${avatarMarkup(name, record.avatar_url || '', record)}</button>` : '';
    const headerHTML = messageHeaderHTML(name, ts, c);
    const pinBadge = pinnedMessageIDs.has(messageID) ? `<span class="reply-snippet">Pinned</span>` : '';
    if (deleted) {
        return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}${drawLine(name, '[message deleted]', ts, c)}${statusHTML}${reactionHTML}${actions}</div>`;
    }
    if (payload.type === 'file') {
        const src = `data:${payload.mime};base64,${payload.data}`;
        const caption = payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
        return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}${headerHTML}<span class="line-media">${pinBadge}${replyHTML}<a class="file-link" href="${esc(src)}" download="${esc(payload.name)}">${esc(payload.name)}</a><span class="image-meta">${esc(payload.mime)} · ${esc(formatBytes(payload.size))}</span>${caption}<span class="line-meta" data-meta-msg="${esc(messageID)}"${editedTitle}>${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}</span></span>${reactionHTML}${actions}</div>`;
    }
    if (payload.type !== 'image') {
        const textValue = payload.type === 'text' ? payload.text : text;
        return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}${headerHTML}<span class="line-media">${pinBadge}${replyHTML}<span class="line-text">${renderRichText(textValue)}</span><span class="line-meta" data-meta-msg="${esc(messageID)}"${editedTitle}>${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}</span></span>${reactionHTML}${actions}</div>`;
    }
    const src = `data:${payload.mime};base64,${payload.data}`;
    const caption = payload.caption ? `<span class="line-text">${renderRichText(payload.caption)}</span>` : '';
    return `<div class="${lineClass}" data-msg-id="${esc(messageID)}" data-row-id="${esc(String(rowID))}" data-sender-id="${esc(senderID)}">${avatarHTML}${headerHTML}<span class="line-media">${pinBadge}${replyHTML}<img class="chat-image" src="${esc(src)}" alt="${esc(payload.name)}" data-full-image="${esc(src)}"/><span class="image-meta">${esc(payload.name)} · ${esc(formatBytes(payload.size))}</span>${caption}<span class="line-meta" data-meta-msg="${esc(messageID)}"${editedTitle}>${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}</span></span>${reactionHTML}${actions}</div>`;
}

function renderReactionsHTML(messageID) {
    const key = String(messageID || '');
    const counts = messageReactions.get(key) || {};
    const mine = myReactions.get(key) || {};
    const authors = reactionAuthors.get(key) || {};
    const chips = Object.entries(counts).filter(([, count]) => Number(count) > 0).slice(0, 8).map(([emoji, count]) => {
        const names = reactionAuthorNames(authors[emoji] || []);
        const label = reactionTooltipText(names, Number(count) || 0);
        const tooltip = label ? ` data-reaction-authors="${esc(label)}"` : '';
        const aria = label ? ` aria-label="${esc(label)}"` : '';
        return `<button class="reaction-chip${mine[emoji] ? ' mine' : ''}" data-react-toggle="${esc(key)}" data-react-emoji="${esc(emoji)}"${tooltip}${aria}>${renderEmojiVisual(emoji)} ${esc(String(count))}</button>`;
    }).join('');
    return `<span class="reactions" data-reactions-msg="${esc(key)}">${chips}</span>`;
}

function reactionAuthorNames(items) {
    const out = [];
    const seen = new Set();
    for (const item of (Array.isArray(items) ? items : [])) {
        const name = String(item?.display_name || '').trim();
        const id = String(item?.user_id || name).trim();
        const key = id || name;
        if (!name || seen.has(key)) continue;
        seen.add(key);
        out.push(name);
    }
    return out;
}

function reactionTooltipText(names, count) {
    if (!names.length) return '';
    if (names.length <= 4) return `${names.join(', ')} reacted`;
    const extra = Math.max(0, count - 3);
    return `${names.slice(0, 3).join(', ')} and ${extra} more reacted`;
}

function latestOwnMessageRowID() {
    let maxRow = 0;
    for (const item of knownMessages.values()) {
        if (String(item?.sender_id || '') !== String(myUserID || '')) continue;
        const row = Number(item?.row_id || 0);
        if (row > maxRow) maxRow = row;
    }
    return maxRow;
}

function messageDeliveryLabel(rowID, messageID, senderID, latestMineRowID = 0) {
    if (String(senderID || '') !== String(myUserID || '')) return '';
    if (latestMineRowID > 0 && Number(rowID || 0) !== latestMineRowID) return '';
    if (pendingOutgoing.has(messageID)) return 'sending...';
    if (!rowID) return 'sent';
    let seenByOther = false;
    for (const [uid, lastRow] of readReceipts.entries()) {
        if (uid === myUserID) continue;
        if (Number(lastRow || 0) >= rowID) {
            seenByOther = true;
            break;
        }
    }
    return seenByOther ? 'seen' : 'sent';
}

function renderReplySnippet(replyToID) {
    const source = knownMessages.get(replyToID);
    if (!source) return `<span class="reply-snippet">Replying to earlier message</span>`;
    const shortText = String(source.preview || '').slice(0, 80);
    return `<span class="reply-snippet">Reply to ${esc(source.display_name || 'message')}: ${esc(shortText || '[attachment]')}</span>`;
}

function scrollChatToBottom() {
    const messages = $('messages');
    if (!messages) return;
    const scroll = () => {
        messages.scrollTop = messages.scrollHeight;
        if (messages.parentElement) messages.parentElement.scrollTop = messages.parentElement.scrollHeight;
    };
    scroll();
    requestAnimationFrame(scroll);
    setTimeout(scroll, 50);
    setTimeout(scroll, 250);
    setTimeout(scroll, 750);
}

function updateTypingBanner() {
    const el = $('typingStatus');
    if (!el) return;
    const names = [...typingUsers.values()].filter((name) => name && name !== currentDisplayName);
    if (names.length === 0) {
        el.textContent = '';
        return;
    }
    el.textContent = names.length === 1 ? `${names[0]} is typing...` : `${names.slice(0, 2).join(', ')} are typing...`;
}

function updatePresenceCount() {
    const countEl = $('memberCount');
    const toggleEl = $('memberToggle');
    if (countEl) countEl.textContent = String(onlineUsers.size);
    if (toggleEl) toggleEl.setAttribute('aria-label', `Open online members list (${onlineUsers.size} online)`);
}

function setNotifySoundEnabled(next) {
    notifySoundEnabled = !!next;
    try {
        localStorage.setItem(NOTIFY_SOUND_KEY, notifySoundEnabled ? '1' : '0');
    } catch {
    }
}

function setNotifyVolume(next) {
    const n = Number(next);
    if (!Number.isFinite(n)) return;
    notifyVolume = Math.max(0, Math.min(2, n));
    try {
        localStorage.setItem(NOTIFY_VOLUME_KEY, String(notifyVolume));
    } catch {
    }
}

function setCustomNotificationSound(name, dataURL) {
    customNotificationName = String(name || '').trim();
    customNotificationDataURL = String(dataURL || '').trim();
    try {
        localStorage.setItem(NOTIFY_CUSTOM_NAME_KEY, customNotificationName);
        localStorage.setItem(NOTIFY_CUSTOM_DATA_KEY, customNotificationDataURL);
    } catch (err) {
        customNotificationName = '';
        customNotificationDataURL = '';
        try {
            localStorage.removeItem(NOTIFY_CUSTOM_NAME_KEY);
            localStorage.removeItem(NOTIFY_CUSTOM_DATA_KEY);
        } catch {
        }
        throw err;
    }
}

function clearCustomNotificationSound() {
    customNotificationName = '';
    customNotificationDataURL = '';
    try {
        localStorage.removeItem(NOTIFY_CUSTOM_NAME_KEY);
        localStorage.removeItem(NOTIFY_CUSTOM_DATA_KEY);
    } catch {
    }
}

function setShowAvatars(next) {
    showAvatars = !!next;
    try {
        localStorage.setItem(SHOW_AVATARS_KEY, showAvatars ? '1' : '0');
    } catch {
    }
}

function setShowAvatarRings(next) {
    showAvatarRings = !!next;
    try {
        localStorage.setItem(SHOW_AVATAR_RINGS_KEY, showAvatarRings ? '1' : '0');
    } catch {
    }
}

function applyTimestampMode() {
    document.documentElement.classList.toggle('timestamps-hover', timestampMode === 'hover');
}

function setTimestampMode(next) {
    timestampMode = next === 'hover' ? 'hover' : 'always';
    try {
        localStorage.setItem(TIMESTAMP_MODE_KEY, timestampMode);
    } catch {
    }
    applyTimestampMode();
}

function setRoomStatusText(next) {
    const cleaned = String(next || '').trim();
    roomStatusText = cleaned || DEFAULT_ROOM_STATUS_TEXT;
    updateRoomConnectionStatus(!!ws && ws.readyState === WebSocket.OPEN);
}

function updateRoomConnectionStatus(isOnline) {
    const dot = document.querySelector('.room-title .status-dot');
    const label = document.getElementById('roomStatusLabel');
    if (dot) {
        dot.classList.toggle('on', !!isOnline);
        dot.classList.toggle('off', !isOnline);
    }
    if (label) label.textContent = roomStatusText;
}

function unlockAudio() {
    audioUnlocked = true;
}

function playNotificationSound(force = false) {
    if ((!force && !notifySoundEnabled) || !audioUnlocked) return;
    if (customNotificationDataURL) {
        if (activeNotificationAudio) {
            activeNotificationAudio.pause();
            activeNotificationAudio = null;
        }
        const audio = new Audio(customNotificationDataURL);
        activeNotificationAudio = audio;
        audio.volume = Math.max(0, Math.min(1, notifyVolume));
        audio.onended = () => {
            if (activeNotificationAudio === audio) activeNotificationAudio = null;
        };
        audio.play().catch(() => {
            if (activeNotificationAudio === audio) activeNotificationAudio = null;
            playBuiltInNotificationTone();
        });
        return;
    }
    playBuiltInNotificationTone();
}

function playBuiltInNotificationTone() {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
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
    setTimeout(() => ctx.close(), 250);
}

function refreshAllMessageMeta() {
    const latestMineRowID = latestOwnMessageRowID();
    document.querySelectorAll('.line[data-msg-id]').forEach((row) => {
        const msgID = row.getAttribute('data-msg-id') || '';
        const rowID = Number(row.getAttribute('data-row-id') || 0);
        const senderID = row.getAttribute('data-sender-id') || '';
        if (senderID !== myUserID) return;
        const meta = row.querySelector('.line-meta');
        if (!meta) return;
        const edited = String(knownMessages.get(msgID)?.edited_at || '').trim() !== '';
        const status = messageDeliveryLabel(rowID, msgID, senderID, latestMineRowID);
        meta.textContent = `${edited ? 'edited' : ''}${edited && status ? ' · ' : ''}${status}`;
    });
}

async function sendReadReceiptForVisible() {
    const messages = $('messages');
    if (!messages) return;
    const viewport = messages.getBoundingClientRect();
    const rows = [...messages.querySelectorAll('.line[data-row-id]')];
    if (rows.length === 0) return;
    let rowID = 0;
    for (const row of rows) {
        const bounds = row.getBoundingClientRect();
        const isVisible = bounds.bottom > viewport.top && bounds.top < viewport.bottom;
        if (!isVisible) continue;
        const currentRowID = Number(row.getAttribute('data-row-id') || 0);
        if (currentRowID > rowID) rowID = currentRowID;
    }
    if (!rowID) return;
    await api(withRoomQuery('/api/messages/read'), {method: 'POST', body: JSON.stringify({last_seen_rowid: rowID})});
}

function scheduleVisibleReadReceipt() {
    clearTimeout(readReceiptTimer);
    readReceiptTimer = setTimeout(() => {
        sendReadReceiptForVisible().catch(() => {});
    }, 180);
}

function bindMessageImageScroll({stickToBottom = null} = {}) {
    const messages = $('messages');
    if (!messages) return;
    const shouldStick = stickToBottom === null
        ? (messages.scrollHeight - messages.clientHeight - messages.scrollTop) < 180
        : !!stickToBottom;
    messages.querySelectorAll('img.chat-image').forEach((img) => {
        if (img.dataset.scrollBound === '1') return;
        img.dataset.scrollBound = '1';
        img.addEventListener('load', () => {
            if (shouldStick) scrollChatToBottom();
        }, {once: true});
    });
}

function persistIdentity() {
    localStorage.setItem('veil.credentialId', currentCredentialId);
    localStorage.setItem('veil.deviceSecret', currentDeviceSecret);
    localStorage.setItem('veil.displayName', currentDisplayName);
    localStorage.setItem('veil.roomKeyHex', roomKeyHex);
}

function clearInviteTokenFromURL() {
    if (!window.location.pathname.startsWith('/invite/')) return;
    const cleanURL = '/' + window.location.search + window.location.hash;
    window.history.replaceState({}, '', cleanURL);
}

function setStatus(el, text, tone = '') {
    if (!el) return;
    el.textContent = text;
    el.className = tone ? `status ${tone}` : 'status';
}

function bindImageLightbox() {
    const lightbox = $('imageLightbox');
    const img = $('imageLightboxImg');
    if (!lightbox || !img || lightbox.dataset.bound === '1') return;
    lightbox.dataset.bound = '1';

    document.addEventListener('click', (e) => {
        const target = e.target;
        if (!(target instanceof HTMLImageElement) || !target.dataset.fullImage) return;
        img.src = target.dataset.fullImage;
        img.alt = target.alt || 'Image preview';
        lightbox.classList.add('open');
    });
    lightbox.addEventListener('click', () => {
        lightbox.classList.remove('open');
        img.removeAttribute('src');
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !lightbox.classList.contains('open')) return;
        lightbox.classList.remove('open');
        img.removeAttribute('src');
    });
}

async function joinWithToken(token, name) {
    const credentialId = crypto.randomUUID();
    const deviceSecret = bytesToHex(randomBytes(32));
    const res = await api('/api/join', {
        method: 'POST',
        body: JSON.stringify({token, display_name: name, public_key: 'mvp', credential_id: credentialId, device_secret: deviceSecret})
    });
    if (!res.ok) return res;
    currentCredentialId = credentialId;
    currentDeviceSecret = deviceSecret;
    currentDisplayName = name;
    if (res.data && typeof res.data.room_key_enc === 'string' && res.data.room_key_enc.length > 0) {
        roomKeyHex = res.data.room_key_enc;
    }
    if (res.data && res.data.room_id) {
        activeRoomID = String(res.data.room_id || activeRoomID || 'main');
        try {
            localStorage.setItem('veil.activeRoomID', activeRoomID);
        } catch {
        }
    }
    persistIdentity();
    return res;
}

async function bootstrapRoom(room, name) {
    const credentialId = crypto.randomUUID();
    const deviceSecret = bytesToHex(randomBytes(32));
    roomKeyHex = randomRoomKeyHex();
    const res = await api('/api/bootstrap', {
        method: 'POST',
        body: JSON.stringify({
            room_name: room,
            display_name: name,
            public_key: 'mvp',
            credential_id: credentialId,
            device_secret: deviceSecret,
            room_key_enc: roomKeyHex
        })
    });
    if (!res.ok) return res;
    currentCredentialId = credentialId;
    currentDeviceSecret = deviceSecret;
    currentDisplayName = name;
    persistIdentity();
    return res;
}

async function refreshAdminIdentity() {
    const me = await api('/api/admin/users');
    if (!me.ok) return;
    myRole = me.data.my_role || myRole;
    myUserID = me.data.me || myUserID;
}

async function refreshRoomName() {
    const info = await api(withRoomQuery('/api/room'));
    if (!info.ok) return;
    if (info.data && info.data.room_id) activeRoomID = String(info.data.room_id);
    roomName = (info.data && info.data.room_name) ? String(info.data.room_name).trim() : roomName;
    setRoomStatusText(info.data && info.data.room_status_text ? String(info.data.room_status_text) : roomStatusText);
}

async function refreshRooms() {
    const res = await api('/api/rooms');
    if (!res.ok) return;
    availableRooms = Array.isArray(res.data.rooms) ? res.data.rooms : [];
    if (!availableRooms.some((room) => String(room.id || '') === String(activeRoomID || ''))) {
        activeRoomID = String((availableRooms[0] && availableRooms[0].id) || 'main');
        try {
            localStorage.setItem('veil.activeRoomID', activeRoomID);
        } catch {
        }
    }
}

async function exportKeys(passphrase) {
    if (!roomKeyHex) throw new Error('No room key to export');
    const wrapped = await wrapRoomKeyWithPassphrase(roomKeyHex, passphrase);
    const payload = {
        format: 'veil.keys.v3',
        created_at: new Date().toISOString(),
        server_base: location.origin,
        credential_id: currentCredentialId || '',
        device_secret: currentDeviceSecret || '',
        display_name: currentDisplayName || '', ...wrapped
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'room.keys';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}
