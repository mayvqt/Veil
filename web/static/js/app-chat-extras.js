function chatApplySearch(messagesEl, query) {
  if (!messagesEl) return;
  const q = String(query || "").trim().toLowerCase();
  messagesEl.querySelectorAll(".line[data-msg-id]").forEach((row) => {
    if (!q) {
      row.style.display = "";
      return;
    }
    row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
  });
}

function chatRenderPinnedBar(pinnedBarEl, messagesEl) {
  if (!pinnedBarEl || !messagesEl) return;
  const ids = [...pinnedMessageIDs];
  if (ids.length === 0) {
    pinnedBarEl.textContent = "";
    return;
  }
  pinnedBarEl.innerHTML = ids
    .slice(0, 4)
    .map((id) => {
      const source = knownMessages.get(id);
      const preview = source
        ? `${source.display_name}: ${String(source.preview || "").slice(0, 48)}`
        : `Pinned ${id.slice(0, 8)}`;
      return `<button class="tiny-action" data-jump-msg="${esc(id)}">${esc(preview)}</button>`;
    })
    .join("");
  pinnedBarEl.querySelectorAll("button[data-jump-msg]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-jump-msg") || "";
      const row = messagesEl.querySelector(`.line[data-msg-id="${cssEscape(id)}"]`);
      if (row) row.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}

async function chatHandleExtendedMessageAction(target, { onPinsChanged } = {}) {
  if (!(target instanceof HTMLElement)) return false;

  const reactBtn = target.closest("button[data-react-msg]");
  if (reactBtn) {
    const id = reactBtn.getAttribute("data-react-msg") || "";
    const emoji = prompt("React with emoji (example: 👍):", "👍");
    if (!emoji || !emoji.trim()) return true;
    await api("/api/messages/react", {
      method: "POST",
      body: JSON.stringify({ message_id: id, emoji: emoji.trim() }),
    });
    return true;
  }

  const reactChip = target.closest("button[data-react-toggle]");
  if (reactChip) {
    const id = reactChip.getAttribute("data-react-toggle") || "";
    const emoji = reactChip.getAttribute("data-react-emoji") || "";
    if (!id || !emoji) return true;
    await api("/api/messages/react", {
      method: "POST",
      body: JSON.stringify({ message_id: id, emoji }),
    });
    return true;
  }

  const pinBtn = target.closest("button[data-pin-msg]");
  if (pinBtn) {
    const id = pinBtn.getAttribute("data-pin-msg") || "";
    const pin = pinBtn.textContent.trim().toLowerCase() === "pin";
    const r = await api("/api/admin/pin-message", {
      method: "POST",
      body: JSON.stringify({ message_id: id, pin }),
    });
    if (r.ok) {
      if (pin) pinnedMessageIDs.add(id);
      else pinnedMessageIDs.delete(id);
      if (typeof onPinsChanged === "function") onPinsChanged();
      await loadHistory();
    }
    return true;
  }

  return false;
}
