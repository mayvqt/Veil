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
      <header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>${esc(title)}</strong><small>AES-GCM end-to-end encrypted</small></div><div class="top-actions"><span id="presenceStatus" class="muted"></span><span class="muted" aria-hidden="true">|</span><span class="muted">${esc(currentDisplayName||'member')}</span></div></header>
      <div class="panel chat-panel"><div id="messages" class="chat-log"></div></div>
      <div id="composer" class="composer">
        <div id="replyPreview" class="status" style="display:none;"></div>
        <div id="typingStatus" class="muted"></div>
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
    ['danger','Danger','Warnings'],
    ['mentionSelf','Mention (You)','Self @mention text']
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
            <label for="theme-chat-color">Name Color<span>Used for your display name for everyone in this room</span></label>
            <input id="theme-chat-color" type="color" value="${esc(currentUserChatColor || userColor(currentDisplayName||''))}"/>
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

async function loadHistory({appendOlder=false}={}){
  const seq = ++historyLoadSeq;
  const messages = $('messages');
  if(!messages) return;
  const params=new URLSearchParams();
  params.set('limit','50');
  if(appendOlder && oldestLoadedRowID>0) params.set('before_rowid', String(oldestLoadedRowID));
  const history = await api(`/api/messages?${params.toString()}`);
  if(seq !== historyLoadSeq) return;
  if(!history.ok) return;
  const list = Array.isArray(history.data.messages) ? history.data.messages : [];
  const renderList = appendOlder ? list : [...list].reverse();
  if(history.data && typeof history.data.my_user_id==='string' && history.data.my_user_id) myUserID = history.data.my_user_id;
  if(history.data && typeof history.data.my_chat_color==='string'){
    const selfColor=normalizeHexColor(history.data.my_chat_color);
    if(selfColor){
      currentUserChatColor=selfColor;
      setUserColor(currentDisplayName || '', selfColor);
    }
  }
  hasMoreHistory = !!history.data.has_more;
  if(!appendOlder){
    seenMessageIDs = new Set();
    knownMessages = new Map();
    messages.innerHTML='';
    oldestLoadedRowID = 0;
  }
  for(const m of renderList){
    if(appendOlder) await appendMessageRecord(messages, m, {prepend:true});
    else await appendMessageRecord(messages, m);
    const rowID=Number(m.row_id||0);
    if(rowID>0 && (oldestLoadedRowID===0 || rowID<oldestLoadedRowID)) oldestLoadedRowID=rowID;
  }
  if(history.data && history.data.receipts){
    for(const [uid,row] of Object.entries(history.data.receipts)) readReceipts.set(uid, Number(row||0));
  }
  if(appendOlder){
    historyLoadingMore=false;
  }else{
    scrollChatToBottom();
  }
  bindMessageImageScroll();
  updatePresenceCount();
  await sendReadReceiptForVisible();
}

async function appendMessageRecord(messagesEl, record, {appendOlder=false, prepend=false}={}){
  if(!messagesEl || !record) return false;
  const messageID = String(record.id || '').trim();
  if(messageID){
    if(seenMessageIDs.has(messageID)) return false;
    seenMessageIDs.add(messageID);
  }
  registerDisplayName(record.display_name || '');
  const recordColor=normalizeHexColor(record.chat_color || '');
  if(recordColor && record.display_name){
    setUserColor(record.display_name, recordColor);
    if(myUserID && String(record.sender_id||'')===String(myUserID)) currentUserChatColor=recordColor;
  }
  let plain='[decrypt failed]';
  const deleted = String(record.deleted_at||'').trim() !== '';
  if(!deleted){
    try{ if(roomKeyHex) plain=await decryptText(roomKeyHex,record.nonce,record.ciphertext); }catch{}
  }
  const parsed=parseMessagePayload(plain);
  const previewText = parsed.type==='text' ? String(parsed.text||plain) : (parsed.caption || `[${parsed.type}]`);
  knownMessages.set(messageID, {display_name:record.display_name||'', preview:previewText, row_id:Number(record.row_id||0), edited_at:String(record.edited_at||'')});
  const row = drawMessage(record, plain);
  if(prepend) messagesEl.insertAdjacentHTML('afterbegin', row);
  else if(appendOlder) messagesEl.insertAdjacentHTML('beforeend', row);
  else messagesEl.insertAdjacentHTML('beforeend', row);
  return true;
}
