function navHTML(){
  const canOpenControl = isAdminRole(myRole);
  return `
    <aside class="sidebar">
      <div class="brand"><div class="eyebrow">encrypted room</div><h1>Veil</h1><span class="muted">private realtime chat</span></div>
      <nav class="nav">
        <button class="nav-btn ${currentView===VIEW_CHAT?'active':''}" id="tabChat">Chat</button>
        <button class="nav-btn ${currentView===VIEW_PROFILE?'active':''}" id="tabProfile">Profile</button>
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
  const member = roomMembers.find((m)=>String(m.id||'')===String(myUserID||'')) || {};
  const profilePreview = showAvatars ? avatarMarkup(currentDisplayName || 'member', member.avatar_url || '', member) : '';
  return `
    <section class="main">
      <header class="topbar chat-topbar">
        <div class="room-heading">
          <button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button>
          <div class="room-title">
            <strong>${esc(title)}</strong>
            <small><span class="status-dot on" aria-hidden="true"></span>encrypted room</small>
          </div>
        </div>
        <div class="top-actions">
          <input id="chatSearchInput" class="chat-search" type="search" placeholder="Search loaded messages" aria-label="Search loaded messages"/>
          <button id="jumpLatest" class="secondary member-toggle" type="button" aria-label="Jump to latest message">Latest</button>
          <button id="memberToggle" class="secondary member-toggle" type="button" aria-label="Open online members list">Online Members <span id="memberCount">0</span></button>
          <div class="profile-chip">${profilePreview}<span>${esc(currentDisplayName||'member')}</span></div>
        </div>
      </header>
      <div id="memberPopover" class="member-popover"><div id="memberList" class="member-list"></div></div>
      <div class="panel chat-panel"><div id="pinnedBar" class="status"></div><div id="messages" class="chat-log"></div></div>
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
        <button id="send" aria-label="Send message">Send</button>
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

function viewTopbarHTML(title, subtitle, aside=''){
  return `<header class="topbar"><div><button id="sidebarToggle" class="secondary sidebar-toggle" type="button" title="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}" aria-label="${sidebarCollapsed?'Open sidebar':'Collapse sidebar'}">${sidebarCollapsed?'☰':'✕'}</button><strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><div class="top-actions">${aside}</div></header>`;
}

function switchControlHTML(id, label, checked){
  return `
    <label class="switch-control" for="${esc(id)}">
      <span>${esc(label)}</span>
      <input id="${esc(id)}" type="checkbox" ${checked?'checked':''}/>
      <span class="switch-track" aria-hidden="true"></span>
    </label>
  `;
}

function settingsSectionHTML(title, body, extraClass=''){
  return `<section class="settings-section ${esc(extraClass)}"><h3>${esc(title)}</h3>${body}</section>`;
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
      ${viewTopbarHTML('Theme Studio', 'Local display preferences', '<span class="muted">local only</span>')}
      <div class="panel utility-panel">
        <div class="settings-stack">
          ${settingsSectionHTML('Presets', `
          <div class="theme-actions">
            <button class="secondary" data-theme-preset="veil">Veil</button>
            <button class="secondary" data-theme-preset="ember">Ember</button>
            <button class="secondary" data-theme-preset="midnight">Midnight</button>
            <button class="secondary" data-theme-preset="graphite">Graphite</button>
          </div>
          `)}
          ${settingsSectionHTML('Custom Colors', `
          <div class="theme-grid">
            ${fields.map(([key,label,hint])=>`<div class="theme-row"><label for="theme-${key}">${label}<span>${hint}</span></label><input id="theme-${key}" data-theme-key="${key}" type="color" value="${esc(t[key])}"/></div>`).join('')}
          </div>
          `)}
          ${settingsSectionHTML('Display', `
          <div class="settings-list">
            ${switchControlHTML('themeAvatarToggle', 'Show avatars', showAvatars)}
            ${switchControlHTML('themeAvatarRingToggle', 'Show avatar rings', showAvatarRings)}
            ${switchControlHTML('themeTimestampToggle', 'Show timestamps on hover', timestampMode==='hover')}
          </div>
          <div class="theme-actions settings-footer">
            <button id="resetTheme" class="secondary">Reset</button>
          </div>
          `)}
          <div id="themeStatus" class="status">Theme changes save immediately.</div>
        </div>
      </div>
    </section>
  `;
}

function profilePanelHTML(){
  const member = roomMembers.find((m)=>String(m.id||'')===String(myUserID||'')) || {};
  const avatarURL = String(member.avatar_url || '');
  const ringEnabled = normalizeHexColorAlpha(currentAvatarRingColor || '') !== '';
  const ringAlpha1 = String(hexColorAlpha(currentAvatarRingColor));
  const ringAlpha2 = String(hexColorAlpha(currentAvatarRingColor2));
  const ringAlpha3 = String(hexColorAlpha(currentAvatarRingColor3));
  const ringAlpha4 = String(hexColorAlpha(currentAvatarRingColor4));
  const profilePreview = avatarMarkup(currentDisplayName || 'member', avatarURL, member);
  return `
    <section class="main utility">
      ${viewTopbarHTML('Profile', 'Identity, media, and alerts', `<span class="muted">${esc(currentDisplayName||'member')}</span>`)}
      <div class="panel utility-panel">
        <div class="settings-stack profile-settings">
          ${settingsSectionHTML('Identity', `
          <div class="profile-summary" id="profilePreview">
            ${profilePreview}
            <div><strong>${esc(currentDisplayName || 'member')}</strong><span>${esc(myRole || 'member')}</span></div>
          </div>
          <div class="theme-row">
            <label for="profile-chat-color">Name Color<span>Shown in chat</span></label>
            <input id="profile-chat-color" type="color" value="${esc(currentUserChatColor || userColor(currentDisplayName||''))}"/>
          </div>
          <div class="theme-row file-row">
            <label for="profile-avatar-file">Profile Picture<span>PNG, JPEG, WebP, or GIF</span></label>
            <input id="profile-avatar-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>
          </div>
          <div id="avatarCropper" class="avatar-cropper" style="display:none;">
            <div class="avatar-cropper-preview-wrap">
              <canvas id="avatarCropCanvas" width="220" height="220" aria-label="Avatar crop preview"></canvas>
            </div>
            <div class="avatar-cropper-controls">
              <div class="theme-row wide-control">
                <label for="avatarCropZoom">Zoom<span id="avatarCropZoomLabel">100%</span></label>
                <input id="avatarCropZoom" type="range" min="100" max="300" step="1" value="100"/>
              </div>
              <div class="avatar-crop-hint">Drag to position. Scroll to zoom.</div>
            </div>
            <div class="theme-actions settings-footer">
              <button id="avatarCropSave">Save Cropped Picture</button>
              <button id="avatarCropCancel" class="secondary">Cancel</button>
            </div>
          </div>
          <div class="theme-actions settings-footer">
            <button id="profileAvatarClear" class="secondary">Clear Picture</button>
          </div>
          `)}
          ${settingsSectionHTML('Avatar Ring', `
          <div class="settings-list">
            ${switchControlHTML('profileAvatarRingEnabled', 'Use avatar ring', ringEnabled)}
          </div>
          <div class="ring-settings">
          <div class="theme-row">
            <label for="profile-avatar-ring-color">Primary<span>Color</span></label>
            <input id="profile-avatar-ring-color" type="color" value="${esc(hexColorBase(currentAvatarRingColor || currentUserChatColor || userColor(currentDisplayName||''), '#ff9d66'))}"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-avatar-ring-alpha">Primary Opacity<span>${esc(ringAlpha1)}%</span></label>
            <input id="profile-avatar-ring-alpha" type="range" min="0" max="100" step="1" value="${esc(ringAlpha1)}"/>
          </div>
          <div class="theme-row">
            <label for="profile-avatar-ring-color2">Secondary<span>Color</span></label>
            <input id="profile-avatar-ring-color2" type="color" value="${esc(hexColorBase(currentAvatarRingColor2 || currentAvatarRingColor || currentUserChatColor || userColor(currentDisplayName||''), '#ff78b2'))}"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-avatar-ring-alpha2">Secondary Opacity<span>${esc(ringAlpha2)}%</span></label>
            <input id="profile-avatar-ring-alpha2" type="range" min="0" max="100" step="1" value="${esc(ringAlpha2)}"/>
          </div>
          <div class="theme-row">
            <label for="profile-avatar-ring-color3">Rainbow 3<span>Color</span></label>
            <input id="profile-avatar-ring-color3" type="color" value="${esc(hexColorBase(currentAvatarRingColor3 || '#57db84', '#57db84'))}"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-avatar-ring-alpha3">Rainbow 3 Opacity<span>${esc(ringAlpha3)}%</span></label>
            <input id="profile-avatar-ring-alpha3" type="range" min="0" max="100" step="1" value="${esc(ringAlpha3)}"/>
          </div>
          <div class="theme-row">
            <label for="profile-avatar-ring-color4">Rainbow 4<span>Color</span></label>
            <input id="profile-avatar-ring-color4" type="color" value="${esc(hexColorBase(currentAvatarRingColor4 || '#9d7bff', '#9d7bff'))}"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-avatar-ring-alpha4">Rainbow 4 Opacity<span>${esc(ringAlpha4)}%</span></label>
            <input id="profile-avatar-ring-alpha4" type="range" min="0" max="100" step="1" value="${esc(ringAlpha4)}"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-avatar-ring-mode">Animation<span>Mode</span></label>
            <select id="profile-avatar-ring-mode">
              <option value="none" ${currentAvatarRingMode==='none'?'selected':''}>Still</option>
              <option value="pulse" ${currentAvatarRingMode==='pulse'?'selected':''}>Pulse</option>
              <option value="glow" ${currentAvatarRingMode==='glow'?'selected':''}>Glow</option>
              <option value="rainbow" ${currentAvatarRingMode==='rainbow'?'selected':''}>Rainbow</option>
            </select>
          </div>
          </div>
          <div class="theme-actions settings-footer">
            <button id="profileAvatarRingClear" class="secondary">Clear Ring</button>
          </div>
          `)}
          ${settingsSectionHTML('Local Background', `
          <div class="theme-row file-row">
            <label for="profile-background-file">Background Image<span>This browser</span></label>
            <input id="profile-background-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>
          </div>
          <div class="theme-row wide-control">
            <label for="profile-background-strength">Strength<span>${esc(String(localBackgroundStrength()))}%</span></label>
            <input id="profile-background-strength" type="range" min="0" max="100" step="1" value="${esc(String(localBackgroundStrength()))}"/>
          </div>
          <div class="theme-actions settings-footer">
            <button id="profileBackgroundClear" class="secondary">Clear Background</button>
          </div>
          `)}
          ${settingsSectionHTML('Notifications', `
          <div class="settings-list">
            ${switchControlHTML('profileSoundToggle', 'Notification sound', notifySoundEnabled)}
          </div>
          <div class="theme-row wide-control">
            <label for="profile-notify-volume">Volume<span>${esc(String(Math.round(notifyVolume*100)))}%</span></label>
            <input id="profile-notify-volume" type="range" min="0" max="200" step="1" value="${esc(String(Math.round(notifyVolume*100)))}"/>
          </div>
          `)}
          <div id="profileStatus" class="status">Profile preferences apply immediately.</div>
        </div>
      </div>
    </section>
  `;
}

function controlPanelHTML(){
  const canManageUsers = myRole === 'root_admin';
  return `
    <section class="main utility">
      ${viewTopbarHTML('Control Center', 'Room administration', `<span class="muted">${esc(myRole)}</span>`)}
      <div class="panel utility-panel">
        <div class="admin-layout">
          <div class="admin-column admin-column-main">
            <section class="settings-section admin-section admin-card">
              <h3>Members</h3>
              <p class="admin-lead">Manage roles and member access for this room.</p>
              <div id="roleStatus" class="status">${canManageUsers ? 'Load members to update roles.' : 'Only root admins can change roles.'}</div>
              <div id="adminUsers" class="admin-users"></div>
            </section>
            <section class="settings-section admin-section admin-card">
              <h3>Invites</h3>
              <p class="admin-lead">Create and manage invitation links for new members.</p>
              <div class="theme-actions admin-actions-row">
                <button id="invite">Create Invite</button>
                <button id="revokeUnusedInvites" class="secondary">Revoke Unused</button>
                <button id="purgeUsedRevokedInvites" class="secondary">Purge Used/Revoked</button>
              </div>
              <div id="inviteOut" class="invite-out muted">No invites generated yet.</div>
              <div id="inviteList" class="admin-users"></div>
            </section>
          </div>
          <div class="admin-column admin-column-side">
            <section class="settings-section admin-section admin-card">
              <h3>Room</h3>
              <p class="admin-lead">Update the visible room title for everyone.</p>
              <div class="theme-actions admin-actions-row">
                <input id="roomNameInput" type="text" maxlength="80" placeholder="Room name" value="${esc(roomName || '')}"/>
                <button id="saveRoomName" class="secondary">Save Name</button>
              </div>
              <div id="roomNameStatus" class="status">Admins can update the room name.</div>
            </section>
            <section class="settings-section admin-section admin-card admin-card-danger">
              <h3>Message Retention</h3>
              <p class="admin-lead">Prune or clear stored messages. These actions cannot be undone.</p>
              <div id="messageAdminStatus" class="status">Loading message stats...</div>
              <div class="theme-actions admin-actions-row">
                <input id="retainCountInput" type="number" min="1" step="1" placeholder="Keep latest count"/>
                <button id="retainMessages" class="secondary">Keep Latest</button>
              </div>
              <div class="theme-actions admin-actions-row">
                <button id="clearMessages" class="btn-danger">Delete All Messages</button>
              </div>
            </section>
            <section class="settings-section admin-section admin-card">
              <h3>Admin Audit Log</h3>
              <p class="admin-lead">Recent admin actions for accountability.</p>
              <div id="auditStatus" class="status">Loading audit log...</div>
              <div id="auditList" class="admin-users"></div>
            </section>
          </div>
        </div>
      </div>
    </section>
  `;
}

async function bootView(){
  app.innerHTML = `
    <section class="boot-wrap">
      <div class="boot-card setup-card">
        <div class="boot-header">
          <div class="eyebrow">first launch</div>
          <div class="boot-title">Create your Veil room</div>
          <div class="muted">This becomes the private room and your first root admin identity.</div>
        </div>
        <div class="boot-grid boot-form">
          <input id="room" placeholder="Room name" autocomplete="organization"/>
          <input id="name" placeholder="Display name" autocomplete="nickname"/>
          <button id="go">Create Room</button>
          <div id="bootOut" class="status"></div>
        </div>
      </div>
    </section>
  `;
  $('go').onclick=async()=>{
    const room=$('room').value.trim();
    const name=$('name').value.trim();
    const res=await bootstrapRoom(room, name);
    if(!res.ok){ setStatus($('bootOut'), res.data.error||'failed', 'err'); return; }
    chatView();
  };
}

async function accessView(){
  app.innerHTML = `
    <section class="boot-wrap">
      <div class="boot-card auth-shell">
        <div class="boot-header">
          <div class="eyebrow">room found</div>
          <div class="boot-title">Welcome Back</div>
          <div class="muted">Restore your saved identity to re-enter this Veil room.</div>
        </div>
        <div class="auth-grid">
          <section class="auth-card">
            <h3>Returning User</h3>
            <div class="auth-copy">Import your encrypted <code>room.keys</code> file and unlock it with your passphrase.</div>
            <input id="accessPassphrase" placeholder="Restore passphrase" autocomplete="off"/>
            <input id="accessImportFile" type="file" accept=".keys,application/json"/>
            <div class="auth-actions"><button id="accessImportBtn">Restore Session</button></div>
            <div id="importOut" class="status"></div>
          </section>
          <section class="auth-card">
            <h3>Quick Device Sync</h3>
            <div class="auth-copy">Paste a sync code from another trusted device and enter its sync passphrase.</div>
            <input id="accessDevicePassphrase" placeholder="Sync passphrase" autocomplete="off"/>
            <textarea id="accessDeviceCode" rows="4" placeholder="Paste device sync code"></textarea>
            <div class="auth-actions"><button id="accessDeviceSyncBtn" class="secondary">Import Device Sync</button></div>
            <div id="deviceSyncOut" class="status"></div>
          </section>
        </div>
      </div>
    </section>
  `;

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
  app.innerHTML = `
    <section class="boot-wrap">
      <div class="boot-card auth-shell invite-shell">
        <div class="boot-header">
          <div class="eyebrow">invite link</div>
          <div class="boot-title">Join Veil Room</div>
          <div class="muted">Create your room identity with a display name to continue.</div>
        </div>
        <section class="auth-card">
          <h3>New Member</h3>
          <div class="auth-copy">This invite can be used once. After joining, the token is cleared from your address bar automatically.</div>
          <input id="name" placeholder="Display name" autocomplete="nickname"/>
          <div class="auth-actions"><button id="join">Join Securely</button></div>
          <div id="joinOut" class="status">Invite token detected and ready.</div>
        </section>
      </div>
    </section>
  `;
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
  const reactionPayload = history.data.reactions || {};
  const myReactionPayload = history.data.my_reactions || {};
  const pinnedPayload = Array.isArray(history.data.pinned_ids) ? history.data.pinned_ids : [];
  if(!appendOlder){
    messageReactions = new Map();
    myReactions = new Map();
    pinnedMessageIDs = new Set(pinnedPayload.map((x)=>String(x)));
  }
  for(const [msgID, counts] of Object.entries(reactionPayload)){
    messageReactions.set(String(msgID), counts || {});
  }
  for(const [msgID, arr] of Object.entries(myReactionPayload)){
    const m = {};
    for(const emoji of (arr || [])) m[String(emoji)] = true;
    myReactions.set(String(msgID), m);
  }
  const renderList = appendOlder ? list : [...list].reverse();
  const data = history.data || {};
  if(typeof data.my_user_id==='string' && data.my_user_id) myUserID = data.my_user_id;
  if(typeof data.my_chat_color==='string'){
    const selfColor=normalizeHexColor(data.my_chat_color);
    if(selfColor){
      currentUserChatColor=selfColor;
      setUserColor(currentDisplayName || '', selfColor);
    }
  }
  if(typeof data.my_avatar_ring_color==='string'){
    currentAvatarRingColor=normalizeHexColorAlpha(data.my_avatar_ring_color);
  }
  if(typeof data.my_avatar_ring_color2==='string'){
    currentAvatarRingColor2=normalizeHexColorAlpha(data.my_avatar_ring_color2);
  }
  if(typeof data.my_avatar_ring_color3==='string'){
    currentAvatarRingColor3=normalizeHexColorAlpha(data.my_avatar_ring_color3);
  }
  if(typeof data.my_avatar_ring_color4==='string'){
    currentAvatarRingColor4=normalizeHexColorAlpha(data.my_avatar_ring_color4);
  }
  if(typeof data.my_avatar_ring_mode==='string'){
    currentAvatarRingMode=normalizeAvatarRingMode(data.my_avatar_ring_mode);
  }
  hasMoreHistory = !!data.has_more;
  if(!appendOlder){
    seenMessageIDs = new Set();
    knownMessages = new Map();
    messages.innerHTML='';
    oldestLoadedRowID = 0;
    const myLastSeenRowID = Number((data.receipts && data.receipts[myUserID]) || 0);
    unreadDividerRowID = myLastSeenRowID;
  }
  for(const m of renderList){
    if(appendOlder) await appendMessageRecord(messages, m, {prepend:true});
    else await appendMessageRecord(messages, m);
    const rowID=Number(m.row_id||0);
    if(rowID>0 && (oldestLoadedRowID===0 || rowID<oldestLoadedRowID)) oldestLoadedRowID=rowID;
  }
  if(data.receipts){
    for(const [uid,row] of Object.entries(data.receipts)) readReceipts.set(uid, Number(row||0));
  }
  if(appendOlder){
    historyLoadingMore=false;
  }else{
    renderUnreadDivider();
    renderPinnedBarFromState();
    scrollChatToBottom();
  }
  bindMessageImageScroll();
  updatePresenceCount();
  await sendReadReceiptForVisible();
  refreshAllMessageMeta();
}

function renderUnreadDivider(){
  const messages=$('messages');
  if(!messages || unreadDividerRowID<=0) return;
  const rows=[...messages.querySelectorAll('.line[data-row-id]')];
  const target=rows.find((row)=>Number(row.getAttribute('data-row-id')||0) > unreadDividerRowID);
  if(!target) return;
  const existing=messages.querySelector('.unread-divider');
  if(existing) existing.remove();
  target.insertAdjacentHTML('beforebegin', `<div class="unread-divider">Unread Messages</div>`);
}

function renderPinnedBarFromState(){
  const bar=$('pinnedBar');
  const messages=$('messages');
  if(!bar || !messages) return;
  const ids=[...pinnedMessageIDs];
  if(ids.length===0){
    bar.textContent='';
    return;
  }
  bar.innerHTML = ids.slice(0,4).map((id)=>{
    const source=knownMessages.get(id);
    const preview=source ? `${source.display_name}: ${String(source.preview||'').slice(0,48)}` : `Pinned ${id.slice(0,8)}`;
    return `<button class="tiny-action" data-jump-msg="${esc(id)}">${esc(preview)}</button>`;
  }).join('');
  bar.querySelectorAll('button[data-jump-msg]').forEach((btn)=>{
    btn.addEventListener('click',()=>{
      const id=btn.getAttribute('data-jump-msg') || '';
      const row=messages.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
      if(row) row.scrollIntoView({block:'center', behavior:'smooth'});
    });
  });
}

async function appendMessageRecord(messagesEl, record, {prepend=false}={}){
  if(!messagesEl || !record) return false;
  const myUserIDStr = String(myUserID || '');
  const senderIDStr = String(record.sender_id || '');
  const messageID = String(record.id || '').trim();
  if(messageID){
    if(seenMessageIDs.has(messageID)) return false;
    seenMessageIDs.add(messageID);
  }
  registerDisplayName(record.display_name || '');
  const recordColor=normalizeHexColor(record.chat_color || '');
  if(recordColor && record.display_name){
    setUserColor(record.display_name, recordColor);
    if(myUserIDStr && senderIDStr===myUserIDStr) currentUserChatColor=recordColor;
  }
  if(myUserIDStr && senderIDStr===myUserIDStr){
    currentAvatarRingColor=normalizeHexColorAlpha(record.avatar_ring_color || '');
    currentAvatarRingColor2=normalizeHexColorAlpha(record.avatar_ring_color2 || '');
    currentAvatarRingColor3=normalizeHexColorAlpha(record.avatar_ring_color3 || '');
    currentAvatarRingColor4=normalizeHexColorAlpha(record.avatar_ring_color4 || '');
    currentAvatarRingMode=normalizeAvatarRingMode(record.avatar_ring_mode || '');
  }
  let plain='[decrypt failed]';
  const deleted = String(record.deleted_at||'').trim() !== '';
  if(!deleted){
    try{ if(roomKeyHex) plain=await decryptText(roomKeyHex,record.nonce,record.ciphertext); }catch{}
  }
  const parsed=parseMessagePayload(plain);
  const previewText = parsed.type==='text' ? String(parsed.text||plain) : (parsed.caption || `[${parsed.type}]`);
  knownMessages.set(messageID, {display_name:record.display_name||'', preview:previewText, row_id:Number(record.row_id||0), sender_id:senderIDStr, edited_at:String(record.edited_at||'')});
  const row = drawMessage(record, plain);
  if(prepend) messagesEl.insertAdjacentHTML('afterbegin', row);
  else messagesEl.insertAdjacentHTML('beforeend', row);
  return true;
}
