function scheduleSocketReconnect(){
  if(wsReconnectTimer || currentView!==VIEW_CHAT) return;
  const delay=Math.min(8000, 750 * Math.pow(2, wsReconnectAttempts++));
  wsReconnectTimer=setTimeout(()=>{
    wsReconnectTimer=null;
    ensureSocket();
  },delay);
}

async function handleIncomingMessage(data, messages){
  const nearBottom = (messages.scrollHeight - messages.clientHeight - messages.scrollTop) < 140;
  const mine = !!myUserID && String(data.sender_id||'') === String(myUserID);
  await appendMessageRecord(messages, data);
  const clientMsgID=String(data.client_msg_id||'');
  if(clientMsgID && pendingOutgoing.has(clientMsgID)){
    pendingOutgoing.delete(clientMsgID);
  }
  bindMessageImageScroll();
  if(!mine) playNotificationSound();
  if(mine || nearBottom) scrollChatToBottom();
  await sendReadReceiptForVisible();
  refreshAllMessageMeta();
}

async function handleMessageUpdate(data, messages){
  const id=String(data.id||'');
  if(!id) return;
  const existing=messages.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
  const anchor = existing ? existing.nextSibling : null;
  const nearBottom = (messages.scrollHeight - messages.clientHeight - messages.scrollTop) < 140;
  const prevTop = messages.scrollTop;
  const prevHeight = messages.scrollHeight;
  if(existing) existing.remove();
  seenMessageIDs.delete(id);
  await appendMessageRecord(messages, data);
  if(existing){
    const next=messages.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
    if(next && anchor) {
      anchor.before(next);
    }
    if(!nearBottom){
      const delta = messages.scrollHeight - prevHeight;
      messages.scrollTop = prevTop + delta;
    }
  }
  await sendReadReceiptForVisible();
  refreshAllMessageMeta();
}

function handleReactionUpdate(data){
  const messageID=String(data.message_id||'');
  const emoji=String(data.emoji||'');
  const count=Number(data.count||0);
  const userID=String(data.user_id||'');
  if(!messageID || !emoji) return;
  const counts=messageReactions.get(messageID) || {};
  if(count<=0) delete counts[emoji];
  else counts[emoji]=count;
  messageReactions.set(messageID, counts);
  if(userID===String(myUserID||'')){
    const mine=myReactions.get(messageID) || {};
    if(String(data.active||'')==='1') mine[emoji]=true;
    else delete mine[emoji];
    myReactions.set(messageID, mine);
  }
  const holder=document.querySelector(`[data-reactions-msg="${cssEscape(messageID)}"]`);
  if(holder) holder.outerHTML=renderReactionsHTML(messageID);
}

function handleReceipt(data){
  const uid=String(data.user_id||'');
  const row=Number(data.last_seen_rowid||0);
  if(uid && row>0) readReceipts.set(uid, Math.max(row, Number(readReceipts.get(uid)||0)));
  refreshAllMessageMeta();
}

function handleTyping(data){
  const uid=String(data.user_id||'');
  const name=String(data.display_name||'');
  const on=String(data.typing||'')==='1';
  if(!uid || uid===myUserID) return;
  setPresenceLikeState(typingUsers, uid, on, name);
  updateTypingBanner();
}

function handlePresence(data){
  const uid=String(data.user_id||'');
  const on=String(data.online||'')==='1';
  if(!uid) return;
  setPresenceLikeState(onlineUsers, uid, on);
  updatePresenceCount();
  renderMembersList();
}

function setPresenceLikeState(collection, key, on, value){
  if(on){
    if(collection instanceof Map){
      collection.set(key, value);
      return;
    }
    collection.add(key);
    return;
  }
  collection.delete(key);
}

const socketEventHandlers = {
  message: async(data, messages)=>handleIncomingMessage(data, messages),
  message_update: async(data, messages)=>handleMessageUpdate(data, messages),
  receipt: async(data)=>{ handleReceipt(data); },
  reaction_update: async(data)=>{ handleReactionUpdate(data); },
  typing: async(data)=>{ handleTyping(data); },
  presence: async(data)=>{ handlePresence(data); },
};

async function handleSocketEvent(evt, messages){
  const data = evt.data || {};
  const handler = socketEventHandlers[evt.type];
  if(!handler) return;
  await handler(data, messages);
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
      if(reconnectNeedsCatchup && currentView===VIEW_CHAT){
        loadHistory();
        reconnectNeedsCatchup=false;
      }
      finish(socket);
    };
    socket.onerror=()=>finish(null);
  });
  socket.onmessage = async(ev)=>{
    let x;
    try{ x=JSON.parse(ev.data); }catch{ return; }
    const messages=document.getElementById('messages');
    if(!messages) return;
    await handleSocketEvent(x, messages);
  };
  socket.onclose=()=>{
    if(ws===socket) ws=null;
    wsReady=null;
    reconnectNeedsCatchup=true;
    scheduleSocketReconnect();
  };
  return wsReady;
}

async function refreshMembers(){
  const res = await api('/api/members');
  if(!res.ok) return;
  const members = Array.isArray(res.data.members) ? res.data.members : [];
  roomMembers = members;
  onlineUsers = new Set(members.filter((m)=>!!m.online).map((m)=>String(m.id||'')));
  myUserID = res.data.me || myUserID;
  const me = members.find((m)=>String(m.id||'')===String(myUserID||''));
  if(me){
    currentAvatarRingColor=normalizeHexColorAlpha(me.avatar_ring_color || '');
    currentAvatarRingColor2=normalizeHexColorAlpha(me.avatar_ring_color2 || '');
    currentAvatarRingColor3=normalizeHexColorAlpha(me.avatar_ring_color3 || '');
    currentAvatarRingColor4=normalizeHexColorAlpha(me.avatar_ring_color4 || '');
    currentAvatarRingMode=normalizeAvatarRingMode(me.avatar_ring_mode || '');
    const selfColor=normalizeHexColor(me.chat_color || '');
    if(selfColor) currentUserChatColor=selfColor;
  }
  refreshTopProfileChip();
  refreshProfilePreviewAvatar();
  updatePresenceCount();
  renderMembersList();
}

function refreshTopProfileChip(){
  const chip=document.querySelector('.profile-chip');
  if(!chip) return;
  const member=roomMembers.find((m)=>String(m.id||'')===String(myUserID||'')) || {};
  const preview=showAvatars ? avatarMarkup(currentDisplayName || 'member', member.avatar_url || '', member) : '';
  chip.innerHTML=`${preview}<span>${esc(currentDisplayName||'member')}</span>`;
}

function refreshProfilePreviewAvatar(){
  const preview=document.getElementById('profilePreview');
  if(!preview) return;
  const member=roomMembers.find((m)=>String(m.id||'')===String(myUserID||'')) || {};
  const avatar=preview.querySelector('.avatar-ring');
  if(!avatar) return;
  const next=avatarMarkup(currentDisplayName || 'member', member.avatar_url || '', member);
  const tmp=document.createElement('div');
  tmp.innerHTML=next;
  const nextAvatar=tmp.firstElementChild;
  if(nextAvatar) avatar.replaceWith(nextAvatar);
}

function renderMembersList(){
  const countEl = document.getElementById('memberCount');
  const toggleEl = document.getElementById('memberToggle');
  const listEl = document.getElementById('memberList');
  if(!countEl || !listEl) return;
  const onlineCount = onlineUsers.size;
  countEl.textContent = String(onlineCount);
  if(toggleEl){
    toggleEl.setAttribute('aria-label', `Open online members list (${onlineCount} online)`);
  }
  const rows = [...roomMembers].sort((a,b)=>{
    const aOn = onlineUsers.has(String(a.id||'')) ? 0 : 1;
    const bOn = onlineUsers.has(String(b.id||'')) ? 0 : 1;
    if(aOn !== bOn) return aOn - bOn;
    return String(a.display_name||'').localeCompare(String(b.display_name||''));
  });
  if(rows.length===0){
    listEl.innerHTML = `<div class="member-empty muted">No members yet.</div>`;
    return;
  }
  listEl.innerHTML = rows.map((m)=>{
    const name = String(m.display_name || 'member');
    const id = String(m.id || '');
    const color = normalizeHexColor(m.chat_color || '') || userColor(name);
    const ring = avatarRingStyle(m, color);
    const initial = name.slice(0,1).toUpperCase() || '?';
    const avatarURL = String(m.avatar_url || '');
    const online = onlineUsers.has(id);
    const self = myUserID && id===myUserID;
    const hasImageAvatar = isAvatarImageURL(avatarURL);
    const avatar = !showAvatars ? '' : `<span class="${ring.className}"${ring.style}>${hasImageAvatar ? `<img class="member-avatar-img" src="${esc(avatarURL)}" alt="${esc(name)}" loading="lazy"/>` : `<span class="member-avatar" style="background:${esc(color)}">${esc(initial)}</span>`}</span>`;
    return `<div class="member-row${showAvatars ? '' : ' no-avatar'}"><span class="member-dot ${online?'on':'off'}" aria-hidden="true"></span>${avatar}<span class="member-name">${esc(name)}${self?' (you)':''}</span></div>`;
  }).join('');
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
