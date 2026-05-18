let reactionPickerEl = null;
let reactionPickerMessageID = "";
let reactionPickerBound = false;

function ensureReactionPicker() {
  if (reactionPickerEl) return reactionPickerEl;
  reactionPickerEl = document.createElement("div");
  reactionPickerEl.className = "reaction-picker-pop";
  reactionPickerEl.hidden = true;
  reactionPickerEl.setAttribute("aria-label", "Reaction picker");
  reactionPickerEl.innerHTML = renderReactionChoicesHTML();
  document.body.appendChild(reactionPickerEl);
  return reactionPickerEl;
}

function closeReactionPicker() {
  if (!reactionPickerEl) return;
  reactionPickerEl.hidden = true;
  reactionPickerMessageID = "";
}

function bindReactionPickerHandlers() {
  if (reactionPickerBound) return;
  reactionPickerBound = true;
  if (reactionPickerEl) {
    reactionPickerEl.addEventListener("click", async (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const pick = target.closest("button[data-reaction-emoji]");
      if (!pick) return;
      const emoji = pick.getAttribute("data-reaction-emoji") || "";
      const messageID = reactionPickerMessageID;
      closeReactionPicker();
      if (!messageID || !emoji) return;
      try {
        await api("/api/messages/react", {
          method: "POST",
          body: JSON.stringify({ message_id: messageID, emoji }),
        });
      } catch {}
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeReactionPicker();
  });
  document.addEventListener(
    "click",
    (e) => {
      if (!reactionPickerEl || reactionPickerEl.hidden) return;
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(".reaction-picker-pop") ||
        target.closest("button[data-react-msg]")
      ) {
        return;
      }
      closeReactionPicker();
    },
    { capture: true }
  );
}

function openReactionPicker(anchorBtn, messageID) {
  const picker = ensureReactionPicker();
  picker.innerHTML = renderReactionChoicesHTML();
  bindReactionPickerHandlers();
  if (!picker.hidden && reactionPickerMessageID === messageID) {
    closeReactionPicker();
    return;
  }
  reactionPickerMessageID = messageID;
  const rect = anchorBtn.getBoundingClientRect();
  picker.hidden = false;
  const margin = 12;
  const gap = 8;
  const cellSize = 38;
  const gridGap = 6;
  const padX = 20;
  const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
  const choiceCount = picker.querySelectorAll("button[data-reaction-emoji]").length || 1;

  const maxColumnsByViewport =
    viewportW > 0
      ? Math.max(1, Math.floor((viewportW - margin * 2 - padX + gridGap) / (cellSize + gridGap)))
      : 8;
  const columns = Math.max(1, Math.min(8, choiceCount, maxColumnsByViewport));
  const computedWidth = padX + columns * cellSize + (columns - 1) * gridGap;
  picker.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  picker.style.width = `${computedWidth}px`;
  picker.style.maxWidth = `${Math.max(120, viewportW - margin * 2)}px`;
  picker.style.maxHeight = `${Math.max(180, viewportH - margin * 2)}px`;

  const pickerW = picker.offsetWidth || computedWidth;
  const pickerH = picker.offsetHeight || 0;

  let left = Math.round(rect.left);
  if (pickerW > 0 && viewportW > 0) {
    left = Math.min(left, viewportW - pickerW - margin);
  }
  left = Math.max(margin, left);

  const belowTop = Math.round(rect.bottom + gap);
  const aboveTop = Math.round(rect.top - pickerH - gap);
  const fitsBelow = pickerH > 0 ? belowTop + pickerH <= viewportH - margin : false;
  const fitsAbove = pickerH > 0 ? aboveTop >= margin : false;
  let top = belowTop;
  if (!fitsBelow && fitsAbove) {
    top = aboveTop;
  } else if (!fitsBelow && !fitsAbove && pickerH > 0 && viewportH > 0) {
    top = Math.max(margin, viewportH - pickerH - margin);
  }

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
}

function bindSearchPopover(searchWrapEl, searchInputEl, searchToggleEl) {
  if (!searchWrapEl || !searchInputEl || !searchToggleEl) return;
  const close = () => {
    searchWrapEl.hidden = true;
    searchWrapEl.classList.remove("open");
    searchToggleEl.setAttribute("aria-expanded", "false");
    searchToggleEl.setAttribute("aria-label", "Open message search");
  };
  const open = () => {
    searchWrapEl.hidden = false;
    requestAnimationFrame(() => searchWrapEl.classList.add("open"));
    searchToggleEl.setAttribute("aria-expanded", "true");
    searchToggleEl.setAttribute("aria-label", "Close message search");
    searchInputEl.focus();
    searchInputEl.select();
  };
  searchToggleEl.addEventListener("click", () => {
    if (searchWrapEl.hidden) {
      open();
      return;
    }
    close();
  });
  searchInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });
}

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
  if (!(target instanceof Element)) return false;

  const reactBtn = target.closest("button[data-react-msg]");
  if (reactBtn) {
    const id = reactBtn.getAttribute("data-react-msg") || "";
    if (!id) return true;
    openReactionPicker(reactBtn, id);
    return true;
  }

  const reactChip = target.closest("button[data-react-toggle]");
  if (reactChip) {
    const id = reactChip.getAttribute("data-react-toggle") || "";
    const emoji = reactChip.getAttribute("data-react-emoji") || "";
    if (!id || !emoji) return true;
    const mine = myReactions.get(id) || {};
    // Treat chip clicks as "join this reaction" so counts stack naturally.
    // If already reacted, ignore instead of toggling off.
    if (mine[emoji]) return true;
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
