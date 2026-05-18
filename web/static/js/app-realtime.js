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
  if(mine || nearBottom) scrollChatToBottom();
  await sendReadReceiptForVisible();
  refreshAllMessageMeta();
}

async function handleMessageUpdate(data, messages){
  const id=String(data.id||'');
  if(!id) return;
  const existing=messages.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
  if(existing) existing.remove();
  seenMessageIDs.delete(id);
  await appendMessageRecord(messages, data);
  await sendReadReceiptForVisible();
  refreshAllMessageMeta();
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
  if(on) typingUsers.set(uid,name); else typingUsers.delete(uid);
  updateTypingBanner();
}

function handlePresence(data){
  const uid=String(data.user_id||'');
  const on=String(data.online||'')==='1';
  if(!uid) return;
  if(on) onlineUsers.add(uid); else onlineUsers.delete(uid);
  updatePresenceCount();
}

async function handleSocketEvent(evt, messages){
  const data = evt.data || {};
  if(evt.type==='message'){
    await handleIncomingMessage(data, messages);
    return;
  }
  if(evt.type==='message_update'){
    await handleMessageUpdate(data, messages);
    return;
  }
  if(evt.type==='receipt'){
    handleReceipt(data);
    return;
  }
  if(evt.type==='typing'){
    handleTyping(data);
    return;
  }
  if(evt.type==='presence'){
    handlePresence(data);
  }
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
