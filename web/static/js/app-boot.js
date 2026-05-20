(async () => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    bindImageLightbox();
    applyTheme(currentTheme());
    applyLocalBackground();
    applyTimestampMode();
    const path = window.location.pathname;
    const inviteMatch = path.match(/^\/invite\/([^/]+)$/);
    if (inviteMatch) {
        await inviteView(inviteMatch[1]);
        return;
    }

    const h = await api('/health');
    if (h.data && h.data.version) appVersion = String(h.data.version || APP_VERSION);
    if (!h.ok) {
        await bootView();
        return;
    }
    const m = await api(withRoomQuery('/api/messages'));
    if (m.ok && m.data && m.data.room_id) {
        activeRoomID = String(m.data.room_id || activeRoomID || 'main');
    }
    if (m.ok) await refreshRooms();
    if (m.ok) {
        await chatView();
        return;
    }
    if (h.data && h.data.initialized) {
        await accessView();
        return;
    }
    await bootView();
})();
