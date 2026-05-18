function bindChatActions(){
  const sendBtn=$('send');
  const input=$('m');
  if(!sendBtn || !input) return;
  const preview=$('attachmentPreview');
  const mentionPicker=$('mentionPicker');
  const composer=$('composer');
  const messages=$('messages');
  const replyPreview=$('replyPreview');
  const typingStatus=$('typingStatus');
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
  if(typingStatus) typingStatus.textContent='';

  const updateReplyPreview=()=>{
    if(!replyPreview) return;
    if(!replyToMessageID){
      replyPreview.style.display='none';
      replyPreview.textContent='';
      return;
    }
    const source=getMessageByID(replyToMessageID);
    const label=source ? `Replying to ${source.display_name}: ${String(source.preview||'').slice(0,80)}` : 'Replying to earlier message';
    replyPreview.style.display='block';
    replyPreview.textContent=label;
  };

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
  const emitTyping=(typing)=>{
    if(!ws || ws.readyState!==WebSocket.OPEN) return;
    ws.send(JSON.stringify({type:'typing',typing:!!typing}));
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
  if(input){
    input.addEventListener('input',()=>{
      clearTimeout(typingTimer);
      emitTyping(true);
      typingTimer=setTimeout(()=>emitTyping(false), 1400);
    });
  }

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
    const placeActionsNearPointer=(media,e)=>{
      const actions=media.querySelector('.line-actions');
      if(!(actions instanceof HTMLElement)) return;
      const rect=media.getBoundingClientRect();
      const w=actions.offsetWidth || 0;
      const h=actions.offsetHeight || 0;
      const x=e.clientX-rect.left+12;
      const y=e.clientY-rect.top-12;
      const maxX=Math.max(2, rect.width-w-2);
      const maxY=Math.max(2, rect.height-h-2);
      const left=Math.max(2, Math.min(x, maxX));
      const top=Math.max(2, Math.min(y, maxY));
      actions.style.left=`${left}px`;
      actions.style.top=`${top}px`;
    };
    messages.addEventListener('pointerover',(e)=>{
      const target=e.target;
      if(!(target instanceof HTMLElement)) return;
      if(target.closest('.line-actions')) return;
      const media=target.closest('.line-media');
      if(!(media instanceof HTMLElement)) return;
      placeActionsNearPointer(media,e);
    });
    messages.addEventListener('scroll',()=>{
      if(messages.scrollTop > 20 || historyLoadingMore || !hasMoreHistory) return;
      historyLoadingMore=true;
      loadHistory({appendOlder:true});
    });
    messages.addEventListener('click', async(e)=>{
      const target=e.target;
      if(!(target instanceof HTMLElement)) return;
      const replyBtn=target.closest('button[data-reply-msg]');
      if(replyBtn){
        setReplyTarget(replyBtn.getAttribute('data-reply-msg') || '');
        updateReplyPreview();
        input.focus();
        return;
      }
      const editBtn=target.closest('button[data-edit-msg]');
      if(editBtn){
        const id=editBtn.getAttribute('data-edit-msg') || '';
        const source=getMessageByID(id);
        if(!source) return;
        const next=prompt('Edit message:', String(source.preview||''));
        if(next===null) return;
        if(!next.trim()) return;
        const enc=await encryptText(roomKeyHex, JSON.stringify({v:1,type:'text',text:next.trim()}));
        await api('/api/messages/edit',{method:'POST',body:JSON.stringify({message_id:id,ciphertext:enc.ciphertext,nonce:enc.nonce})});
        return;
      }
      const delBtn=target.closest('button[data-delete-msg]');
      if(delBtn){
        const id=delBtn.getAttribute('data-delete-msg') || '';
        if(!confirm('Delete this message?')) return;
        await api('/api/messages/delete',{method:'POST',body:JSON.stringify({message_id:id})});
      }
    });
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
      const clientMsgID=crypto.randomUUID();
      const payload=pendingAttachment ? JSON.stringify({v:1,type:pendingAttachment.kind,mime:pendingAttachment.mime,name:pendingAttachment.name,size:pendingAttachment.size,data:pendingAttachment.data,caption:text,reply_to_id:replyToMessageID||''}) : JSON.stringify({v:1,type:'text',text,reply_to_id:replyToMessageID||''});
      const enc=await encryptText(roomKeyHex,payload);
      const conn=await ensureSocket();
      if(!conn || conn.readyState!==WebSocket.OPEN){
        alert('Connection lost. Reconnecting...');
        scheduleSocketReconnect();
        return;
      }
      pendingOutgoing.set(clientMsgID, Date.now());
      conn.send(JSON.stringify({type:'message',client_msg_id:clientMsgID,ciphertext:enc.ciphertext,nonce:enc.nonce,reply_to_id:replyToMessageID||''}));
      input.value='';
      clearAttachment();
      clearReplyTarget();
      updateReplyPreview();
      closeMentionPicker();
      emitTyping(false);
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
      if(replyToMessageID){
        clearReplyTarget();
        updateReplyPreview();
      }
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
  updateReplyPreview();
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
    chatColorInput.addEventListener('change', async()=>{
      const nextColor=normalizeHexColor(chatColorInput.value);
      if(!nextColor || !currentDisplayName){
        setStatus(status, 'Pick a valid chat name color first.', 'err');
        return;
      }
      setUserColor(currentDisplayName, nextColor);
      refreshRenderedUserColor(currentDisplayName);
      const r=await api('/api/profile/color',{method:'POST',body:JSON.stringify({chat_color:nextColor})});
      if(!r.ok){
        setStatus(status, r.data.error || 'Failed to save chat name color.', 'err');
        return;
      }
      currentUserChatColor=nextColor;
      setStatus(status, 'Chat name color saved for everyone.', 'ok');
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
  await renderMain();
}
