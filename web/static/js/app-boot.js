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
    if (!h.ok) {
        await bootView();
        return;
    }
    const m = await api('/api/messages');
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
