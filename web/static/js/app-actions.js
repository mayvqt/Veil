function bindChatActions() {
    const sendBtn = $('send');
    const input = $('m');
    if (!sendBtn || !input) return;
    const preview = $('attachmentPreview');
    const mentionPicker = $('mentionPicker');
    const composer = $('composer');
    const messages = $('messages');
    const replyPreview = $('replyPreview');
    const typingStatus = $('typingStatus');
    const memberToggle = $('memberToggle');
    const memberPopover = $('memberPopover');
    const pinToggle = $('pinToggle');
    const pinPopover = $('pinPopover');
    const pinList = $('pinList');
    const searchInput = $('chatSearchInput');
    const searchWrap = $('chatSearchWrap');
    const searchToggle = $('chatSearchToggle');
    const jumpLatestBtn = $('jumpLatest');
    const roomTopicQuickEdit = $('roomTopicQuickEdit');
    const pinnedBar = $('pinnedBar');
    const emojiToggle = $('emojiToggle');
    const emojiPicker = $('emojiPicker');
    const stickerToggle = $('stickerToggle');
    const stickerPicker = $('stickerPicker');
    const attachToggle = $('attachToggle');
    const attachFileInput = $('attachFileInput');
    let mentionOpen = false;
    let mentionQuery = '';
    let mentionStart = -1;
    let mentionCandidates = [];
    let mentionIndex = 0;
    registerDisplayName(currentDisplayName);
    activeEmojiPicker = emojiPicker;
    activeEmojiToggle = emojiToggle;
    activeStickerPicker = stickerPicker;
    activeStickerToggle = stickerToggle;
    const emojiButtons = emojiPicker ? [...emojiPicker.querySelectorAll('button[data-emoji]')] : [];
    const stickerButtons = stickerPicker ? [...stickerPicker.querySelectorAll('button[data-sticker]')] : [];
    if (typingStatus) typingStatus.textContent = '';
    if (memberToggle && memberPopover) {
        memberToggle.addEventListener('click', () => {
            memberPopover.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (memberPopover.contains(target) || memberToggle.contains(target)) return;
            memberPopover.classList.remove('open');
        }, {capture: true});
    }
    const renderPinPopover = () => {
        if (!pinList || !messages) return;
        const ids = [...pinnedMessageIDs];
        if (ids.length === 0) {
            pinList.innerHTML = '<div class="member-empty muted">No pinned messages.</div>';
            return;
        }
        pinList.innerHTML = ids.map((id) => {
            const source = knownMessages.get(id);
            const preview = source ? `${source.display_name}: ${String(source.preview || '').slice(0, 72)}` : `Pinned ${id.slice(0, 8)}`;
            return `<button class="tiny-action pin-jump-btn" type="button" data-pin-jump="${esc(id)}">${esc(preview)}</button>`;
        }).join('');
        pinList.querySelectorAll('button[data-pin-jump]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-pin-jump') || '';
                const row = messages.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
                if (row) {
                    row.scrollIntoView({block: 'center', behavior: 'smooth'});
                    row.classList.add('line-enter');
                }
                if (pinPopover) pinPopover.classList.remove('open');
            });
        });
    };
    if (pinToggle && pinPopover) {
        pinToggle.addEventListener('click', () => {
            renderPinPopover();
            pinPopover.classList.toggle('open');
        });
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Node)) return;
            if (pinPopover.contains(target) || pinToggle.contains(target)) return;
            pinPopover.classList.remove('open');
        }, {capture: true});
    }

    const updateReplyPreview = () => {
        if (!replyPreview) return;
        if (!replyToMessageID) {
            replyPreview.style.display = 'none';
            replyPreview.textContent = '';
            return;
        }
        const source = getMessageByID(replyToMessageID);
        const label = source ? `Replying to ${source.display_name}: ${String(source.preview || '').slice(0, 80)}` : 'Replying to earlier message';
        replyPreview.style.display = 'block';
        replyPreview.textContent = label;
    };
    const applyChatSearch = () => chatApplySearch(messages, searchInput && searchInput.value);
    const renderPinnedBar = () => {
        chatRenderPinnedBar(pinnedBar, messages);
        renderPinPopover();
    };
    const updateJumpLatestVisibility = () => {
        if (!messages || !jumpLatestBtn) return;
        const distanceFromBottom = messages.scrollHeight - messages.clientHeight - messages.scrollTop;
        jumpLatestBtn.classList.toggle('show', distanceFromBottom > 110);
    };

    const closeEmojiPicker = () => {
        if (!emojiPicker || !emojiToggle) return;
        emojiPicker.classList.remove('open');
        emojiToggle.setAttribute('aria-expanded', 'false');
    };
    const closeStickerPicker = () => {
        if (!stickerPicker || !stickerToggle) return;
        stickerPicker.classList.remove('open');
        stickerToggle.setAttribute('aria-expanded', 'false');
    };
    if (searchInput) searchInput.addEventListener('input', applyChatSearch);
    bindSearchPopover(searchWrap, searchInput, searchToggle);
    if (jumpLatestBtn) jumpLatestBtn.onclick = () => {
        scrollChatToBottom();
        updateJumpLatestVisibility();
    };
    if (roomTopicQuickEdit) {
        roomTopicQuickEdit.onclick = async () => {
            await editChannelTopicByID(activeRoomID, roomStatusText, null);
        };
    }
    const toggleEmojiPicker = () => {
        if (!emojiPicker || !emojiToggle) return;
        closeStickerPicker();
        const open = !emojiPicker.classList.contains('open');
        emojiPicker.classList.toggle('open', open);
        emojiToggle.setAttribute('aria-expanded', String(open));
    };
    const toggleStickerPicker = () => {
        if (!stickerPicker || !stickerToggle) return;
        closeEmojiPicker();
        const open = !stickerPicker.classList.contains('open');
        stickerPicker.classList.toggle('open', open);
        stickerToggle.setAttribute('aria-expanded', String(open));
    };
    const insertEmoji = (emoji) => {
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
        const cursor = start + emoji.length;
        input.setSelectionRange(cursor, cursor);
        input.focus();
    };
    const convertInputEmoticons = () => {
        const before = input.value;
        const after = convertEmoticons(before);
        if (after === before) return;
        const diff = before.length - after.length;
        const start = input.selectionStart ?? after.length;
        const end = input.selectionEnd ?? after.length;
        input.value = after;
        input.setSelectionRange(Math.max(0, start - diff), Math.max(0, end - diff));
    };
    const clearAttachment = () => {
        pendingAttachment = null;
        if (preview) {
            preview.classList.remove('ready');
            preview.innerHTML = '';
        }
    };
    const closeMentionPicker = () => {
        mentionOpen = false;
        mentionQuery = '';
        mentionStart = -1;
        mentionCandidates = [];
        mentionIndex = 0;
        if (mentionPicker) {
            mentionPicker.classList.remove('open');
            mentionPicker.innerHTML = '';
        }
    };
    const emitTyping = (typing) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({type: 'typing', typing: !!typing}));
    };
    const applyMention = (name) => {
        if (mentionStart < 0) return;
        const start = mentionStart;
        const end = input.selectionStart ?? input.value.length;
        input.value = input.value.slice(0, start) + `@${name} ` + input.value.slice(end);
        const cursor = start + name.length + 2;
        input.setSelectionRange(cursor, cursor);
        input.focus();
        closeMentionPicker();
    };
    const renderMentionPicker = () => {
        if (!mentionPicker) return;
        mentionCandidates = getMentionCandidates(mentionQuery);
        if (mentionCandidates.length === 0) {
            closeMentionPicker();
            return;
        }
        mentionOpen = true;
        mentionIndex = Math.max(0, Math.min(mentionIndex, mentionCandidates.length - 1));
        mentionPicker.classList.add('open');
        mentionPicker.innerHTML = mentionCandidates.map((name, idx) => `<button type="button" class="mention-choice${idx === mentionIndex ? ' active' : ''}" data-mention-name="${esc(name)}">@${esc(name)}</button>`).join('');
        mentionPicker.querySelectorAll('button[data-mention-name]').forEach((btn) => {
            btn.addEventListener('click', () => {
                applyMention(btn.getAttribute('data-mention-name') || '');
            });
        });
    };
    const refreshMentionPicker = () => {
        const cursor = input.selectionStart ?? input.value.length;
        const before = input.value.slice(0, cursor);
        const at = before.lastIndexOf('@');
        if (at < 0) {
            closeMentionPicker();
            return;
        }
        const prefix = before.slice(at + 1);
        if (/\s/.test(prefix) || prefix.length > 48 || /[^a-z0-9._-]/i.test(prefix)) {
            closeMentionPicker();
            return;
        }
        mentionStart = at;
        mentionQuery = prefix;
        mentionIndex = 0;
        renderMentionPicker();
    };
    const showAttachment = () => {
        if (!preview || !pendingAttachment) return;
        preview.classList.add('ready');
        const previewMedia = pendingAttachment.kind === 'image' ? `<img src="${esc(pendingAttachment.url)}" alt="${esc(pendingAttachment.name)}"/>` : `<div class="attachment-file-icon" aria-hidden="true">FILE</div>`;
        preview.innerHTML = `${previewMedia}<div><strong>${esc(pendingAttachment.name)}</strong><small>${esc(pendingAttachment.mime)} · ${esc(formatBytes(pendingAttachment.size))}</small></div><button id="clearAttachment" class="secondary" type="button">Remove</button>`;
        const clearBtn = $('clearAttachment');
        if (clearBtn) clearBtn.onclick = clearAttachment;
    };
    const bindImageDropTarget = (targetEl, {focusAfterDrop = false} = {}) => {
        if (!targetEl) return;
        targetEl.addEventListener('dragover', (e) => {
            if ([...(e.dataTransfer?.items || [])].some((it) => it.kind === 'file' && IMAGE_TYPES.has(it.type))) {
                e.preventDefault();
                input.classList.add('drop-ready');
            }
        });
        targetEl.addEventListener('dragleave', () => input.classList.remove('drop-ready'));
        targetEl.addEventListener('drop', (e) => {
            input.classList.remove('drop-ready');
            const file = [...(e.dataTransfer?.files || [])].find((f) => IMAGE_TYPES.has(f.type));
            if (!file) return;
            e.preventDefault();
            attachFile(file).catch(() => alert('Image drop failed.'));
            if (focusAfterDrop) input.focus();
        });
    };
    const attachFile = async (file) => {
        if (!file) return;
        const mime = normalizeMime(file.type) || 'application/octet-stream';
        if (IMAGE_TYPES.has(mime) && file.size > IMAGE_MAX_BYTES) {
            alert(`Image is too large. Limit is ${formatBytes(IMAGE_MAX_BYTES)} (GIF supported).`);
            return;
        }
        if (file.size > ATTACHMENT_MAX_BYTES) {
            alert(`Attachment is too large. Limit is ${formatBytes(ATTACHMENT_MAX_BYTES)}.`);
            return;
        }
        const dataURL = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error || new Error('read failed'));
            reader.readAsDataURL(file);
        });
        const marker = `data:${mime};base64,`;
        if (!dataURL.startsWith(marker)) {
            alert('Attachment could not be prepared safely.');
            return;
        }
        pendingAttachment = {
            kind: IMAGE_TYPES.has(mime) ? 'image' : 'file',
            name: file.name || 'attachment.bin',
            mime,
            size: file.size,
            data: dataURL.slice(marker.length),
            url: dataURL
        };
        showAttachment();
    };

    if (attachToggle && attachFileInput) {
        attachToggle.onclick = () => attachFileInput.click();
        attachFileInput.addEventListener('change', () => {
            const file = attachFileInput.files && attachFileInput.files[0];
            if (!file) return;
            attachFile(file).catch(() => alert('Attachment failed.'));
            attachFileInput.value = '';
            input.focus();
        });
    }

    if (emojiToggle && emojiPicker) {
        emojiToggle.onclick = () => {
            toggleEmojiPicker();
            input.focus();
        };
        emojiButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                insertEmoji(btn.dataset.emoji || '');
                closeEmojiPicker();
            });
            btn.addEventListener('keydown', (e) => {
                const idx = emojiButtons.indexOf(btn);
                const cols = 8;
                let next = -1;
                if (e.key === 'ArrowRight') next = idx + 1;
                if (e.key === 'ArrowLeft') next = idx - 1;
                if (e.key === 'ArrowDown') next = idx + cols;
                if (e.key === 'ArrowUp') next = idx - cols;
                if (e.key === 'Home') next = 0;
                if (e.key === 'End') next = emojiButtons.length - 1;
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeEmojiPicker();
                    input.focus();
                    return;
                }
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    insertEmoji(btn.dataset.emoji || '');
                    closeEmojiPicker();
                    return;
                }
                if (next >= 0 && next < emojiButtons.length) {
                    e.preventDefault();
                    emojiButtons[next].focus();
                }
            });
        });
    }
    if (stickerToggle && stickerPicker) {
        stickerToggle.onclick = () => {
            toggleStickerPicker();
            input.focus();
        };
        stickerButtons.forEach((btn) => {
            btn.addEventListener('click', () => {
                insertEmoji(btn.dataset.sticker || '');
                closeStickerPicker();
            });
        });
    }
    if (!emojiOutsideHandlerBound) {
        emojiOutsideHandlerBound = true;
        document.addEventListener('click', (e) => {
            if (activeEmojiPicker && activeEmojiToggle) {
                const emojiToggleClicked = e.target === activeEmojiToggle || (e.target instanceof Element && activeEmojiToggle.contains(e.target));
                if (!activeEmojiPicker.contains(e.target) && !emojiToggleClicked) {
                    activeEmojiPicker.classList.remove('open');
                    activeEmojiToggle.setAttribute('aria-expanded', 'false');
                }
            }
            if (activeStickerPicker && activeStickerToggle) {
                const stickerToggleClicked = e.target === activeStickerToggle || (e.target instanceof Element && activeStickerToggle.contains(e.target));
                if (!activeStickerPicker.contains(e.target) && !stickerToggleClicked) {
                    activeStickerPicker.classList.remove('open');
                    activeStickerToggle.setAttribute('aria-expanded', 'false');
                }
            }
        }, {capture: true});
    }
    if (preview && pendingAttachment) showAttachment();
    if (input) input.addEventListener('input', refreshMentionPicker);
    if (input) {
        input.addEventListener('input', () => {
            clearTimeout(typingTimer);
            emitTyping(true);
            typingTimer = setTimeout(() => emitTyping(false), 1400);
        });
    }

    input.addEventListener('paste', (e) => {
        const item = [...(e.clipboardData?.items || [])].find((it) => it.kind === 'file' && IMAGE_TYPES.has(it.type));
        if (!item) return;
        const file = item.getAsFile();
        if (!file) return;
        e.preventDefault();
        attachFile(file).catch(() => alert('Image paste failed.'));
    });
    bindImageDropTarget(input);
    if (composer) {
        bindImageDropTarget(composer);
    }
    if (messages) {
        messages.addEventListener('scroll', () => {
            updateJumpLatestVisibility();
            if (messages.scrollTop > 20 || historyLoadingMore || !hasMoreHistory) return;
            historyLoadingMore = true;
            loadHistory({appendOlder: true});
        }, {passive: true});
        messages.addEventListener('click', async (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const emptyAction = target.closest('button[data-empty-channel-action]');
            if (emptyAction) {
                const action = emptyAction.getAttribute('data-empty-channel-action') || '';
                if (action === 'rename') await renameChannelByID(activeRoomID, roomName, null);
                if (action === 'topic') await editChannelTopicByID(activeRoomID, roomStatusText, null);
                return;
            }
            const replyBtn = target.closest('button[data-reply-msg]');
            if (replyBtn) {
                setReplyTarget(replyBtn.getAttribute('data-reply-msg') || '');
                updateReplyPreview();
                input.focus();
                return;
            }
            const editBtn = target.closest('button[data-edit-msg]');
            if (editBtn) {
                const id = editBtn.getAttribute('data-edit-msg') || '';
                const source = getMessageByID(id);
                if (!source) return;
                const next = prompt('Edit message:', String(source.preview || ''));
                if (next === null) return;
                if (!next.trim()) return;
                const enc = await encryptText(roomKeyHex, JSON.stringify({v: 1, type: 'text', text: next.trim()}));
                await api(withRoomQuery('/api/messages/edit'), {
                    method: 'POST',
                    body: JSON.stringify({message_id: id, ciphertext: enc.ciphertext, nonce: enc.nonce})
                });
                return;
            }
            const delBtn = target.closest('button[data-delete-msg]');
            if (delBtn) {
                const id = delBtn.getAttribute('data-delete-msg') || '';
                if (!confirm('Delete this message?')) return;
                await api(withRoomQuery('/api/messages/delete'), {method: 'POST', body: JSON.stringify({message_id: id})});
                return;
            }
            if (await chatHandleExtendedMessageAction(target, {onPinsChanged: renderPinnedBar})) {
                return;
            }
        });
        bindImageDropTarget(messages, {focusAfterDrop: true});
    }

    sendBtn.onclick = async () => {
        unlockAudio();
        convertInputEmoticons();
        const text = input.value.trim();
        if (!text && !pendingAttachment) return;
        if (!roomKeyHex) {
            alert('No room key loaded. Import room.keys first.');
            return;
        }
        try {
            const clientMsgID = crypto.randomUUID();
            const payload = pendingAttachment ? JSON.stringify({
                v: 1,
                type: pendingAttachment.kind,
                mime: pendingAttachment.mime,
                name: pendingAttachment.name,
                size: pendingAttachment.size,
                data: pendingAttachment.data,
                caption: text,
                reply_to_id: replyToMessageID || ''
            }) : JSON.stringify({v: 1, type: 'text', text, reply_to_id: replyToMessageID || ''});
            const enc = await encryptText(roomKeyHex, payload);
            const conn = await ensureSocket();
            if (!conn || conn.readyState !== WebSocket.OPEN) {
                alert('Connection lost. Reconnecting...');
                scheduleSocketReconnect();
                return;
            }
            pendingOutgoing.set(clientMsgID, Date.now());
            conn.send(JSON.stringify({
                type: 'message',
                client_msg_id: clientMsgID,
                ciphertext: enc.ciphertext,
                nonce: enc.nonce,
                reply_to_id: replyToMessageID || ''
            }));
            input.value = '';
            clearAttachment();
            clearReplyTarget();
            updateReplyPreview();
            closeMentionPicker();
            emitTyping(false);
            input.focus();
        } catch {
            alert('Message could not be sent.');
        }
    };
    input.addEventListener('keydown', (e) => {
        unlockAudio();
        if (mentionOpen) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                mentionIndex = (mentionIndex + 1) % mentionCandidates.length;
                renderMentionPicker();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                mentionIndex = (mentionIndex - 1 + mentionCandidates.length) % mentionCandidates.length;
                renderMentionPicker();
                return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                applyMention(mentionCandidates[mentionIndex] || '');
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                closeMentionPicker();
                return;
            }
        }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
            e.preventDefault();
            toggleEmojiPicker();
            return;
        }
        if (e.key === 'ArrowDown' && emojiPicker && emojiPicker.classList.contains('open') && emojiButtons[0]) {
            e.preventDefault();
            emojiButtons[0].focus();
            return;
        }
        if (e.key === 'ArrowDown' && stickerPicker && stickerPicker.classList.contains('open') && stickerButtons[0]) {
            e.preventDefault();
            stickerButtons[0].focus();
            return;
        }
        if (e.key === 'Escape') {
            closeEmojiPicker();
            closeStickerPicker();
            closeMentionPicker();
            if (replyToMessageID) {
                clearReplyTarget();
                updateReplyPreview();
            }
        }
        if (e.key === ' ') {
            setTimeout(convertInputEmoticons, 0);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            sendBtn.click();
        }
    });
    document.addEventListener('click', (e) => {
        if (!mentionPicker || !input) return;
        if (e.target === input || mentionPicker.contains(e.target)) return;
        closeMentionPicker();
    }, {capture: true});
    updateReplyPreview();
    renderPinnedBar();
    updateJumpLatestVisibility();
    refreshMembers();
}

async function switchActiveRoom(nextRoomID) {
    const roomID = String(nextRoomID || 'main').trim() || 'main';
    if (roomID === String(activeRoomID || '')) return;
    activeRoomID = roomID;
    try {
        localStorage.setItem('veil.activeRoomID', activeRoomID);
    } catch {
    }
    if (ws) {
        try {
            ws.close();
        } catch {
        }
    }
    await refreshRoomName();
    await refreshMembers();
    if (currentView === VIEW_CHAT) {
        await loadHistory();
        ensureSocket();
    }
}

function bindUserMenuActions() {
    const menuToggle = document.querySelector('[data-user-menu-toggle]');
    const menu = document.querySelector('[data-user-menu-panel]');
    if (!menuToggle || !menu) return;
    const closeMenu = () => {
        menu.classList.remove('open');
        menuToggle.setAttribute('aria-expanded', 'false');
    };
    if (!window.__veilUserMenuGlobalBound) {
        window.__veilUserMenuGlobalBound = true;
        document.addEventListener('click', async (e) => {
            const rawTarget = e.target;
            const target = rawTarget instanceof Element ? rawTarget : (rawTarget && rawTarget.parentElement ? rawTarget.parentElement : null);
            if (!target) return;
            const activeToggle = document.querySelector('[data-user-menu-toggle]');
            const activeMenu = document.querySelector('[data-user-menu-panel]');
            if (!activeToggle || !activeMenu) return;
            const toggle = target.closest('[data-user-menu-toggle]');
            if (toggle) {
                e.preventDefault();
                const open = !activeMenu.classList.contains('open');
                activeMenu.classList.toggle('open', open);
                activeToggle.setAttribute('aria-expanded', String(open));
                return;
            }
            const menuBtn = target.closest('button[data-user-view]');
            if (menuBtn && activeMenu.contains(menuBtn)) {
                e.preventDefault();
                const next = String(menuBtn.getAttribute('data-user-view') || VIEW_CHAT);
                if (next !== currentView) {
                    currentView = next;
                    await renderMain();
                } else {
                    activeMenu.classList.remove('open');
                    activeToggle.setAttribute('aria-expanded', 'false');
                }
                return;
            }
            if (!activeMenu.contains(target)) {
                activeMenu.classList.remove('open');
                activeToggle.setAttribute('aria-expanded', 'false');
            }
        }, {capture: true});
    } else {
        closeMenu();
    }
    menu.querySelectorAll('button[data-user-view]').forEach((btn) => {
        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = String(btn.getAttribute('data-user-view') || VIEW_CHAT);
            if (next !== currentView) {
                currentView = next;
                await renderMain();
                return;
            }
            closeMenu();
        };
    });
}

function bindSidebarChannelActions() {
    const nav = document.querySelector('.channels-nav');
    if (!nav || nav.dataset.bound === '1') return;
    nav.dataset.bound = '1';
    nav.addEventListener('click', async (ev) => {
        const target = ev.target;
        if (!(target instanceof Element)) return;
        const status = $('sidebarCreateRoomStatus');
        const deleteBtn = target.closest('button[data-delete-room-id]');
        if (deleteBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            await deleteChannelByID(deleteBtn.getAttribute('data-delete-room-id'), deleteBtn.getAttribute('data-delete-room-name'), status);
            return;
        }
        const renameBtn = target.closest('button[data-rename-room-id]');
        if (renameBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            await renameChannelByID(renameBtn.getAttribute('data-rename-room-id'), renameBtn.getAttribute('data-rename-room-name'), status);
            return;
        }
        const topicBtn = target.closest('button[data-topic-room-id]');
        if (topicBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            await editChannelTopicByID(topicBtn.getAttribute('data-topic-room-id'), topicBtn.getAttribute('data-topic-room-text'), status);
            return;
        }
        const pinBtn = target.closest('button[data-pin-room-id]');
        if (pinBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            await setChannelPinned(pinBtn.getAttribute('data-pin-room-id'), pinBtn.getAttribute('data-pin-room-next') === '1', status);
            return;
        }
        const moveBtn = target.closest('button[data-move-room-id]');
        if (moveBtn) {
            ev.preventDefault();
            ev.stopPropagation();
            await moveChannelByID(moveBtn.getAttribute('data-move-room-id'), moveBtn.getAttribute('data-move-room-direction'), status);
            return;
        }
        const roomBtn = target.closest('button[data-sidebar-room-id]');
        if (roomBtn) {
            jumpToUnreadAfterSwitch = Number(roomBtn.getAttribute('data-sidebar-unread') || 0) > 0;
            await switchActiveRoom(roomBtn.getAttribute('data-sidebar-room-id') || 'main');
            if (window.matchMedia && window.matchMedia(MOBILE_SIDEBAR_QUERY).matches) {
                sidebarOpen = false;
                persistSidebarOpenState();
                syncSidebarLayoutState();
            }
            if (currentView !== VIEW_CHAT) {
                currentView = VIEW_CHAT;
            }
            await renderMain();
        }
    });
}

async function editChannelTopicByID(roomID, currentTopic, statusEl) {
    const id = String(roomID || '').trim();
    if (!id) return false;
    const nextTopic = prompt('Channel topic', String(currentTopic || roomStatusText || '').trim());
    if (nextTopic === null) return false;
    const topic = String(nextTopic || '').trim();
    const r = await api(`/api/admin/room-status-text?room_id=${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({room_status_text: topic})
    });
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not update topic.', 'err');
        return false;
    }
    if (String(activeRoomID || '') === id) {
        setRoomStatusText(String((r.data && r.data.room_status_text) || topic || DEFAULT_ROOM_STATUS_TEXT));
    }
    await refreshRooms();
    refreshSidebarChannelsInPlace();
    setStatus(statusEl, 'Channel topic updated.', 'ok');
    return true;
}

async function setChannelPinned(roomID, pinned, statusEl) {
    const id = String(roomID || '').trim();
    if (!id) return false;
    const r = await api('/api/admin/room-pin', {
        method: 'POST',
        body: JSON.stringify({room_id: id, pinned: !!pinned})
    });
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not update channel pin.', 'err');
        return false;
    }
    await refreshRooms();
    refreshSidebarChannelsInPlace();
    setStatus(statusEl, pinned ? 'Channel pinned.' : 'Channel unpinned.', 'ok');
    return true;
}

async function moveChannelByID(roomID, direction, statusEl) {
    const id = String(roomID || '').trim();
    const dir = direction === 'down' ? 'down' : 'up';
    if (!id) return false;
    const r = await api('/api/admin/room-move', {
        method: 'POST',
        body: JSON.stringify({room_id: id, direction: dir})
    });
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not move channel.', 'err');
        return false;
    }
    await refreshRooms();
    refreshSidebarChannelsInPlace();
    setStatus(statusEl, `Channel moved ${dir}.`, 'ok');
    return true;
}

async function createChannelFromName(roomName, statusEl, inputEl) {
    const displayName = String(roomName || '').trim();
    if (!displayName) {
        setStatus(statusEl, 'Name required.', 'err');
        return false;
    }
    const r = await api('/api/rooms', {
        method: 'POST',
        body: JSON.stringify({room_name: displayName, status_text: DEFAULT_ROOM_STATUS_TEXT})
    });
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not create channel.', 'err');
        return false;
    }
    const room = r.data && r.data.room ? r.data.room : {};
    await refreshRooms();
    refreshSidebarChannelsInPlace();
    setStatus(statusEl, `Created #${room.name || displayName}.`, 'ok');
    if (inputEl) inputEl.value = '';
    return true;
}

async function deleteChannelByID(roomID, roomDisplayName, statusEl) {
    const id = String(roomID || '').trim();
    if (!id || id === 'main') return false;
    const label = String(roomDisplayName || id).trim();
    if (!confirm(`Delete #${label}? Messages, pins, invites, and media for this channel will be removed.`)) return false;
    const wasActive = String(activeRoomID || '') === id;
    const r = await api(`/api/rooms/${encodeURIComponent(id)}`, {method: 'DELETE'});
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not delete channel.', 'err');
        return false;
    }
    await refreshRooms();
    if (wasActive) {
        if (String(activeRoomID || '') === id) activeRoomID = String((availableRooms[0] && availableRooms[0].id) || 'main');
        try {
            localStorage.setItem('veil.activeRoomID', activeRoomID);
        } catch {
        }
        await refreshRoomName();
        if (ws) {
            try {
                ws.close();
            } catch {
            }
        }
    }
    refreshSidebarChannelsInPlace();
    setStatus(statusEl, `Deleted #${label}.`, 'ok');
    if (wasActive && currentView === VIEW_CHAT) await renderMain();
    return true;
}

async function renameChannelByID(roomID, currentName, statusEl) {
    const id = String(roomID || '').trim();
    if (!id) return false;
    const before = String(currentName || '').trim();
    const nextName = prompt('Rename channel', before);
    if (nextName === null) return false;
    const displayName = String(nextName || '').trim();
    if (!displayName) {
        setStatus(statusEl, 'Name required.', 'err');
        return false;
    }
    const r = await api(`/api/admin/room-name?room_id=${encodeURIComponent(id)}`, {
        method: 'POST',
        body: JSON.stringify({room_name: displayName})
    });
    if (!r.ok) {
        setStatus(statusEl, r.data.error || 'Could not rename channel.', 'err');
        return false;
    }
    await refreshRooms();
    if (String(activeRoomID || '') === id) {
        roomName = String((r.data && r.data.room_name) || displayName).trim();
    }
    refreshSidebarChannelsInPlace();
    const title = document.querySelector('.room-title strong');
    if (title && String(activeRoomID || '') === id) title.textContent = roomName || displayName;
    setStatus(statusEl, `Renamed #${before || id} to #${displayName}.`, 'ok');
    return true;
}

function bindChannelManageActions() {
    if (!isAdminRole(myRole)) return;
    const toggle = document.querySelector('[data-channel-create-toggle]');
    const panel = document.querySelector('[data-channel-create-panel]');
    const input = $('sidebarRoomNameInput');
    const createBtn = $('sidebarCreateRoomBtn');
    const status = $('sidebarCreateRoomStatus');
    if (toggle && panel) {
        toggle.addEventListener('click', () => {
            const open = panel.hidden;
            panel.hidden = !open;
            toggle.classList.toggle('active', open);
            if (open && input) input.focus();
        });
    }
    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            await createChannelFromName(input && input.value, status, input);
        });
    }
    if (input) {
        input.addEventListener('keydown', async (ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            await createChannelFromName(input.value, status, input);
        });
    }
}

function persistSidebarOpenState() {
    try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, sidebarOpen ? '1' : '0');
    } catch {
    }
}

function syncSidebarLayoutState() {
    const shell = document.querySelector('.chat-shell');
    if (!shell) return;
    shell.classList.toggle('sidebar-open', sidebarOpen);
    shell.classList.toggle('sidebar-collapsed', !sidebarOpen);
    const toggle = document.querySelector('[data-sidebar-toggle]');
    if (toggle) toggle.setAttribute('aria-expanded', sidebarOpen ? 'true' : 'false');
}

function bindSidebarToggleActions() {
    const shell = document.querySelector('.chat-shell');
    if (!shell) return;
    const toggle = shell.querySelector('[data-sidebar-toggle]');
    const backdrop = shell.querySelector('[data-sidebar-backdrop]');
    const closeSidebar = () => {
        if (!sidebarOpen) return;
        sidebarOpen = false;
        persistSidebarOpenState();
        syncSidebarLayoutState();
    };
    if (toggle) {
        toggle.addEventListener('click', (e) => {
            e.preventDefault();
            sidebarOpen = !sidebarOpen;
            persistSidebarOpenState();
            syncSidebarLayoutState();
        });
    }
    if (backdrop) {
        backdrop.addEventListener('click', (e) => {
            e.preventDefault();
            closeSidebar();
        });
    }
    if (!window.__veilSidebarGlobalBound) {
        window.__veilSidebarGlobalBound = true;
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            closeSidebar();
        });
    }
    syncSidebarLayoutState();
}

function refreshSidebarChannelsInPlace() {
    const nav = document.querySelector('.channels-nav');
    if (!nav) return;
    const rooms = (availableRooms.length ? availableRooms : [{id: activeRoomID || 'main', name: roomName || 'Room Chat'}]);
    nav.innerHTML = rooms.map((room) => roomNavButtonHTML(room)).join('');
    bindSidebarChannelActions();
    bindChannelManageActions();
}

async function pollRoomsForUnread() {
    const shell = document.querySelector('.chat-shell');
    if (!shell) return;
    const before = JSON.stringify((availableRooms || []).map((room) => [String(room.id || ''), Number(room.unread_count || 0), String(room.name || ''), String(room.status_text || ''), !!room.pinned, Number(room.sort_order || 0)]));
    await refreshRooms();
    const after = JSON.stringify((availableRooms || []).map((room) => [String(room.id || ''), Number(room.unread_count || 0), String(room.name || ''), String(room.status_text || ''), !!room.pinned, Number(room.sort_order || 0)]));
    if (before !== after) refreshSidebarChannelsInPlace();
}

function bindKeyActions() {
    const genPass = $('genPass');
    if (genPass) genPass.onclick = () => {
        $('passphrase').value = generatePassphrase();
    };

    const exportBtn = $('export');
    if (exportBtn) {
        exportBtn.onclick = async () => {
            const out = $('importOut');
            let pass = $('passphrase').value.trim();
            if (!pass) {
                pass = generatePassphrase();
                $('passphrase').value = pass;
            }
            setStatus(out, 'Preparing encrypted key export...');
            exportBtn.disabled = true;
            try {
                await exportKeys(pass);
                setStatus(out, `Exported encrypted keys. Save this passphrase: ${pass}`, 'ok');
            } catch (e) {
                setStatus(out, e.message || 'Export failed', 'err');
            } finally {
                exportBtn.disabled = false;
            }
        };
    }

    const importBtn = $('importBtn');
    if (importBtn) {
        importBtn.onclick = async () => {
            const fileEl = $('importFile');
            const out = $('importOut');
            const file = fileEl.files && fileEl.files[0];
            if (!file) {
                setStatus(out, 'Select a room.keys file first.', 'err');
                return;
            }
            const pass = $('passphrase').value.trim();
            if (!pass) {
                setStatus(out, 'Enter restore passphrase first.', 'err');
                return;
            }
            try {
                const raw = await file.text();
                const cfg = JSON.parse(raw);
                if (!cfg || cfg.format !== 'veil.keys.v3' || !cfg.credential_id || !cfg.wrap) {
                    setStatus(out, 'Invalid or legacy key file format.', 'err');
                    return;
                }
                const rk = await unwrapRoomKeyWithPassphrase(cfg, pass);
                roomKeyHex = rk;
                currentCredentialId = cfg.credential_id || '';
                currentDisplayName = cfg.display_name || '';
                persistIdentity();
                const r = await api('/api/session/from-credential', {
                    method: 'POST',
                    body: JSON.stringify({credential_id: currentCredentialId})
                });
                if (!r.ok) {
                    setStatus(out, r.data.error || 'Import worked, but login failed.', 'err');
                    return;
                }
                setStatus(out, 'Keys imported and session restored.', 'ok');
                window.location.reload();
            } catch {
                setStatus(out, 'Could not import keys (wrong passphrase or invalid file).', 'err');
            }
        };
    }

    const makeDeviceSyncBtn = $('makeDeviceSync');
    const copyDeviceSyncBtn = $('copyDeviceSync');
    if (makeDeviceSyncBtn) {
        makeDeviceSyncBtn.onclick = async () => {
            const out = $('deviceSyncStatus');
            const pass = $('deviceSyncPassphrase').value.trim();
            const codeEl = $('deviceSyncCode');
            if (!pass) {
                setStatus(out, 'Enter a sync passphrase first.', 'err');
                return;
            }
            try {
                const code = await createDeviceSyncCode(pass);
                codeEl.value = code;
                setStatus(out, 'Device sync code generated.', 'ok');
            } catch (e) {
                setStatus(out, e.message || 'Failed to generate sync code.', 'err');
            }
        };
    }
    if (copyDeviceSyncBtn) {
        copyDeviceSyncBtn.onclick = async () => {
            const out = $('deviceSyncStatus');
            const codeEl = $('deviceSyncCode');
            const code = String(codeEl.value || '').trim();
            if (!code) {
                setStatus(out, 'Generate a sync code first.', 'err');
                return;
            }
            try {
                await navigator.clipboard.writeText(code);
                setStatus(out, 'Sync code copied.', 'ok');
            } catch {
                codeEl.focus();
                codeEl.select();
                setStatus(out, 'Copy failed. Code selected for manual copy.', 'err');
            }
        };
    }
}

function bindThemeActions() {
    const status = $('themeStatus');
    const inputs = [...document.querySelectorAll('input[data-theme-key]')];
    const avatarToggle = $('themeAvatarToggle');
    const avatarRingToggle = $('themeAvatarRingToggle');
    const timestampToggle = $('themeTimestampToggle');
    const copyThemeBtn = $('copyTheme');
    const importThemeBtn = $('importTheme');
    const resetDisplayBtn = $('resetDisplayPrefs');
    const readThemeFromInputs = () => {
        const theme = {};
        for (const input of inputs) theme[input.dataset.themeKey] = input.value;
        return normalizeTheme(theme);
    };
    const fillInputs = (theme) => {
        const t = normalizeTheme(theme);
        for (const input of inputs) input.value = t[input.dataset.themeKey];
    };

    inputs.forEach((input) => {
        input.addEventListener('input', () => {
            saveTheme(readThemeFromInputs());
            setStatus(status, 'Theme saved.', 'ok');
        });
    });

    document.querySelectorAll('button[data-theme-preset]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const preset = THEME_PRESETS[btn.dataset.themePreset] || DEFAULT_THEME;
            fillInputs(preset);
            saveTheme(preset);
            setStatus(status, 'Theme preset saved.', 'ok');
        });
    });

    if (copyThemeBtn) {
        copyThemeBtn.onclick = async () => {
            const raw = JSON.stringify(currentTheme(), null, 2);
            try {
                await navigator.clipboard.writeText(raw);
                setStatus(status, 'Theme copied.', 'ok');
            } catch {
                setStatus(status, 'Clipboard blocked. Export from local storage instead.', 'err');
            }
        };
    }
    if (importThemeBtn) {
        importThemeBtn.onclick = () => {
            const raw = prompt('Paste theme JSON');
            if (raw === null) return;
            try {
                const nextTheme = normalizeTheme(JSON.parse(raw));
                fillInputs(nextTheme);
                saveTheme(nextTheme);
                setStatus(status, 'Theme imported.', 'ok');
            } catch {
                setStatus(status, 'Theme JSON was not valid.', 'err');
            }
        };
    }
    const resetBtn = $('resetTheme');
    if (resetBtn) {
        resetBtn.onclick = () => {
            resetTheme();
            fillInputs(DEFAULT_THEME);
            setStatus(status, 'Theme reset.', 'ok');
        };
    }
    if (resetDisplayBtn) {
        resetDisplayBtn.onclick = async () => {
            setShowAvatars(true);
            setShowAvatarRings(true);
            setTimestampMode('always');
            if (avatarToggle) avatarToggle.checked = showAvatars;
            if (avatarRingToggle) avatarRingToggle.checked = showAvatarRings;
            if (timestampToggle) timestampToggle.checked = timestampMode === 'hover';
            renderMembersList();
            if (currentView === VIEW_CHAT) await loadHistory();
            setStatus(status, 'Display preferences reset.', 'ok');
        };
    }
    if (avatarToggle) {
        avatarToggle.checked = showAvatars;
        avatarToggle.onchange = () => {
            setShowAvatars(avatarToggle.checked);
            avatarToggle.checked = showAvatars;
            setStatus(status, `Avatars ${showAvatars ? 'enabled' : 'hidden'} for this browser.`, 'ok');
        };
    }
    if (avatarRingToggle) {
        avatarRingToggle.checked = showAvatarRings;
        avatarRingToggle.onchange = async () => {
            setShowAvatarRings(avatarRingToggle.checked);
            avatarRingToggle.checked = showAvatarRings;
            renderMembersList();
            if (currentView === VIEW_CHAT) await loadHistory();
            setStatus(status, `Avatar rings ${showAvatarRings ? 'enabled' : 'hidden'} for this browser.`, 'ok');
        };
    }
    if (timestampToggle) {
        timestampToggle.checked = timestampMode === 'hover';
        timestampToggle.onchange = () => {
            setTimestampMode(timestampToggle.checked ? 'hover' : 'always');
            timestampToggle.checked = timestampMode === 'hover';
            setStatus(status, `Timestamps set to ${timestampMode === 'hover' ? 'on hover' : 'always visible'}.`, 'ok');
        };
    }
}

function bindProfileActions() {
    const status = $('profileStatus');
    const displayNameInput = $('profile-display-name');
    const displayNameSaveBtn = $('profileDisplayNameSave');
    const statusTextInput = $('profile-status-text');
    const statusTextSaveBtn = $('profileStatusTextSave');
    const statusTextClearBtn = $('profileStatusTextClear');
    const avatarFileInput = $('profile-avatar-file');
    const avatarClearBtn = $('profileAvatarClear');
    const avatarCropper = $('avatarCropper');
    const avatarCropCanvas = $('avatarCropCanvas');
    const avatarCropZoom = $('avatarCropZoom');
    const avatarCropZoomLabel = $('avatarCropZoomLabel');
    const avatarCropSaveBtn = $('avatarCropSave');
    const avatarCropCancelBtn = $('avatarCropCancel');
    const avatarRingColorInput = $('profile-avatar-ring-color');
    const avatarRingColor2Input = $('profile-avatar-ring-color2');
    const avatarRingColor3Input = $('profile-avatar-ring-color3');
    const avatarRingColor4Input = $('profile-avatar-ring-color4');
    const avatarRingAlphaInput = $('profile-avatar-ring-alpha');
    const avatarRingAlpha2Input = $('profile-avatar-ring-alpha2');
    const avatarRingAlpha3Input = $('profile-avatar-ring-alpha3');
    const avatarRingAlpha4Input = $('profile-avatar-ring-alpha4');
    const avatarRingModeInput = $('profile-avatar-ring-mode');
    const avatarRingEnabled = $('profileAvatarRingEnabled');
    const avatarRingClearBtn = $('profileAvatarRingClear');
    const avatarRingMatchBtn = $('profileAvatarRingMatchName');
    const backgroundFileInput = $('profile-background-file');
    const backgroundClearBtn = $('profileBackgroundClear');
    const backgroundStrengthInput = $('profile-background-strength');
    const chatColorInput = $('profile-chat-color');
    const soundToggle = $('profileSoundToggle');
    const soundVolume = $('profile-notify-volume');
    const soundFileInput = $('profile-notify-file');
    const soundTestBtn = $('profileNotifyTest');
    const soundClearBtn = $('profileNotifyClear');

    const readProfileImageDataURL = async (file, maxBytes = 4 * 1024 * 1024) => {
        if (!file) throw new Error('Select an image first.');
        const mime = normalizeMime(file.type);
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
            throw new Error('Use png, jpeg, webp, or gif.');
        }
        if (file.size <= 0 || file.size > maxBytes) {
            throw new Error(`Image must be ${formatBytes(maxBytes)} or smaller.`);
        }
        const raw = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ''));
            r.onerror = () => reject(r.error || new Error('read failed'));
            r.readAsDataURL(file);
        });
        if (!raw.startsWith(`data:${mime};base64,`)) throw new Error('Could not process image.');
        return raw;
    };
    const readAvatarDataURL = (file) => readProfileImageDataURL(file, 4 * 1024 * 1024);
    const readBackgroundDataURL = (file) => readProfileImageDataURL(file, 2 * 1024 * 1024);
    const readNotificationDataURL = async (file) => {
        if (!file) throw new Error('Select an audio file first.');
        const mime = normalizeMime(file.type);
        const allowed = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/x-m4a'];
        if (!allowed.includes(mime)) {
            throw new Error('Use mp3, wav, ogg, webm, or m4a audio.');
        }
        const maxBytes = 2 * 1024 * 1024;
        if (file.size <= 0 || file.size > maxBytes) {
            throw new Error(`Sound must be ${formatBytes(maxBytes)} or smaller.`);
        }
        const raw = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result || ''));
            r.onerror = () => reject(r.error || new Error('read failed'));
            r.readAsDataURL(file);
        });
        if (!raw.startsWith(`data:${mime};base64,`)) throw new Error('Could not process audio.');
        return raw;
    };
    const avatarCropState = {image: null, zoom: 100, x: 0, y: 0};
    const updateCropLabels = () => {
        if (avatarCropZoomLabel) avatarCropZoomLabel.textContent = `${avatarCropState.zoom}%`;
    };
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const cropShiftBoundsForSize = (size) => {
        const img = avatarCropState.image;
        if (!img) return {maxX: 0, maxY: 0};
        const baseScale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const scale = baseScale * (avatarCropState.zoom / 100);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        return {
            maxX: Math.max(0, (drawW - size) / 2),
            maxY: Math.max(0, (drawH - size) / 2),
        };
    };
    const cropRectForSize = (size) => {
        const img = avatarCropState.image;
        if (!img) return null;
        const baseScale = Math.max(size / img.naturalWidth, size / img.naturalHeight);
        const scale = baseScale * (avatarCropState.zoom / 100);
        const drawW = img.naturalWidth * scale;
        const drawH = img.naturalHeight * scale;
        const maxX = Math.max(0, (drawW - size) / 2);
        const maxY = Math.max(0, (drawH - size) / 2);
        const shiftX = (avatarCropState.x / 100) * maxX;
        const shiftY = (avatarCropState.y / 100) * maxY;
        const dx = ((size - drawW) / 2) - shiftX;
        const dy = ((size - drawH) / 2) - shiftY;
        return {dx, dy, drawW, drawH};
    };
    const drawCropPreview = () => {
        if (!avatarCropCanvas || !avatarCropState.image) return;
        const ctx = avatarCropCanvas.getContext('2d');
        if (!ctx) return;
        const size = avatarCropCanvas.width;
        const rect = cropRectForSize(size);
        if (!rect) return;
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (size / 2) - 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarCropState.image, rect.dx, rect.dy, rect.drawW, rect.drawH);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (size / 2) - 2, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        updateCropLabels();
    };
    const resetAvatarCropper = () => {
        avatarCropState.image = null;
        avatarCropState.zoom = 100;
        avatarCropState.x = 0;
        avatarCropState.y = 0;
        if (avatarCropZoom) avatarCropZoom.value = '100';
        updateCropLabels();
        if (avatarCropCanvas) {
            const ctx = avatarCropCanvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, avatarCropCanvas.width, avatarCropCanvas.height);
        }
        if (avatarCropper) avatarCropper.style.display = 'none';
    };
    const openAvatarCropper = async (file) => {
        const raw = await readAvatarDataURL(file);
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error('Could not decode image.'));
            img.src = raw;
        });
        avatarCropState.image = img;
        avatarCropState.zoom = 100;
        avatarCropState.x = 0;
        avatarCropState.y = 0;
        if (avatarCropZoom) avatarCropZoom.value = '100';
        if (avatarCropper) avatarCropper.style.display = 'grid';
        drawCropPreview();
    };
    const buildCroppedAvatarDataURL = () => {
        if (!avatarCropState.image) throw new Error('Select an image first.');
        const out = document.createElement('canvas');
        const size = 256;
        out.width = size;
        out.height = size;
        const rect = cropRectForSize(size);
        if (!rect) throw new Error('Could not crop image.');
        const ctx = out.getContext('2d');
        if (!ctx) throw new Error('Could not process image.');
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarCropState.image, rect.dx, rect.dy, rect.drawW, rect.drawH);
        ctx.restore();
        return out.toDataURL('image/png');
    };

    const readRingDraft = () => {
        if (!avatarRingColorInput || !avatarRingColor2Input || !avatarRingColor3Input || !avatarRingColor4Input || !avatarRingAlphaInput || !avatarRingAlpha2Input || !avatarRingAlpha3Input || !avatarRingAlpha4Input || !avatarRingModeInput) return null;
        return {
            color: hexWithAlpha(avatarRingColorInput.value, avatarRingAlphaInput.value),
            color2: hexWithAlpha(avatarRingColor2Input.value, avatarRingAlpha2Input.value),
            color3: hexWithAlpha(avatarRingColor3Input.value, avatarRingAlpha3Input.value),
            color4: hexWithAlpha(avatarRingColor4Input.value, avatarRingAlpha4Input.value),
            mode: normalizeAvatarRingMode(avatarRingModeInput.value),
        };
    };
    const syncRangeLabel = (input) => {
        const label = input && document.querySelector(`label[for="${cssEscape(input.id)}"] span`);
        if (label) label.textContent = `${input.value}%`;
    };
    const updateAvatarRingPreview = () => {
        const draft = readRingDraft();
        const preview = $('profilePreview');
        const ring = preview && preview.querySelector('.avatar-ring');
        if (!draft || !ring) return;
        [avatarRingAlphaInput, avatarRingAlpha2Input, avatarRingAlpha3Input, avatarRingAlpha4Input].forEach(syncRangeLabel);
        const enabled = !avatarRingEnabled || avatarRingEnabled.checked;
        const hasRing = enabled && !!draft.color;
        ring.className = `avatar-ring${hasRing ? ' has-ring' : ''}${hasRing && draft.mode !== 'none' ? ` ring-${draft.mode}` : ''}`;
        if (!hasRing) {
            ring.removeAttribute('style');
            return;
        }
        ring.style.setProperty('--avatar-ring', draft.color);
        ring.style.setProperty('--avatar-ring-2', draft.color2 || draft.color);
        ring.style.setProperty('--avatar-ring-3', draft.color3 || '#57db84');
        ring.style.setProperty('--avatar-ring-4', draft.color4 || '#9d7bff');
    };

    const uploadAvatar = async (avatarURL) => {
        try {
            const r = await api('/api/profile/avatar', {method: 'POST', body: JSON.stringify({avatar_url: avatarURL})});
            if (!r.ok) {
                setStatus(status, r.data.error || 'Failed to upload profile picture.', 'err');
                return;
            }
            setStatus(status, 'Profile picture saved for everyone.', 'ok');
            resetAvatarCropper();
            if (avatarFileInput) avatarFileInput.value = '';
            await refreshMembers();
            if (currentView === VIEW_CHAT) await loadHistory();
        } catch (e) {
            setStatus(status, e.message || 'Failed to upload profile picture.', 'err');
        }
    };
    const saveAvatarRing = async () => {
        const draft = readRingDraft();
        if (!draft) return;
        updateAvatarRingPreview();
        const ringColor = draft.color;
        const ringColor2 = draft.color2;
        const ringColor3 = draft.color3;
        const ringColor4 = draft.color4;
        const ringMode = draft.mode;
        if (!ringColor) {
            setStatus(status, 'Pick a valid ring color first.', 'err');
            return;
        }
        const r = await api('/api/profile/avatar-ring', {
            method: 'POST',
            body: JSON.stringify({
                avatar_ring_color: ringColor,
                avatar_ring_color2: ringColor2,
                avatar_ring_color3: ringColor3,
                avatar_ring_color4: ringColor4,
                avatar_ring_mode: ringMode
            })
        });
        if (!r.ok) {
            setStatus(status, r.data.error || 'Failed to save picture ring.', 'err');
            return;
        }
        currentAvatarRingColor = ringColor;
        currentAvatarRingColor2 = ringColor2;
        currentAvatarRingColor3 = ringColor3;
        currentAvatarRingColor4 = ringColor4;
        currentAvatarRingMode = ringMode;
        if (avatarRingEnabled) avatarRingEnabled.checked = true;
        updateAvatarRingPreview();
        setStatus(status, 'Profile picture ring saved for everyone.', 'ok');
        await refreshMembers();
        if (currentView === VIEW_CHAT) await loadHistory();
    };
    const clearAvatarRing = async () => {
        const r = await api('/api/profile/avatar-ring', {
            method: 'POST',
            body: JSON.stringify({
                avatar_ring_color: '',
                avatar_ring_color2: '',
                avatar_ring_color3: '',
                avatar_ring_color4: '',
                avatar_ring_mode: 'none'
            })
        });
        if (!r.ok) {
            setStatus(status, r.data.error || 'Failed to clear picture ring.', 'err');
            if (avatarRingEnabled) avatarRingEnabled.checked = true;
            return;
        }
        currentAvatarRingColor = '';
        currentAvatarRingColor2 = '';
        currentAvatarRingColor3 = '';
        currentAvatarRingColor4 = '';
        currentAvatarRingMode = 'none';
        if (avatarRingModeInput) avatarRingModeInput.value = 'none';
        if (avatarRingEnabled) avatarRingEnabled.checked = false;
        updateAvatarRingPreview();
        setStatus(status, 'Profile picture ring cleared.', 'ok');
        await refreshMembers();
        if (currentView === VIEW_CHAT) await loadHistory();
    };
    const applyBackground = async () => {
        try {
            const file = backgroundFileInput && backgroundFileInput.files && backgroundFileInput.files[0];
            const backgroundURL = await readBackgroundDataURL(file);
            saveLocalBackground(backgroundURL);
            setStatus(status, 'Background saved locally for this browser.', 'ok');
        } catch (e) {
            setStatus(status, e.message || 'Failed to apply background.', 'err');
        }
    };
    const saveDisplayName = async () => {
        if (!displayNameInput) return;
        const nextName = String(displayNameInput.value || '').trim();
        if (!nextName) {
            setStatus(status, 'Display name is required.', 'err');
            return;
        }
        if (nextName.length > 48) {
            setStatus(status, 'Display name must be 48 characters or fewer.', 'err');
            return;
        }
        const r = await api('/api/profile/name', {method: 'POST', body: JSON.stringify({display_name: nextName})});
        if (!r.ok) {
            setStatus(status, r.data.error || 'Failed to save display name.', 'err');
            return;
        }
        currentDisplayName = String((r.data && r.data.display_name) || nextName).trim();
        displayNameInput.value = currentDisplayName;
        registerDisplayName(currentDisplayName);
        persistIdentity();
        refreshTopProfileChip();
        refreshProfilePreviewAvatar();
        await refreshMembers();
        if (currentView === VIEW_CHAT) await loadHistory();
        await renderMain();
        setStatus(status, 'Display name saved for everyone.', 'ok');
    };
    const saveStatusText = async (nextValue = null) => {
        if (!statusTextInput) return;
        const nextStatus = nextValue === null ? String(statusTextInput.value || '').trim() : String(nextValue || '').trim();
        if (nextStatus.length > 120) {
            setStatus(status, 'Status must be 120 characters or fewer.', 'err');
            return;
        }
        const r = await api('/api/profile/status', {method: 'POST', body: JSON.stringify({status_text: nextStatus})});
        if (!r.ok) {
            setStatus(status, r.data.error || 'Failed to save status.', 'err');
            return;
        }
        currentStatusText = String((r.data && r.data.status_text) || nextStatus).trim();
        statusTextInput.value = currentStatusText;
        await refreshMembers();
        setStatus(status, currentStatusText ? 'Status saved.' : 'Status cleared.', 'ok');
    };

    if (displayNameSaveBtn) {
        displayNameSaveBtn.onclick = saveDisplayName;
    }
    if (displayNameInput) {
        displayNameInput.addEventListener('keydown', async (ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            await saveDisplayName();
        });
    }
    if (statusTextSaveBtn) {
        statusTextSaveBtn.onclick = () => saveStatusText();
    }
    if (statusTextClearBtn) {
        statusTextClearBtn.onclick = () => saveStatusText('');
    }
    if (statusTextInput) {
        statusTextInput.addEventListener('keydown', async (ev) => {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            await saveStatusText();
        });
    }

    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', async () => {
            try {
                const file = avatarFileInput.files && avatarFileInput.files[0];
                if (!file) return;
                await openAvatarCropper(file);
                setStatus(status, 'Adjust crop and save your profile picture.', 'ok');
            } catch (e) {
                setStatus(status, e.message || 'Failed to process profile picture.', 'err');
            }
        });
    }
    if (avatarCropZoom) {
        avatarCropZoom.addEventListener('input', () => {
            avatarCropState.zoom = Number(avatarCropZoom.value || 100);
            avatarCropState.x = clamp(avatarCropState.x, -100, 100);
            avatarCropState.y = clamp(avatarCropState.y, -100, 100);
            drawCropPreview();
        });
    }
    if (avatarCropCanvas) {
        let dragStart = null;
        const stopDrag = () => {
            dragStart = null;
            avatarCropCanvas.classList.remove('dragging');
        };
        const startDrag = (ev) => {
            if (!avatarCropState.image) return;
            dragStart = {
                x: ev.clientX,
                y: ev.clientY,
                startCropX: avatarCropState.x,
                startCropY: avatarCropState.y,
            };
            avatarCropCanvas.classList.add('dragging');
        };
        const moveDrag = (ev) => {
            if (!dragStart || !avatarCropState.image) return;
            const size = avatarCropCanvas.width;
            const bounds = cropShiftBoundsForSize(size);
            const deltaX = ev.clientX - dragStart.x;
            const deltaY = ev.clientY - dragStart.y;
            const nextX = bounds.maxX > 0 ? dragStart.startCropX - ((deltaX / bounds.maxX) * 100) : 0;
            const nextY = bounds.maxY > 0 ? dragStart.startCropY - ((deltaY / bounds.maxY) * 100) : 0;
            avatarCropState.x = clamp(nextX, -100, 100);
            avatarCropState.y = clamp(nextY, -100, 100);
            drawCropPreview();
        };
        avatarCropCanvas.addEventListener('pointerdown', (ev) => {
            startDrag(ev);
            avatarCropCanvas.setPointerCapture(ev.pointerId);
        });
        avatarCropCanvas.addEventListener('pointermove', moveDrag);
        avatarCropCanvas.addEventListener('pointerup', stopDrag);
        avatarCropCanvas.addEventListener('pointercancel', stopDrag);
        avatarCropCanvas.addEventListener('lostpointercapture', stopDrag);
        avatarCropCanvas.addEventListener('wheel', (ev) => {
            if (!avatarCropState.image) return;
            ev.preventDefault();
            const delta = ev.deltaY > 0 ? -5 : 5;
            avatarCropState.zoom = clamp(avatarCropState.zoom + delta, 100, 300);
            if (avatarCropZoom) avatarCropZoom.value = String(Math.round(avatarCropState.zoom));
            drawCropPreview();
        }, {passive: false});
    }
    if (avatarCropCancelBtn) {
        avatarCropCancelBtn.onclick = () => {
            resetAvatarCropper();
            if (avatarFileInput) avatarFileInput.value = '';
            setStatus(status, 'Profile picture selection canceled.');
        };
    }
    if (avatarCropSaveBtn) {
        avatarCropSaveBtn.onclick = async () => {
            try {
                const avatarURL = buildCroppedAvatarDataURL();
                await uploadAvatar(avatarURL);
            } catch (e) {
                setStatus(status, e.message || 'Failed to crop profile picture.', 'err');
            }
        };
    }
    if (avatarRingColorInput && avatarRingColor2Input && avatarRingColor3Input && avatarRingColor4Input && avatarRingAlphaInput && avatarRingAlpha2Input && avatarRingAlpha3Input && avatarRingAlpha4Input && avatarRingModeInput) {
        [avatarRingColorInput, avatarRingColor2Input, avatarRingColor3Input, avatarRingColor4Input, avatarRingAlphaInput, avatarRingAlpha2Input, avatarRingAlpha3Input, avatarRingAlpha4Input, avatarRingModeInput].forEach((input) => {
            input.addEventListener('input', updateAvatarRingPreview);
            input.addEventListener('change', saveAvatarRing);
        });
        updateAvatarRingPreview();
    }
    if (avatarRingEnabled) {
        avatarRingEnabled.onchange = async () => {
            updateAvatarRingPreview();
            if (avatarRingEnabled.checked) {
                await saveAvatarRing();
                return;
            }
            await clearAvatarRing();
        };
    }
    if (backgroundFileInput) {
        backgroundFileInput.addEventListener('change', applyBackground);
    }

    if (avatarClearBtn) {
        avatarClearBtn.onclick = async () => {
            const r = await api('/api/profile/avatar', {method: 'POST', body: JSON.stringify({avatar_url: ''})});
            if (!r.ok) {
                setStatus(status, r.data.error || 'Failed to clear profile picture.', 'err');
                return;
            }
            resetAvatarCropper();
            if (avatarFileInput) avatarFileInput.value = '';
            setStatus(status, 'Profile picture cleared.', 'ok');
            await refreshMembers();
            if (currentView === VIEW_CHAT) await loadHistory();
        };
    }
    if (avatarRingClearBtn) {
        avatarRingClearBtn.onclick = clearAvatarRing;
    }
    if (avatarRingMatchBtn) {
        avatarRingMatchBtn.onclick = async () => {
            const nameColor = normalizeHexColor(currentUserChatColor || userColor(currentDisplayName || '')) || '#ff9d66';
            if (avatarRingColorInput) avatarRingColorInput.value = nameColor;
            if (avatarRingColor2Input) avatarRingColor2Input.value = nameColor;
            if (avatarRingAlphaInput) avatarRingAlphaInput.value = '100';
            if (avatarRingAlpha2Input) avatarRingAlpha2Input.value = '55';
            if (avatarRingEnabled) avatarRingEnabled.checked = true;
            updateAvatarRingPreview();
            await saveAvatarRing();
        };
    }
    if (backgroundClearBtn) {
        backgroundClearBtn.onclick = () => {
            saveLocalBackground('');
            if (backgroundFileInput) backgroundFileInput.value = '';
            setStatus(status, 'Local background cleared.', 'ok');
        };
    }
    if (backgroundStrengthInput) {
        backgroundStrengthInput.value = String(localBackgroundStrength());
        backgroundStrengthInput.addEventListener('input', () => {
            const value = saveLocalBackgroundStrength(backgroundStrengthInput.value);
            setStatus(status, `Background strength: ${value}%.`, 'ok');
        });
    }

    if (soundToggle) {
        soundToggle.checked = notifySoundEnabled;
        soundToggle.onchange = () => {
            setNotifySoundEnabled(soundToggle.checked);
            soundToggle.checked = notifySoundEnabled;
            unlockAudio();
            setStatus(status, `Notification sound ${notifySoundEnabled ? 'enabled' : 'disabled'}.`, 'ok');
        };
    }
    if (soundVolume) {
        soundVolume.value = String(Math.round(notifyVolume * 100));
        soundVolume.addEventListener('input', () => {
            const n = Number(soundVolume.value || 0);
            setNotifyVolume(n / 100);
            setStatus(status, `Notification volume: ${Math.round(notifyVolume * 100)}%.`, 'ok');
        });
        soundVolume.addEventListener('change', () => {
            unlockAudio();
            playNotificationSound();
        });
    }
    if (soundFileInput) {
        soundFileInput.onchange = async () => {
            const file = soundFileInput.files && soundFileInput.files[0];
            if (!file) return;
            try {
                const dataURL = await readNotificationDataURL(file);
                setCustomNotificationSound(file.name || 'custom sound', dataURL);
                unlockAudio();
                setStatus(status, `Custom notification sound saved locally: ${customNotificationName}.`, 'ok');
                playNotificationSound();
            } catch (e) {
                soundFileInput.value = '';
                setStatus(status, e.message || 'Could not save notification sound.', 'err');
            }
        };
    }
    if (soundTestBtn) {
        soundTestBtn.onclick = () => {
            unlockAudio();
            playNotificationSound(true);
            setStatus(status, customNotificationName ? `Playing ${customNotificationName}.` : 'Playing built-in notification tone.', 'ok');
        };
    }
    if (soundClearBtn) {
        soundClearBtn.onclick = () => {
            clearCustomNotificationSound();
            if (soundFileInput) soundFileInput.value = '';
            setStatus(status, 'Custom notification sound cleared.', 'ok');
        };
    }
    if (chatColorInput) {
        chatColorInput.addEventListener('input', () => {
            setUserColor(currentDisplayName || '', chatColorInput.value);
            refreshRenderedUserColor(currentDisplayName || '');
            refreshTopProfileChip();
            refreshProfilePreviewAvatar();
            setStatus(status, 'Previewing chat name color.');
        });
        chatColorInput.addEventListener('change', async () => {
            const nextColor = normalizeHexColor(chatColorInput.value);
            if (!nextColor || !currentDisplayName) {
                setStatus(status, 'Pick a valid chat name color first.', 'err');
                return;
            }
            setUserColor(currentDisplayName, nextColor);
            refreshRenderedUserColor(currentDisplayName);
            const r = await api('/api/profile/color', {method: 'POST', body: JSON.stringify({chat_color: nextColor})});
            if (!r.ok) {
                setStatus(status, r.data.error || 'Failed to save chat name color.', 'err');
                return;
            }
            currentUserChatColor = nextColor;
            refreshTopProfileChip();
            refreshProfilePreviewAvatar();
            setStatus(status, 'Chat name color saved for everyone.', 'ok');
        });
    }
}

async function refreshCustomMediaAssets() {
    const r = await api(withRoomQuery('/api/custom-media'));
    if (!r.ok) return false;
    const items = Array.isArray(r.data.items) ? r.data.items : [];
    customEmojiMap = new Map();
    customStickerMap = new Map();
    for (const item of items) {
        const kind = String(item.kind || '').toLowerCase();
        const name = String(item.name || '').toLowerCase();
        const url = String(item.url || '').trim();
        if (!name || !url) continue;
        if (kind === 'emoji') customEmojiMap.set(name, {name, url});
        if (kind === 'sticker') customStickerMap.set(name, {name, url});
    }
    return true;
}

function bindControlActions() {
    const inviteBtn = $('invite');
    const inviteOut = $('inviteOut');
    const inviteList = $('inviteList');
    const revokeUnusedBtn = $('revokeUnusedInvites');
    const purgeUsedRevokedBtn = $('purgeUsedRevokedInvites');
    const roomNameInput = $('roomNameInput');
    const saveRoomNameBtn = $('saveRoomName');
    const roomNameStatus = $('roomNameStatus');
    const roomStatusTextAdminInput = $('roomStatusTextAdminInput');
    const saveRoomStatusTextAdminBtn = $('saveRoomStatusTextAdmin');
    const roomStatusTextAdminStatus = $('roomStatusTextAdminStatus');
    const newRoomNameInput = $('newRoomNameInput');
    const createRoomBtn = $('createRoomBtn');
    const createRoomStatus = $('createRoomStatus');
    const auditStatus = $('auditStatus');
    const auditList = $('auditList');
    const messageStatus = $('messageAdminStatus');
    const retainCountInput = $('retainCountInput');
    const retainMessagesBtn = $('retainMessages');
    const clearMessagesBtn = $('clearMessages');
    const customMediaKind = $('customMediaKind');
    const customMediaName = $('customMediaName');
    const customMediaFile = $('customMediaFile');
    const customMediaUpload = $('customMediaUpload');
    const customMediaStatus = $('customMediaStatus');
    const customMediaList = $('customMediaList');

    const refreshCustomMediaAdminList = async () => {
        if (!customMediaList) return;
        const r = await api(withRoomQuery('/api/custom-media'));
        if (!r.ok) {
            if (customMediaStatus) {
                customMediaStatus.textContent = r.data.error || 'Failed to load custom media.';
                customMediaStatus.className = 'status err';
            }
            return;
        }
        const items = Array.isArray(r.data.items) ? r.data.items : [];
        customMediaList.innerHTML = items.length === 0
            ? `<div class="muted">No custom emoji or stickers uploaded yet.</div>`
            : items.map((item) => `<div class="admin-user"><div><strong>${esc(item.kind || 'media')}: ${esc(item.name || '')}</strong><div class="admin-role">token ${esc(item.token || '')}</div></div><div class="admin-actions"><img class="custom-media-thumb" src="${esc(item.url || '')}" alt="${esc(item.name || '')}"/><button class="secondary" data-delete-custom-media="${esc(item.name || '')}" data-delete-custom-kind="${esc(item.kind || '')}">Delete</button></div></div>`).join('');
        customMediaList.querySelectorAll('button[data-delete-custom-media]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const name = String(btn.getAttribute('data-delete-custom-media') || '');
                const kind = String(btn.getAttribute('data-delete-custom-kind') || '');
                if (!name || !kind) return;
                if (!confirm(`Delete ${kind} "${name}"?`)) return;
                const del = await api(withRoomQuery(`/api/admin/custom-media/${encodeURIComponent(name)}?kind=${encodeURIComponent(kind)}`), {method: 'DELETE'});
                if (!del.ok) {
                    if (customMediaStatus) {
                        customMediaStatus.textContent = del.data.error || 'Delete failed.';
                        customMediaStatus.className = 'status err';
                    }
                    return;
                }
                await refreshCustomMediaAssets();
                await refreshCustomMediaAdminList();
                if (customMediaStatus) {
                    customMediaStatus.textContent = `Deleted ${kind}: ${name}`;
                    customMediaStatus.className = 'status ok';
                }
            });
        });
    };

    const refreshInvites = async () => {
        if (!inviteList) return;
        const r = await api(withRoomQuery('/api/admin/invites'));
        if (!r.ok) {
            inviteList.innerHTML = `<div class="muted">${esc(r.data.error || 'failed to load invites')}</div>`;
            return;
        }
        inviteList.innerHTML = '';
        const invites = [...(r.data.invites || [])];
        invites.sort((a, b) => {
            const aRemaining = Math.max(0, Number(a.max_uses || 0) - Number(a.uses || 0));
            const bRemaining = Math.max(0, Number(b.max_uses || 0) - Number(b.uses || 0));
            const aInactive = !!a.revoked || aRemaining === 0;
            const bInactive = !!b.revoked || bRemaining === 0;
            if (aInactive === bInactive) return 0;
            return aInactive ? 1 : -1;
        });
        for (const inv of invites) {
            const row = document.createElement('div');
            row.className = 'admin-user';
            const remaining = Math.max(0, Number(inv.max_uses || 0) - Number(inv.uses || 0));
            const state = inv.revoked ? 'revoked' : (remaining === 0 ? 'used' : 'active');
            row.innerHTML = `<div><strong>${esc(inv.id)}</strong><div class="admin-role">${esc(state)} · uses ${esc(String(inv.uses || 0))}/${esc(String(inv.max_uses || 0))} · expires ${esc(inv.expires_at || 'n/a')}</div></div><div class="admin-actions">${inv.revoked ? '<span class="muted">locked</span>' : `<button class="secondary" data-revoke-invite="${esc(inv.id)}">Revoke</button>`}</div>`;
            inviteList.appendChild(row);
        }
        inviteList.querySelectorAll('button[data-revoke-invite]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const inviteID = btn.getAttribute('data-revoke-invite');
                const resp = await api(withRoomQuery('/api/admin/revoke-invite'), {
                    method: 'POST',
                    body: JSON.stringify({invite_id: inviteID})
                });
                if (!resp.ok) {
                    if (inviteOut) inviteOut.textContent = resp.data.error || 'failed';
                    return;
                }
                if (inviteOut) inviteOut.textContent = `Revoked invite ${inviteID}`;
                refreshInvites();
            });
        });
    };

    const refreshMessageStats = async () => {
        if (!messageStatus) return;
        const r = await api(withRoomQuery('/api/admin/messages/stats'));
        if (!r.ok) {
            messageStatus.textContent = r.data.error || 'failed to load message stats';
            messageStatus.className = 'status err';
            return;
        }
        messageStatus.textContent = `Stored messages: ${r.data.count} · policy days: ${r.data.retain_days || 'off'} · policy count: ${r.data.retain_count || 'off'}`;
        messageStatus.className = 'status';
    };
    const refreshAuditLog = async () => {
        if (!auditList || !auditStatus) return;
        const r = await api(withRoomQuery('/api/admin/audit'));
        if (!r.ok) {
            auditStatus.textContent = r.data.error || 'failed to load audit log';
            auditStatus.className = 'status err';
            return;
        }
        const items = Array.isArray(r.data.items) ? r.data.items : [];
        if (items.length === 0) {
            auditStatus.textContent = 'No audit events yet.';
            auditStatus.className = 'status';
            auditList.innerHTML = '';
            return;
        }
        auditStatus.textContent = `Showing ${items.length} recent events.`;
        auditStatus.className = 'status';
        auditList.innerHTML = items.map((item) => `<div class="admin-user"><div><strong>${esc(item.action || 'action')}</strong><div class="admin-role">${esc(item.actor_name || item.actor_id || 'system')} · ${esc(item.created_at || '')}${item.target ? ` · ${esc(item.target)}` : ''}</div></div><div class="muted">${esc(item.details || '')}</div></div>`).join('');
    };

    if (inviteBtn) {
        inviteBtn.onclick = async () => {
            const r = await api(withRoomQuery('/api/invite'), {method: 'POST'});
            if (inviteOut) {
                if (r.ok) {
                    const url = `${location.origin}${r.data.invite_link}`;
                    let copied = false;
                    try {
                        await navigator.clipboard.writeText(url);
                        copied = true;
                    } catch {
                    }
                    inviteOut.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(url)}</a>${copied ? '<div class="muted">Copied to clipboard.</div>' : '<div class="muted">Copy to clipboard blocked by browser; link is ready above.</div>'}`;
                } else {
                    inviteOut.textContent = r.data.error || 'failed';
                }
            }
            refreshInvites();
        };
    }
    if (revokeUnusedBtn) {
        revokeUnusedBtn.onclick = async () => {
            const r = await api(withRoomQuery('/api/admin/revoke-unused-invites'), {method: 'POST', body: JSON.stringify({})});
            if (inviteOut) inviteOut.textContent = r.ok ? `Revoked ${r.data.revoked} unused invites` : (r.data.error || 'failed');
            refreshInvites();
        };
    }
    if (purgeUsedRevokedBtn) {
        purgeUsedRevokedBtn.onclick = async () => {
            const r = await api(withRoomQuery('/api/admin/purge-used-revoked-invites'), {method: 'POST', body: JSON.stringify({})});
            if (inviteOut) inviteOut.textContent = r.ok ? `Purged ${r.data.purged} used/revoked invites` : (r.data.error || 'failed');
            refreshInvites();
        };
    }
    if (saveRoomNameBtn) {
        saveRoomNameBtn.onclick = async () => {
            const nextName = String((roomNameInput && roomNameInput.value) || '').trim();
            if (!nextName) {
                if (roomNameStatus) {
                    roomNameStatus.textContent = 'Enter a room name first.';
                    roomNameStatus.className = 'status err';
                }
                return;
            }
            const r = await api(withRoomQuery('/api/admin/room-name'), {method: 'POST', body: JSON.stringify({room_name: nextName})});
            if (!r.ok) {
                if (roomNameStatus) {
                    roomNameStatus.textContent = r.data.error || 'failed';
                    roomNameStatus.className = 'status err';
                }
                return;
            }
            roomName = String((r.data && r.data.room_name) || nextName).trim();
            if (roomNameInput) roomNameInput.value = roomName;
            const roomTitleEl = document.querySelector('.room-title strong');
            if (roomTitleEl) roomTitleEl.textContent = roomName || 'Room Chat';
            if (roomNameStatus) {
                roomNameStatus.textContent = 'Room name updated.';
                roomNameStatus.className = 'status ok';
            }
        };
    }
    if (saveRoomStatusTextAdminBtn) {
        saveRoomStatusTextAdminBtn.onclick = async () => {
            const nextText = String((roomStatusTextAdminInput && roomStatusTextAdminInput.value) || '').trim();
            const r = await api(withRoomQuery('/api/admin/room-status-text'), {method: 'POST', body: JSON.stringify({room_status_text: nextText})});
            if (!r.ok) {
                if (roomStatusTextAdminStatus) {
                    roomStatusTextAdminStatus.textContent = r.data.error || 'failed';
                    roomStatusTextAdminStatus.className = 'status err';
                }
                return;
            }
            setRoomStatusText(String((r.data && r.data.room_status_text) || nextText || DEFAULT_ROOM_STATUS_TEXT));
            if (roomStatusTextAdminInput) roomStatusTextAdminInput.value = roomStatusText;
            if (roomStatusTextAdminStatus) {
                roomStatusTextAdminStatus.textContent = 'Room status text updated.';
                roomStatusTextAdminStatus.className = 'status ok';
            }
        };
    }
    if (createRoomBtn) {
        createRoomBtn.onclick = async () => {
            const roomDisplayName = String((newRoomNameInput && newRoomNameInput.value) || '').trim();
            if (!roomDisplayName) {
                if (createRoomStatus) {
                    createRoomStatus.textContent = 'Enter a room name.';
                    createRoomStatus.className = 'status err';
                }
                return;
            }
            await createChannelFromName(roomDisplayName, createRoomStatus, newRoomNameInput);
        };
    }
    if (retainMessagesBtn) {
        retainMessagesBtn.onclick = async () => {
            const keepLatest = Number((retainCountInput && retainCountInput.value) || 0);
            if (!Number.isFinite(keepLatest) || keepLatest <= 0) {
                if (messageStatus) {
                    messageStatus.textContent = 'Enter a valid keep-latest count.';
                    messageStatus.className = 'status err';
                }
                return;
            }
            if (!confirm(`Keep only the latest ${keepLatest} messages? This cannot be undone.`)) return;
            const r = await api(withRoomQuery('/api/admin/messages/retain'), {
                method: 'POST',
                body: JSON.stringify({keep_latest: keepLatest})
            });
            if (!r.ok) {
                if (messageStatus) {
                    messageStatus.textContent = r.data.error || 'failed';
                    messageStatus.className = 'status err';
                }
                return;
            }
            if (messageStatus) {
                messageStatus.textContent = `Pruned successfully. Remaining messages: ${r.data.remaining}`;
                messageStatus.className = 'status ok';
            }
            refreshMessageStats();
        };
    }
    if (clearMessagesBtn) {
        clearMessagesBtn.onclick = async () => {
            if (!confirm('Delete all messages in this room? This is permanent.')) return;
            const r = await api(withRoomQuery('/api/admin/messages/clear'), {method: 'POST', body: JSON.stringify({})});
            if (!r.ok) {
                if (messageStatus) {
                    messageStatus.textContent = r.data.error || 'failed';
                    messageStatus.className = 'status err';
                }
                return;
            }
            if (messageStatus) {
                messageStatus.textContent = `Deleted ${r.data.deleted} messages.`;
                messageStatus.className = 'status ok';
            }
            refreshMessageStats();
        };
    }
    if (customMediaUpload) {
        customMediaUpload.onclick = async () => {
            const kind = String((customMediaKind && customMediaKind.value) || 'emoji').toLowerCase();
            const name = String((customMediaName && customMediaName.value) || '').trim().toLowerCase();
            const file = customMediaFile && customMediaFile.files ? customMediaFile.files[0] : null;
            if (!file) {
                if (customMediaStatus) {
                    customMediaStatus.textContent = 'Pick a file first.';
                    customMediaStatus.className = 'status err';
                }
                return;
            }
            if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
                if (customMediaStatus) {
                    customMediaStatus.textContent = 'Name must be a-z, 0-9, _ or - (max 32 chars).';
                    customMediaStatus.className = 'status err';
                }
                return;
            }
            const dataURL = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(reader.error || new Error('read failed'));
                reader.readAsDataURL(file);
            }).catch(() => '');
            if (!dataURL) {
                if (customMediaStatus) {
                    customMediaStatus.textContent = 'Could not read file.';
                    customMediaStatus.className = 'status err';
                }
                return;
            }
            const up = await api(withRoomQuery('/api/admin/custom-media'), {
                method: 'POST',
                body: JSON.stringify({kind, name, data_url: dataURL})
            });
            if (!up.ok) {
                if (customMediaStatus) {
                    customMediaStatus.textContent = up.data.error || 'Upload failed.';
                    customMediaStatus.className = 'status err';
                }
                return;
            }
            if (customMediaFile) customMediaFile.value = '';
            await refreshCustomMediaAssets();
            await refreshCustomMediaAdminList();
            if (customMediaStatus) {
                customMediaStatus.textContent = `Uploaded ${kind}: ${name} (token ${up.data.token || ':' + name + ':'})`;
                customMediaStatus.className = 'status ok';
            }
        };
    }

    renderAdminUsers();
    refreshInvites();
    refreshMessageStats();
    refreshAuditLog();
    refreshCustomMediaAdminList();
}

function renderPanelHTML() {
    if (currentView === VIEW_KEYS) return keysPanelHTML();
    if (currentView === VIEW_PROFILE) return profilePanelHTML();
    if (currentView === VIEW_THEME) return themePanelHTML();
    if (currentView === VIEW_CONTROL) return controlPanelHTML();
    return chatPanelHTML();
}

async function renderMain() {
    if (currentView === VIEW_CONTROL && !isAdminRole(myRole)) {
        currentView = VIEW_CHAT;
    }
    await refreshCustomMediaAssets();
    app.innerHTML = `<section class="chat-shell"><button class="sidebar-backdrop" data-sidebar-backdrop type="button" aria-label="Close sidebar"></button>${navHTML()}${renderPanelHTML()}</section>`;
    syncSidebarLayoutState();
    bindSidebarToggleActions();
    bindUserMenuActions();
    bindSidebarChannelActions();
    bindChannelManageActions();
    if (!window.__veilRoomsPollTimer) {
        window.__veilRoomsPollTimer = setInterval(() => {
            pollRoomsForUnread();
        }, 12000);
    }

    if (currentView === VIEW_CHAT) {
        bindChatActions();
        await loadHistory();
        await refreshMembers();
        if (jumpToUnreadAfterSwitch) {
            jumpToUnreadAfterSwitch = false;
            const divider = document.querySelector('.unread-divider');
            if (divider) divider.scrollIntoView({block: 'center', behavior: 'smooth'});
        }
        updateRoomConnectionStatus(!!ws && ws.readyState === WebSocket.OPEN);
        ensureSocket();
        return;
    }
    if (currentView === VIEW_KEYS) {
        bindKeyActions();
        return;
    }
    if (currentView === VIEW_PROFILE) {
        bindProfileActions();
        return;
    }
    if (currentView === VIEW_THEME) {
        bindThemeActions();
        return;
    }
    if (currentView === VIEW_CONTROL) {
        if (!isAdminRole(myRole)) {
            currentView = VIEW_CHAT;
            return renderMain();
        }
        bindControlActions();
    }
}

async function chatView() {
    await refreshAdminIdentity();
    await refreshRoomName();
    await refreshCustomMediaAssets();
    await renderMain();
}
