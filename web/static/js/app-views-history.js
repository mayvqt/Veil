function navHTML() {
    const rooms = (availableRooms.length ? availableRooms : [{id: activeRoomID || 'main', name: roomName || 'Room Chat'}]);
    return `
    <aside class="sidebar">
      <div class="brand"><div class="eyebrow">encrypted room</div><h1>Veil</h1><span class="muted">private realtime chat</span></div>
      <div class="sidebar-section">
        <div class="sidebar-head channel-head"><span>Channels</span>${isAdminRole(myRole) ? `<button class="channel-icon-btn" data-channel-create-toggle type="button" aria-label="Create channel" title="Create channel">+</button>` : ''}</div>
        ${isAdminRole(myRole) ? `
        <div class="channel-create" data-channel-create-panel hidden>
          <input id="sidebarRoomNameInput" type="text" maxlength="80" placeholder="Channel name" aria-label="Channel name"/>
          <button id="sidebarCreateRoomBtn" class="secondary" type="button">Create</button>
          <div id="sidebarCreateRoomStatus" class="status"></div>
        </div>` : ''}
        <div class="nav channels-nav">
          ${rooms.map((room) => roomNavButtonHTML(room)).join('')}
        </div>
      </div>
    </aside>
  `;
}

function roomUnreadCount(room) {
    const n = Number(room && room.unread_count);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
}

function channelActionButtonHTML({className, attrs, label, title, text}) {
    return `<button class="channel-icon-btn ${className}" ${attrs} type="button" aria-label="${esc(label)}" title="${esc(title)}">${esc(text)}</button>`;
}

function channelActionsHTML({roomID, label, topic, pinned, canManage, canDelete}) {
    if (!canManage && !canDelete) return '';

    const safeRoomID = esc(roomID);
    const safeLabel = esc(label);
    const actions = [];

    if (canManage) {
        actions.push(
            channelActionButtonHTML({
                className: `channel-pin${pinned ? ' active' : ''}`,
                attrs: `data-pin-room-id="${safeRoomID}" data-pin-room-next="${pinned ? '0' : '1'}"`,
                label: `${pinned ? 'Unpin' : 'Pin'} ${label}`,
                title: pinned ? 'Unpin channel' : 'Pin channel',
                text: '★',
            }),
            channelActionButtonHTML({
                className: 'channel-move',
                attrs: `data-move-room-id="${safeRoomID}" data-move-room-direction="up"`,
                label: `Move ${label} up`,
                title: 'Move up',
                text: '↑',
            }),
            channelActionButtonHTML({
                className: 'channel-move',
                attrs: `data-move-room-id="${safeRoomID}" data-move-room-direction="down"`,
                label: `Move ${label} down`,
                title: 'Move down',
                text: '↓',
            }),
            channelActionButtonHTML({
                className: 'channel-topic-btn',
                attrs: `data-topic-room-id="${safeRoomID}" data-topic-room-text="${esc(topic)}"`,
                label: `Edit ${label} topic`,
                title: 'Edit topic',
                text: 'i',
            }),
            channelActionButtonHTML({
                className: 'channel-rename',
                attrs: `data-rename-room-id="${safeRoomID}" data-rename-room-name="${safeLabel}"`,
                label: `Rename ${label}`,
                title: 'Rename channel',
                text: '✎',
            }),
        );
    }

    if (canDelete) {
        actions.push(channelActionButtonHTML({
            className: 'channel-delete',
            attrs: `data-delete-room-id="${safeRoomID}" data-delete-room-name="${safeLabel}"`,
            label: `Delete ${label}`,
            title: 'Delete channel',
            text: '×',
        }));
    }

    return `<span class="channel-actions-dock"><button class="channel-icon-btn channel-actions-toggle" type="button" aria-label="${esc(`Channel actions for ${label}`)}" title="Channel actions" aria-haspopup="true">⋯</button><span class="channel-actions">${actions.join('')}</span></span>`;
}

function roomNavButtonHTML(room) {
    const roomID = String(room && room.id || '');
    const active = roomID === String(activeRoomID || '');
    const unread = active ? 0 : roomUnreadCount(room);
    const unreadLabel = unread > 99 ? '99+' : String(unread);
    const canManage = isAdminRole(myRole) && roomID;
    const canDelete = canManage && roomID !== 'main';
    const label = String(room && room.name || roomID || 'room');
    const topic = String(room && room.status_text || '').trim();
    const pinned = !!(room && room.pinned);
    const topicHTML = topic && topic !== DEFAULT_ROOM_STATUS_TEXT ? `<span class="channel-topic">${esc(topic)}</span>` : '';
    const actionsHTML = channelActionsHTML({roomID, label, topic, pinned, canManage, canDelete});
    return `<div class="channel-row${actionsHTML ? ' has-channel-actions' : ''}"><button class="nav-btn${active ? ' active' : ''}${unread > 0 ? ' has-unread' : ''}" data-sidebar-room-id="${esc(roomID)}" data-sidebar-unread="${esc(String(unread))}" type="button"><span class="channel-copy"><span class="channel-label">${pinned ? '★ ' : ''}# ${esc(label)}</span>${topicHTML}</span>${unread > 0 ? `<span class="room-unread" aria-label="${esc(String(unread))} unread messages">${esc(unreadLabel)}</span>` : ''}</button>${actionsHTML}</div>`;
}

function sidebarToggleHTML() {
    return `<button class="secondary sidebar-toggle" data-sidebar-toggle type="button" aria-label="Toggle sidebar" aria-expanded="${sidebarOpen ? 'true' : 'false'}">☰</button>`;
}

function userMenuHTML({showLabel = true} = {}) {
    const member = roomMembers.find((m) => String(m.id || '') === String(myUserID || '')) || {};
    const profilePreview = showAvatars ? avatarMarkup(currentDisplayName || 'member', member.avatar_url || '', member) : '';
    const canOpenControl = isAdminRole(myRole);
    return `
    <div class="user-menu-wrap">
      <button class="profile-chip user-menu-toggle" data-user-menu-toggle type="button" aria-expanded="false" aria-label="Open user menu">
        ${profilePreview}
        <span>${esc(currentDisplayName || 'member')}${showLabel ? '' : ''}</span>
      </button>
      <div class="member-popover user-menu-pop" data-user-menu-panel aria-label="User menu">
        <div class="user-menu-identity">
          <strong>${esc(currentDisplayName || 'member')}</strong>
          <span>${esc(myRole || 'member')}</span>
        </div>
        <div class="user-menu-sec">
          <div class="user-menu-head">Navigate</div>
          <button class="tiny-action user-menu-btn${currentView === VIEW_CHAT ? ' active' : ''}" data-user-view="${VIEW_CHAT}" type="button">Chat</button>
          <button class="tiny-action user-menu-btn${currentView === VIEW_PROFILE ? ' active' : ''}" data-user-view="${VIEW_PROFILE}" type="button">Profile</button>
          <button class="tiny-action user-menu-btn${currentView === VIEW_KEYS ? ' active' : ''}" data-user-view="${VIEW_KEYS}" type="button">Keys</button>
          <button class="tiny-action user-menu-btn${currentView === VIEW_THEME ? ' active' : ''}" data-user-view="${VIEW_THEME}" type="button">Theme</button>
          ${canOpenControl ? `<button class="tiny-action user-menu-btn${currentView === VIEW_CONTROL ? ' active' : ''}" data-user-view="${VIEW_CONTROL}" type="button">Control</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function chatPanelHTML() {
    const title = roomName || 'Room Chat';
    return `
    <section class="main">
      <header class="topbar chat-topbar">
        <div class="room-heading">
          ${sidebarToggleHTML()}
          <div class="room-title">
            <strong>${esc(title)}</strong>
            <small><span class="status-dot off" aria-hidden="true"></span><span id="roomStatusLabel">${esc(roomStatusText)}</span></small>
          </div>
        </div>
        <div class="top-actions">
          <div id="chatSearchWrap" class="chat-search-wrap" hidden>
            <input id="chatSearchInput" class="chat-search" type="search" placeholder="Search loaded messages" aria-label="Search loaded messages"/>
          </div>
          <button id="chatSearchToggle" class="secondary member-toggle icon-btn" type="button" aria-label="Open message search" title="Search loaded messages">
            <svg class="icon-search" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="11" cy="11" r="6.5"></circle>
              <path d="M16.2 16.2L21 21"></path>
            </svg>
          </button>
          <button id="pinToggle" class="secondary member-toggle icon-btn" type="button" aria-label="Open pinned messages" title="Pinned messages">
            <svg class="icon-search" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 3h6v2l-1.2 2.4v4.1l2.2 2.2v1.3H8v-1.3l2.2-2.2V7.4L9 5V3z"></path>
              <path d="M12 15v6"></path>
            </svg>
          </button>
          <button id="memberToggle" class="secondary member-toggle" type="button" aria-label="Open online members list">Online Members <span id="memberCount">0</span></button>
          ${userMenuHTML()}
        </div>
      </header>
      <div id="memberPopover" class="member-popover"><div id="memberList" class="member-list"></div></div>
      <div id="pinPopover" class="member-popover pin-popover"><div id="pinList" class="member-list"></div></div>
      <div class="panel chat-panel"><div id="pinnedBar" class="status"></div><div id="messages" class="chat-log"></div><button id="jumpLatest" class="jump-latest-fab" type="button" aria-label="Jump to newest loaded message" title="Scroll to newest loaded message">↓</button></div>
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
            ${renderEmojiChoicesHTML()}
          </div>
        </div>
        <div class="emoji-wrap sticker-wrap">
          <button id="stickerToggle" class="secondary emoji-btn sticker-btn" type="button" title="Stickers" aria-label="Stickers" aria-expanded="false">▣</button>
          <div id="stickerPicker" class="emoji-picker sticker-picker" aria-label="Sticker picker" role="listbox">
            ${renderStickerChoicesHTML()}
          </div>
        </div>
        <button id="send" aria-label="Send message">Send</button>
      </div>
    </section>
  `;
}

function keysPanelHTML() {
    return `
    <section class="main utility">
      <header class="topbar"><div><strong>Key Vault</strong><small>Backup, restore, and recovery controls</small></div><div class="top-actions">${userMenuHTML({showLabel: false})}</div></header>
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

function viewTopbarHTML(title, subtitle, aside = '') {
    return `<header class="topbar"><div>${sidebarToggleHTML()}<strong>${esc(title)}</strong><small>${esc(subtitle)}</small></div><div class="top-actions">${aside}${userMenuHTML({showLabel: false})}</div></header>`;
}

function switchControlHTML(id, label, checked) {
    return `
    <label class="switch-control" for="${esc(id)}">
      <span>${esc(label)}</span>
      <input id="${esc(id)}" type="checkbox" ${checked ? 'checked' : ''}/>
      <span class="switch-track" aria-hidden="true"></span>
    </label>
  `;
}

function settingsSectionHTML(title, body, extraClass = '') {
    return `<section class="settings-section ${esc(extraClass)}"><h3>${esc(title)}</h3>${body}</section>`;
}

function settingsDetailsHTML(title, body, open = false) {
    return `
    <details class="settings-details" ${open ? 'open' : ''}>
      <summary>${esc(title)}</summary>
      <div class="settings-details-body">${body}</div>
    </details>
  `;
}

function adminCardHTML(title, lead, body, extraClass = '') {
    return `
    <section class="settings-section admin-section admin-card ${esc(extraClass)}">
      <h3>${esc(title)}</h3>
      <p class="admin-lead">${esc(lead)}</p>
      ${body}
    </section>
  `;
}

function adminSubsectionHTML(title, body) {
    return `
    <div class="admin-subsection">
      <h4>${esc(title)}</h4>
      ${body}
    </div>
  `;
}

function themePanelHTML() {
    const t = currentTheme();
    const fields = [
        ['bg', 'Background', 'Page base'],
        ['bg2', 'Depth', 'Page gradient'],
        ['panel', 'Panel', 'Cards and chat log'],
        ['surface', 'Surface', 'Inputs and rails'],
        ['ink', 'Text', 'Primary copy'],
        ['muted', 'Muted', 'Secondary copy'],
        ['accent', 'Accent', 'Active states'],
        ['accent2', 'Secondary', 'Highlights'],
        ['danger', 'Danger', 'Warnings'],
        ['mentionSelf', 'Mention (You)', 'Self @mention text']
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
          <div class="theme-actions settings-footer">
            <button id="copyTheme" class="secondary">Copy Theme</button>
            <button id="importTheme" class="secondary">Import Theme</button>
          </div>
          `)}
          ${settingsSectionHTML('Custom Colors', `
          ${settingsDetailsHTML('Advanced color controls', `
            <div class="theme-grid">
              ${fields.map(([key, label, hint]) => `<div class="theme-row"><label for="theme-${key}">${label}<span>${hint}</span></label><input id="theme-${key}" data-theme-key="${key}" type="color" value="${esc(t[key])}"/></div>`).join('')}
            </div>
          `)}
          `)}
          ${settingsSectionHTML('Display', `
          <div class="settings-list">
            ${switchControlHTML('themeAvatarToggle', 'Show avatars', showAvatars)}
            ${switchControlHTML('themeAvatarRingToggle', 'Show avatar rings', showAvatarRings)}
            ${switchControlHTML('themeTimestampToggle', 'Show timestamps on hover', timestampMode === 'hover')}
          </div>
          <div class="theme-actions settings-footer">
            <button id="resetTheme" class="secondary">Reset</button>
            <button id="resetDisplayPrefs" class="secondary">Reset Display</button>
          </div>
          `)}
          <div id="themeStatus" class="status">Theme changes save immediately.</div>
        </div>
      </div>
    </section>
  `;
}

function profilePanelHTML() {
    const member = roomMembers.find((m) => String(m.id || '') === String(myUserID || '')) || {};
    const avatarURL = String(member.avatar_url || '');
    const ringEnabled = normalizeHexColorAlpha(currentAvatarRingColor || '') !== '';
    const ringAlpha1 = String(hexColorAlpha(currentAvatarRingColor));
    const ringAlpha2 = String(hexColorAlpha(currentAvatarRingColor2));
    const ringAlpha3 = String(hexColorAlpha(currentAvatarRingColor3));
    const ringAlpha4 = String(hexColorAlpha(currentAvatarRingColor4));
    const profilePreview = avatarMarkup(currentDisplayName || 'member', avatarURL, member);
    const profileCardPreviewMember = {
        ...member,
        display_name: currentDisplayName || 'member',
        role: myRole || member.role || 'member',
        status_text: currentStatusText || '',
        chat_color: currentUserChatColor || member.chat_color || '',
        profile_about: currentProfileAbout || '',
        profile_accent: currentProfileAccent || currentUserChatColor || member.chat_color || '',
        profile_status_color: currentProfileStatusColor || '',
        profile_note_color: currentProfileNoteColor || '',
        profile_banner_url: currentProfileBannerURL || '',
        profile_card_bg_url: currentProfileCardBgURL || '',
        profile_banner_opacity: currentProfileBannerOpacity,
        profile_card_bg_opacity: currentProfileCardBgOpacity,
        profile_disable_banner: !!currentProfileDisableBanner,
    };
    return `
    <section class="main utility">
      ${viewTopbarHTML('Profile', 'Identity, media, and alerts', `<span class="muted">${esc(currentDisplayName || 'member')}</span>`)}
      <div class="panel utility-panel">
        <div class="settings-stack profile-settings">
          ${settingsSectionHTML('Identity', `
          <div class="profile-identity-grid">
            <div class="profile-summary" id="profilePreview">
              ${profilePreview}
              <div><strong>${esc(currentDisplayName || 'member')}${roleBadgeHTML(myRole)}</strong><span>${esc(myRole || 'member')} · version ${esc(appVersion || APP_VERSION)}</span></div>
            </div>
            <div class="profile-identity-fields">
              <div class="theme-row file-row">
                <label for="profile-display-name">Display Name<span>Shown to everyone</span></label>
                <input id="profile-display-name" type="text" maxlength="48" value="${esc(currentDisplayName || '')}" placeholder="Display name"/>
              </div>
              <div class="profile-status-row">
                <label for="profile-status-text">Status<span>Shown in member lists and your profile card</span></label>
                <div class="profile-status-input-wrap">
                  <input id="profile-status-text" type="text" maxlength="120" value="${esc(currentStatusText || '')}" placeholder="Available, focusing, away..."/>
                  <button id="profileStatusTextClear" class="secondary" type="button">Clear</button>
                </div>
              </div>
            </div>
          </div>
          `, 'profile-identity-section')}
          ${settingsSectionHTML('Profile Card', `
          <div class="profile-card-layout">
            <div class="profile-card-preview-rail">
              <div id="profileCardPreview" class="profile-card-preview">${profileCardHTML(profileCardPreviewMember)}</div>
            </div>
            <div class="profile-card-controls">
              <div class="theme-row file-row">
                <label for="profile-about">Profile Note<span>Shown on avatar click</span></label>
                <textarea id="profile-about" maxlength="240" rows="3" placeholder="A short note for your profile card">${esc(currentProfileAbout || '')}</textarea>
              </div>
              <div class="profile-color-grid">
                <div class="theme-row">
                  <label for="profile-status-color">Status Text<span>Profile card bubble</span></label>
                  <input id="profile-status-color" type="color" value="${esc(currentProfileStatusColor || '#a8b4c8')}"/>
                </div>
                <div class="theme-row">
                  <label for="profile-note-color">Note Text<span>Profile card body</span></label>
                  <input id="profile-note-color" type="color" value="${esc(currentProfileNoteColor || '#e8edf5')}"/>
                </div>
                <div class="theme-row">
                  <label for="profile-accent">Card Accent<span>Border and banner</span></label>
                  <input id="profile-accent" type="color" value="${esc(currentProfileAccent || currentUserChatColor || userColor(currentDisplayName || ''))}"/>
                </div>
              </div>
              <div class="profile-media-group">
                <div class="theme-row file-row">
                  <label for="profile-banner-file">Card Banner<span>PNG, JPEG, WebP, or GIF</span></label>
                  <input id="profile-banner-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>
                </div>
                <div id="profileBannerHint" class="file-feedback muted">${currentProfileBannerURL ? 'Current banner saved.' : 'No banner selected.'}</div>
                <div class="theme-row wide-control compact-control">
                  <label for="profile-banner-opacity">Banner Opacity<span>${esc(String(currentProfileBannerOpacity))}%</span></label>
                  <input id="profile-banner-opacity" type="range" min="0" max="100" step="1" value="${esc(String(currentProfileBannerOpacity))}"/>
                </div>
                ${switchControlHTML('profile-disable-banner', 'Disable Banner', currentProfileDisableBanner)}
                <div class="file-feedback muted">Use only the background image (great for larger GIFs).</div>
              </div>
              <div id="bannerCropper" class="avatar-cropper banner-cropper" style="display:none;">
                <div class="avatar-cropper-preview-wrap banner-cropper-preview-wrap">
                  <canvas id="bannerCropCanvas" width="320" height="92" aria-label="Card banner crop preview"></canvas>
                </div>
                <div class="avatar-cropper-controls">
                  <div class="theme-row wide-control">
                    <label for="bannerCropZoom">Zoom<span id="bannerCropZoomLabel">100%</span></label>
                    <input id="bannerCropZoom" type="range" min="100" max="300" step="1" value="100"/>
                  </div>
                  <div class="avatar-crop-hint">Drag to position. Scroll to zoom.</div>
                </div>
                <div class="theme-actions settings-footer">
                  <button id="bannerCropSave">Apply Banner Crop</button>
                  <button id="bannerCropCancel" class="secondary">Cancel</button>
                </div>
              </div>
              <div class="profile-media-group">
                <div class="theme-row file-row">
                  <label for="profile-card-bg-file">Card Background<span>PNG, JPEG, WebP, or GIF</span></label>
                  <input id="profile-card-bg-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>
                </div>
                <div id="profileCardBgHint" class="file-feedback muted">${currentProfileCardBgURL ? 'Current card background saved.' : 'No card background selected.'}</div>
                <div class="theme-row wide-control compact-control">
                  <label for="profile-card-bg-opacity">Background Opacity<span>${esc(String(currentProfileCardBgOpacity))}%</span></label>
                  <input id="profile-card-bg-opacity" type="range" min="0" max="100" step="1" value="${esc(String(currentProfileCardBgOpacity))}"/>
                </div>
              </div>
              <div id="cardBgCropper" class="avatar-cropper card-bg-cropper" style="display:none;">
                <div class="avatar-cropper-preview-wrap card-bg-cropper-preview-wrap">
                  <canvas id="cardBgCropCanvas" width="320" height="220" aria-label="Card background crop preview"></canvas>
                </div>
                <div class="avatar-cropper-controls">
                  <div class="theme-row wide-control">
                    <label for="cardBgCropZoom">Zoom<span id="cardBgCropZoomLabel">100%</span></label>
                    <input id="cardBgCropZoom" type="range" min="100" max="300" step="1" value="100"/>
                  </div>
                  <div class="avatar-crop-hint">Drag to position. Scroll to zoom.</div>
                </div>
                <div class="theme-actions settings-footer">
                  <button id="cardBgCropSave">Apply Background Crop</button>
                  <button id="cardBgCropCancel" class="secondary">Cancel</button>
                </div>
              </div>
              <div class="theme-actions settings-footer">
                <button id="profileBannerClear" class="secondary">Clear Banner</button>
                <button id="profileCardBgClear" class="secondary">Clear Background</button>
              </div>
            </div>
          </div>
          `, 'profile-card-section')}
          ${settingsSectionHTML('Chat Appearance', `
          <div class="theme-row">
            <label for="profile-chat-color">Name Color<span>Shown in chat</span></label>
            <input id="profile-chat-color" type="color" value="${esc(currentUserChatColor || userColor(currentDisplayName || ''))}"/>
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
              <button id="avatarCropSave">Apply Picture Crop</button>
              <button id="avatarCropCancel" class="secondary">Cancel</button>
            </div>
          </div>
          <div class="theme-actions settings-footer">
            <button id="profileAvatarClear" class="secondary">Clear Picture</button>
          </div>
          `, 'profile-chat-section')}
          ${settingsSectionHTML('Avatar Ring', `
          <div class="profile-subhead"><strong>Ring Controls</strong><span>Glow around your profile picture in chat and profile cards.</span></div>
          <div class="settings-list">
            ${switchControlHTML('profileAvatarRingEnabled', 'Use avatar ring', ringEnabled)}
          </div>
          ${settingsDetailsHTML('Ring style', `
            <div class="profile-subhead compact"><strong>Primary Glow</strong><span>Main ring colors and opacity.</span></div>
            <div class="ring-settings">
              <div class="theme-row">
                <label for="profile-avatar-ring-color">Primary<span>Color</span></label>
                <input id="profile-avatar-ring-color" type="color" value="${esc(hexColorBase(currentAvatarRingColor || currentUserChatColor || userColor(currentDisplayName || ''), '#ff9d66'))}"/>
              </div>
              <div class="theme-row wide-control">
                <label for="profile-avatar-ring-alpha">Primary Opacity<span>${esc(ringAlpha1)}%</span></label>
                <input id="profile-avatar-ring-alpha" type="range" min="0" max="100" step="1" value="${esc(ringAlpha1)}"/>
              </div>
              <div class="theme-row">
                <label for="profile-avatar-ring-color2">Secondary<span>Color</span></label>
                <input id="profile-avatar-ring-color2" type="color" value="${esc(hexColorBase(currentAvatarRingColor2 || currentAvatarRingColor || currentUserChatColor || userColor(currentDisplayName || ''), '#ff78b2'))}"/>
              </div>
              <div class="theme-row wide-control">
                <label for="profile-avatar-ring-alpha2">Secondary Opacity<span>${esc(ringAlpha2)}%</span></label>
                <input id="profile-avatar-ring-alpha2" type="range" min="0" max="100" step="1" value="${esc(ringAlpha2)}"/>
              </div>
              <div class="profile-subhead compact ring-subhead"><strong>Rainbow Colors</strong><span>Used when the animation is set to Rainbow.</span></div>
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
              <div class="profile-subhead compact ring-subhead"><strong>Animation</strong><span>Choose how the ring moves.</span></div>
              <div class="theme-row wide-control">
                <label for="profile-avatar-ring-mode">Animation<span>Mode</span></label>
                <select id="profile-avatar-ring-mode">
                  <option value="none" ${currentAvatarRingMode === 'none' ? 'selected' : ''}>Still</option>
                  <option value="pulse" ${currentAvatarRingMode === 'pulse' ? 'selected' : ''}>Pulse</option>
                  <option value="glow" ${currentAvatarRingMode === 'glow' ? 'selected' : ''}>Glow</option>
                  <option value="rainbow" ${currentAvatarRingMode === 'rainbow' ? 'selected' : ''}>Rainbow</option>
                </select>
              </div>
            </div>
          `, true)}
          <div class="theme-actions settings-footer">
            <button id="profileAvatarRingMatchName" class="secondary">Match Name Color</button>
            <button id="profileAvatarRingClear" class="secondary">Clear Ring</button>
          </div>
          `, 'profile-ring-section')}
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
          `, 'profile-background-section')}
          ${settingsSectionHTML('Notifications', `
          <div class="settings-list">
            ${switchControlHTML('profileSoundToggle', 'Notification sound', notifySoundEnabled)}
          </div>
          <div class="theme-row wide-control">
            <label for="profile-notify-volume">Volume<span>${esc(String(Math.round(notifyVolume * 100)))}%</span></label>
            <input id="profile-notify-volume" type="range" min="0" max="200" step="1" value="${esc(String(Math.round(notifyVolume * 100)))}"/>
          </div>
          <div class="theme-row file-row">
            <label for="profile-notify-file">Custom Sound<span>${customNotificationName ? `Local: ${esc(customNotificationName)}` : 'Built-in tone'}</span></label>
            <input id="profile-notify-file" type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/wave,audio/ogg,audio/webm,audio/mp4,audio/x-m4a"/>
          </div>
          <div class="theme-actions settings-footer">
            <button id="profileNotifyTest" class="secondary">Test Sound</button>
            <button id="profileNotifyClear" class="secondary">Clear Sound</button>
          </div>
          `, 'profile-notifications-section')}
          <div id="profileStatus" class="status">Profile preferences apply immediately.</div>
        </div>
      </div>
    </section>
  `;
}

function controlPanelHTML() {
    const canManageUsers = myRole === 'root_admin';
    return `
    <section class="main utility">
      ${viewTopbarHTML('Control Center', 'Room administration', `<span class="muted">${esc(myRole)}</span>`)}
      <div class="panel utility-panel">
        <div class="admin-layout">
          <div class="admin-column admin-column-main">
            ${adminCardHTML(
        'Members',
        'Manage roles and member access for this room.',
        `
              <div id="roleStatus" class="status">${canManageUsers ? 'Load members to update roles.' : 'Only root admins can change roles.'}</div>
              <div id="adminUsers" class="admin-users"></div>
            `
    )}
            ${adminCardHTML(
        'Invites',
        'Create and manage invitation links for new members.',
        `
              <div class="theme-actions admin-actions-row">
                <button id="invite">Create Invite</button>
                <button id="revokeUnusedInvites" class="secondary">Revoke Unused</button>
                <button id="purgeUsedRevokedInvites" class="secondary">Purge Used/Revoked</button>
              </div>
              <div id="inviteOut" class="invite-out muted">No invites generated yet.</div>
              <div id="inviteList" class="admin-users"></div>
            `
    )}
            ${adminCardHTML(
        'Room Identity',
        'Update the public name and status shown to everyone in this room.',
        `
              ${adminSubsectionHTML(
            'Room Name',
            `
                <div class="theme-actions admin-actions-row">
                  <input id="roomNameInput" type="text" maxlength="80" placeholder="Room name" value="${esc(roomName || '')}"/>
                </div>
                <div id="roomNameStatus" class="status">Room name autosaves as you type.</div>
              `
        )}
              ${adminSubsectionHTML(
            'Room Status Text',
            `
                <div class="theme-actions admin-actions-row">
                  <input id="roomStatusTextAdminInput" type="text" maxlength="48" placeholder="${esc(DEFAULT_ROOM_STATUS_TEXT)}" value="${esc(roomStatusText)}"/>
                </div>
                <div id="roomStatusTextAdminStatus" class="status">Room status autosaves as you type.</div>
              `
        )}
            `
    )}
          </div>
          <div class="admin-column admin-column-side">
            ${adminCardHTML(
        'Channel Directory',
        'Create channels for everyone. Internal ids are generated automatically.',
        `
              <div class="theme-actions admin-actions-row">
                <input id="newRoomNameInput" type="text" maxlength="80" placeholder="Room display name"/>
                <button id="createRoomBtn" class="secondary">Create Room</button>
              </div>
              <div id="createRoomStatus" class="status">Admin-created rooms are visible to all active members.</div>
            `
    )}
            ${adminCardHTML(
        'Custom Emoji + Stickers',
        'Upload room-specific emoji and stickers without changing source code.',
        `
              <div class="theme-actions admin-actions-row">
                <select id="customMediaKind">
                  <option value="emoji">Emoji</option>
                  <option value="sticker">Sticker</option>
                </select>
                <input id="customMediaName" type="text" maxlength="32" placeholder="name_like_this"/>
                <input id="customMediaFile" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/>
                <button id="customMediaUpload" class="secondary">Upload</button>
              </div>
              <div id="customMediaStatus" class="status">Emoji insert token format: <code>:name:</code></div>
              <div id="customMediaList" class="admin-users"></div>
            `
    )}
            ${adminCardHTML(
        'Message Retention',
        'Prune or clear stored messages. These actions cannot be undone.',
        `
              <div id="messageAdminStatus" class="status">Loading message stats...</div>
              <div class="theme-actions admin-actions-row">
                <input id="retainCountInput" type="number" min="1" step="1" placeholder="Keep latest count"/>
                <button id="retainMessages" class="secondary">Keep Latest</button>
              </div>
              <div class="theme-actions admin-actions-row">
                <button id="clearMessages" class="btn-danger">Delete All Messages</button>
              </div>
            `,
        'admin-card-danger'
    )}
            ${adminCardHTML(
        'Admin Audit Log',
        'Recent admin actions for accountability.',
        `
              <div id="auditStatus" class="status">Loading audit log...</div>
              <div id="auditList" class="admin-users"></div>
            `
    )}
          </div>
        </div>
      </div>
    </section>
  `;
}

async function bootView() {
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
    $('go').onclick = async () => {
        const room = $('room').value.trim();
        const name = $('name').value.trim();
        const res = await bootstrapRoom(room, name);
        if (!res.ok) {
            setStatus($('bootOut'), res.data.error || 'failed', 'err');
            return;
        }
        chatView();
    };
}

async function accessView() {
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

    $('accessImportBtn').onclick = async () => {
        const fileEl = $('accessImportFile');
        const out = $('importOut');
        const file = fileEl.files && fileEl.files[0];
        if (!file) {
            out.textContent = 'Select a room.keys file first.';
            return;
        }
        const pass = $('accessPassphrase').value.trim();
        if (!pass) {
            out.textContent = 'Enter restore passphrase first.';
            return;
        }
        try {
            const raw = await file.text();
            const cfg = JSON.parse(raw);
            if (!cfg || cfg.format !== 'veil.keys.v3' || !cfg.credential_id || !cfg.wrap) {
                out.textContent = 'Invalid or legacy key file format.';
                return;
            }
            const rk = await unwrapRoomKeyWithPassphrase(cfg, pass);
            roomKeyHex = rk;
            currentCredentialId = cfg.credential_id || '';
            currentDeviceSecret = cfg.device_secret || currentDeviceSecret || '';
            currentDisplayName = cfg.display_name || '';
            persistIdentity();
            const r = await api('/api/session/from-credential', {
                method: 'POST',
                body: JSON.stringify({credential_id: currentCredentialId, device_secret: currentDeviceSecret})
            });
            if (!r.ok) {
                out.textContent = r.data.error || 'Import worked, but login failed.';
                return;
            }
            out.textContent = 'Keys imported and session restored.';
            window.location.reload();
        } catch {
            out.textContent = 'Could not import keys (wrong passphrase or invalid file).';
        }
    };

    const accessDeviceSyncBtn = $('accessDeviceSyncBtn');
    if (accessDeviceSyncBtn) {
        accessDeviceSyncBtn.onclick = async () => {
            const out = $('deviceSyncOut');
            const pass = $('accessDevicePassphrase').value.trim();
            const code = $('accessDeviceCode').value.trim();
            if (!pass) {
                out.textContent = 'Enter sync passphrase first.';
                return;
            }
            if (!code) {
                out.textContent = 'Paste a device sync code first.';
                return;
            }
            try {
                await importDeviceSyncCode(code, pass);
                out.textContent = 'Device sync imported and session restored.';
                window.location.reload();
            } catch (e) {
                out.textContent = e.message || 'Could not import device sync code.';
            }
        };
    }

}

async function inviteView(token) {
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
    $('join').onclick = async () => {
        const name = $('name').value.trim();
        const out = $('joinOut');
        if (!name) {
            out.textContent = 'Display name is required.';
            return;
        }
        const res = await joinWithToken(token, name);
        if (!res.ok) {
            out.textContent = res.data.error || 'Join failed';
            return;
        }
        clearInviteTokenFromURL();
        out.textContent = 'Joined successfully. Import room.keys to decrypt history.';
        chatView();
    };
}

async function loadHistory({appendOlder = false} = {}) {
    const seq = ++historyLoadSeq;
    const messages = $('messages');
    if (!messages) return;
    const previousScrollHeight = appendOlder ? messages.scrollHeight : 0;
    const previousScrollTop = appendOlder ? messages.scrollTop : 0;
    const params = new URLSearchParams();
    params.set('limit', '50');
    if (appendOlder && oldestLoadedRowID > 0) params.set('before_rowid', String(oldestLoadedRowID));
    params.set('room_id', String(activeRoomID || 'main'));
    const history = await api(`/api/messages?${params.toString()}`);
    if (seq !== historyLoadSeq) {
        if (appendOlder) historyLoadingMore = false;
        return;
    }
    if (!history.ok) {
        if (appendOlder) historyLoadingMore = false;
        return;
    }
    const list = Array.isArray(history.data.messages) ? history.data.messages : [];
    const reactionPayload = history.data.reactions || {};
    const myReactionPayload = history.data.my_reactions || {};
    const reactionAuthorPayload = history.data.reaction_authors || {};
    const pinnedPayload = Array.isArray(history.data.pinned_ids) ? history.data.pinned_ids : [];
    if (!appendOlder) {
        messageReactions = new Map();
        myReactions = new Map();
        reactionAuthors = new Map();
        pinnedMessageIDs = new Set(pinnedPayload.map((x) => String(x)));
    }
    for (const [msgID, counts] of Object.entries(reactionPayload)) {
        messageReactions.set(String(msgID), counts || {});
    }
    for (const [msgID, arr] of Object.entries(myReactionPayload)) {
        const m = {};
        for (const emoji of (arr || [])) m[String(emoji)] = true;
        myReactions.set(String(msgID), m);
    }
    for (const [msgID, byEmoji] of Object.entries(reactionAuthorPayload)) {
        reactionAuthors.set(String(msgID), byEmoji || {});
    }
    const renderList = appendOlder ? list : [...list].reverse();
    const data = history.data || {};
    if (typeof data.my_user_id === 'string' && data.my_user_id) myUserID = data.my_user_id;
    if (typeof data.my_chat_color === 'string') {
        const selfColor = normalizeHexColor(data.my_chat_color);
        if (selfColor) {
            currentUserChatColor = selfColor;
            setUserColor(currentDisplayName || '', selfColor);
        }
    }
    if (typeof data.my_avatar_ring_color === 'string') {
        currentAvatarRingColor = normalizeHexColorAlpha(data.my_avatar_ring_color);
    }
    if (typeof data.my_avatar_ring_color2 === 'string') {
        currentAvatarRingColor2 = normalizeHexColorAlpha(data.my_avatar_ring_color2);
    }
    if (typeof data.my_avatar_ring_color3 === 'string') {
        currentAvatarRingColor3 = normalizeHexColorAlpha(data.my_avatar_ring_color3);
    }
    if (typeof data.my_avatar_ring_color4 === 'string') {
        currentAvatarRingColor4 = normalizeHexColorAlpha(data.my_avatar_ring_color4);
    }
    if (typeof data.my_avatar_ring_mode === 'string') {
        currentAvatarRingMode = normalizeAvatarRingMode(data.my_avatar_ring_mode);
    }
    hasMoreHistory = !!data.has_more;
    if (!appendOlder) {
        seenMessageIDs = new Set();
        knownMessages = new Map();
        messages.innerHTML = '';
        oldestLoadedRowID = 0;
        const myLastSeenRowID = Number((data.receipts && data.receipts[myUserID]) || 0);
        unreadDividerRowID = myLastSeenRowID;
    }
    const preparedRows = [];
    for (const m of renderList) {
        const prepared = await prepareMessageRecord(m);
        if (prepared) preparedRows.push(prepared);
        const rowID = Number(m.row_id || 0);
        if (rowID > 0 && (oldestLoadedRowID === 0 || rowID < oldestLoadedRowID)) oldestLoadedRowID = rowID;
    }
    if (appendOlder) {
        insertPreparedMessageRows(messages, preparedRows, {prepend: true});
        messages.scrollTop = previousScrollTop + (messages.scrollHeight - previousScrollHeight);
    } else {
        insertPreparedMessageRows(messages, preparedRows);
    }
    if (data.receipts) {
        for (const [uid, row] of Object.entries(data.receipts)) readReceipts.set(uid, Number(row || 0));
    }
    if (appendOlder) {
        historyLoadingMore = false;
    } else {
        renderUnreadDivider();
        renderPinnedBarFromState();
        renderChatEmptyState();
        scrollChatToBottom();
        revealLoadedHistoryMessages(messages);
    }
    bindMessageImageScroll();
    updatePresenceCount();
    if (!appendOlder) await sendReadReceiptForVisible();
    refreshAllMessageMeta();
}

function insertPreparedMessageRows(messagesEl, rows, {prepend = false} = {}) {
    if (!messagesEl || !Array.isArray(rows) || rows.length === 0) return;
    const orderedRows = prepend ? [...rows].reverse() : rows;
    const html = orderedRows.map((row) => row.html).join('');
    const emptyState = messagesEl.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();
    messagesEl.insertAdjacentHTML(prepend ? 'afterbegin' : 'beforeend', html);
}

function revealLoadedHistoryMessages(messagesEl) {
    if (!messagesEl) return;
    const rows = [...messagesEl.querySelectorAll('.line[data-msg-id]')];
    rows.reverse().forEach((row, index) => {
        row.style.animationDelay = `${Math.min(index * 18, 360)}ms`;
        row.classList.add('line-history-enter');
    });
}

function renderUnreadDivider() {
    const messages = $('messages');
    if (!messages) return;
    const existing = messages.querySelector('.unread-divider');
    if (existing) existing.remove();
    if (unreadDividerRowID <= 0) return;
    const rows = [...messages.querySelectorAll('.line[data-row-id]')];
    const target = rows.find((row) => Number(row.getAttribute('data-row-id') || 0) > unreadDividerRowID);
    if (!target) return;
    const unreadCount = rows.filter((row) => Number(row.getAttribute('data-row-id') || 0) > unreadDividerRowID).length;
    const unreadLabel = unreadCount > 0 ? `${unreadCount} Unread` : 'Unread Messages';
    target.insertAdjacentHTML('beforebegin', `<div class="unread-divider" role="separator" aria-label="${esc(unreadLabel)}"><span>${esc(unreadLabel)}</span></div>`);
}

function renderPinnedBarFromState() {
    const bar = $('pinnedBar');
    const messages = $('messages');
    chatRenderPinnedBar(bar, messages);
}

function renderChatEmptyState() {
    const messages = $('messages');
    if (!messages) return;
    const existing = messages.querySelector('.chat-empty-state');
    if (existing) existing.remove();
    if (messages.querySelector('.line[data-msg-id]')) return;
    const adminActions = isAdminRole(myRole)
        ? `<div class="chat-empty-actions"><button class="secondary" data-empty-channel-action="rename" type="button">Rename</button><button class="secondary" data-empty-channel-action="topic" type="button">Set Topic</button></div>`
        : '';
    messages.insertAdjacentHTML('beforeend', `
      <div class="chat-empty-state">
        <strong># ${esc(roomName || 'Room Chat')}</strong>
        <span>No messages here yet.</span>
        ${adminActions}
      </div>
    `);
}

async function prepareMessageRecord(record) {
    if (!record) return null;
    const myUserIDStr = String(myUserID || '');
    const senderIDStr = String(record.sender_id || '');
    const messageID = String(record.id || '').trim();
    if (messageID) {
        if (seenMessageIDs.has(messageID)) return null;
        seenMessageIDs.add(messageID);
    }
    registerDisplayName(record.display_name || '');
    const recordColor = normalizeHexColor(record.chat_color || '');
    if (recordColor && record.display_name) {
        setUserColor(record.display_name, recordColor);
        if (myUserIDStr && senderIDStr === myUserIDStr) currentUserChatColor = recordColor;
    }
    if (myUserIDStr && senderIDStr === myUserIDStr) {
        currentAvatarRingColor = normalizeHexColorAlpha(record.avatar_ring_color || '');
        currentAvatarRingColor2 = normalizeHexColorAlpha(record.avatar_ring_color2 || '');
        currentAvatarRingColor3 = normalizeHexColorAlpha(record.avatar_ring_color3 || '');
        currentAvatarRingColor4 = normalizeHexColorAlpha(record.avatar_ring_color4 || '');
        currentAvatarRingMode = normalizeAvatarRingMode(record.avatar_ring_mode || '');
    }
    let plain = '[decrypt failed]';
    const deleted = String(record.deleted_at || '').trim() !== '';
    if (!deleted) {
        try {
            if (roomKeyHex) plain = await decryptText(roomKeyHex, record.nonce, record.ciphertext);
        } catch {
        }
    }
    const parsed = parseMessagePayload(plain);
    const previewText = parsed.type === 'text' ? String(parsed.text || plain) : (parsed.caption || `[${parsed.type}]`);
    knownMessages.set(messageID, {
        display_name: record.display_name || '',
        preview: previewText,
        row_id: Number(record.row_id || 0),
        sender_id: senderIDStr,
        edited_at: String(record.edited_at || '')
    });
    return {
        html: drawMessage(record, plain),
        messageID
    };
}

async function appendMessageRecord(messagesEl, record, {prepend = false, animate = false} = {}) {
    if (!messagesEl || !record) return false;
    const prepared = await prepareMessageRecord(record);
    if (!prepared) return false;
    const emptyState = messagesEl.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();
    if (prepend) messagesEl.insertAdjacentHTML('afterbegin', prepared.html);
    else messagesEl.insertAdjacentHTML('beforeend', prepared.html);
    if (animate) {
        const inserted = messagesEl.querySelector(`.line[data-msg-id="${cssEscape(prepared.messageID)}"]`);
        if (inserted) inserted.classList.add('line-enter');
    }
    return true;
}
