/* =========================================================
   Influencer & Contract Manager v4
   Features: CSV import, sort, search highlight, My TG autofill, History log
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "inf_contract_manager_v6";
  const THEME_KEY = "inf_contract_theme";
  const PREFS_KEY = "inf_contract_prefs";
  const HISTORY_KEY = "inf_contract_history";
  const HISTORY_LIMIT = 500;

  const STATES = ["Pending", "Done", "Account banned", "In progress"];
  const STATE_CLASS = {
    "Done": "state-done",
    "Account banned": "state-banned",
    "Pending": "state-pending",
    "In progress": "state-progress"
  };

  let data = { influencers: [], contracts: [] };
  let history = [];
  let prefs = { lastMyTg: "" };
  let editing = null;
  let lastDeleted = null;
  let lastSavedAt = null;
  let activeTab = "influencers";
  let csvImportTarget = null; // "influencers" | "contracts"

  const infSort = { key: null, dir: 1 };
  const conSort = { key: null, dir: 1 };

  /* ---------- HELPERS ---------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escAndHighlight(s, filter) {
    const safe = esc(s);
    if (!filter) return safe;
    const re = new RegExp("(" + filter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return safe.replace(re, '<mark class="hl">$1</mark>');
  }

  function svgIcon(name, size = 16) {
    return `<svg class="icon-svg" width="${size}" height="${size}"><use href="#i-${name}"/></svg>`;
  }

  function todaySlug() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}-${dd}-${d.getFullYear()}`;
  }

  function nowStamp() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${mm}-${dd}-${d.getFullYear()} ${hh}:${mi}`;
  }

  function relativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  /* ---------- HISTORY LOG ---------- */
  function logHistory(type, title, details) {
    history.unshift({
      id: Date.now() + Math.random(),
      ts: Date.now(),
      type,
      title,
      details: details || ""
    });
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch(e){}
    renderHistoryBadge();
    if (activeTab === "history") renderHistory();
  }

  function renderHistoryBadge() {
    const el = $("#histBadge");
    if (el) el.textContent = history.length;
  }

  function renderHistory() {
    const list = $("#histList");
    if (!list) return;
    const filter = ($("#histSearch")?.value || "").toLowerCase();
    const typeFilter = $("#histTypeFilter")?.value || "";

    list.innerHTML = "";
    const items = history.filter(h => {
      if (typeFilter && h.type !== typeFilter) return false;
      if (filter) {
        const hay = (h.title + " " + h.details).toLowerCase();
        if (!hay.includes(filter)) return false;
      }
      return true;
    });

    if (!items.length) {
      list.innerHTML = `
        <div class="hist-empty">
          ${svgIcon("clock", 48)}
          <h3>No activity yet</h3>
          <p>Your actions will show up here.</p>
        </div>`;
      return;
    }

    const iconName = {
      add: "plus", edit: "edit", delete: "trash",
      import: "upload", restore: "undo"
    };

    items.forEach(h => {
      const el = document.createElement("div");
      el.className = "hist-item";
      el.innerHTML = `
        <div class="hist-icon type-${h.type}">${svgIcon(iconName[h.type] || "check", 16)}</div>
        <div class="hist-body">
          <div class="hist-title">${esc(h.title)}</div>
          ${h.details ? `<div class="hist-details">${esc(h.details)}</div>` : ""}
          <div class="hist-time">
            ${svgIcon("clock", 12)}
            <span title="${new Date(h.ts).toLocaleString()}">${relativeTime(h.ts)}</span>
          </div>
        </div>`;
      list.appendChild(el);
    });
  }

  /* ---------- TOAST ---------- */
  let toastTimer;
  function toast(msg, opts = {}) {
    const el = $("#toast");
    const msgEl = $("#toastMsg");
    const iconEl = el.querySelector(".toast-icon");
    const actionBtn = $("#toastAction");
    if (!el) return;

    msgEl.textContent = msg;
    if (iconEl) {
      iconEl.innerHTML = `<use href="#i-${opts.icon || "check"}"/>`;
      iconEl.style.color = opts.icon === "trash" ? "var(--danger)" : "var(--success)";
    }

    if (opts.actionLabel && typeof opts.onAction === "function") {
      actionBtn.hidden = false;
      actionBtn.querySelector("span").textContent = opts.actionLabel;
      actionBtn.onclick = () => {
        opts.onAction();
        hideToast();
      };
    } else {
      actionBtn.hidden = true;
      actionBtn.onclick = null;
    }

    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, opts.duration || 2600);
  }
  function hideToast() {
    const el = $("#toast");
    if (el) el.classList.remove("show");
  }

  /* ---------- STATUS BAR ---------- */
  function updateStatus(text) {
    const el = $("#statusText");
    if (el && text) el.textContent = text;
  }
  function updateLastSaved() {
    const el = $("#lastSavedText");
    if (!el) return;
    if (!lastSavedAt) { el.textContent = "Not saved yet"; return; }
    el.textContent = "Saved " + relativeTime(lastSavedAt);
  }
  setInterval(updateLastSaved, 5000);

  /* ---------- THEME ---------- */
  function initTheme() {
    let saved = localStorage.getItem(THEME_KEY);
    if (!saved) {
      saved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(saved);
    const btn = $("#themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const cur = document.documentElement.getAttribute("data-theme");
        const next = cur === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
      });
    }
  }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
  }

  /* ---------- PREFS ---------- */
  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) prefs = Object.assign(prefs, JSON.parse(raw));
    } catch(e){}
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch(e){}
  }

  /* ---------- STORAGE ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) { console.warn("Load failed", e); }
    if (!data || typeof data !== "object") data = { influencers: [], contracts: [] };
    if (!Array.isArray(data.influencers)) data.influencers = [];
    if (!Array.isArray(data.contracts)) data.contracts = [];

    try {
      const rawH = localStorage.getItem(HISTORY_KEY);
      if (rawH) history = JSON.parse(rawH);
    } catch(e){}
    if (!Array.isArray(history)) history = [];
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      lastSavedAt = Date.now();
      updateLastSaved();
    } catch (e) { console.warn("Save failed", e); }
    renderCounts();
  }
  function renderCounts() {
    const a = $("#infBadge"); const b = $("#conBadge");
    if (a) a.textContent = data.influencers.length;
    if (b) b.textContent = data.contracts.length;
    renderHistoryBadge();
  }

  /* ---------- TABS ---------- */
  function initTabs() {
    $$(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        const next = tab.dataset.tab;
        if (next === activeTab) return;
        $$(".tab").forEach(t => t.classList.remove("active"));
        $$(".tab-content").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const target = document.getElementById(next);
        if (target) target.classList.add("active");
        activeTab = next;
        const label = { influencers: "Influencers", contracts: "Contracts", history: "History" }[next];
        updateStatus(label);
        if (next === "influencers") renderInfluencers();
        else if (next === "contracts") renderContracts();
        else renderHistory();
      });
    });
  }

  /* ---------- SORT HELPERS ---------- */
  function sortedData(arr, sortState) {
    if (!sortState.key) return arr;
    const { key, dir } = sortState;
    return arr.map((row, idx) => ({ row, idx }))
      .sort((a, b) => {
        const av = (a.row[key] || "").toString().toLowerCase();
        const bv = (b.row[key] || "").toString().toLowerCase();
        if (av < bv) return -1 * dir;
        if (av > bv) return 1 * dir;
        return a.idx - b.idx;
      })
      .map(x => x.row);
  }

  function initSortHeaders() {
    // Influencers
    $$("#infTable thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (infSort.key === k) infSort.dir *= -1;
        else { infSort.key = k; infSort.dir = 1; }
        updateSortIcons("#infTable", infSort);
        renderInfluencers();
      });
    });
    // Contracts
    $$("#conTable thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (conSort.key === k) conSort.dir *= -1;
        else { conSort.key = k; conSort.dir = 1; }
        updateSortIcons("#conTable", conSort);
        renderContracts();
      });
    });
  }

  function updateSortIcons(tableSel, sortState) {
    $$(tableSel + " thead th[data-sort]").forEach(th => {
      th.classList.remove("sorted-asc", "sorted-desc");
      const use = th.querySelector(".sort-icon use");
      if (use) use.setAttribute("href", "#i-sort");
      if (th.dataset.sort === sortState.key) {
        th.classList.add(sortState.dir === 1 ? "sorted-asc" : "sorted-desc");
        if (use) use.setAttribute("href", sortState.dir === 1 ? "#i-sort-asc" : "#i-sort-desc");
      }
    });
  }

  /* ============ INFLUENCERS ============ */
  function addInfluencer() {
    data.influencers.push({ tg: "", fbName: "", fbLink: "", notes: "" });
    save();
    renderInfluencers();
    logHistory("add", "Added influencer", "");
    toast("Influencer added");
  }

  function delInfluencer(i) {
    const row = data.influencers[i];
    if (!row) return;
    lastDeleted = { type: "influencer", row: { ...row }, index: i };
    data.influencers.splice(i, 1);
    save();
    renderInfluencers();
    logHistory("delete", "Deleted influencer", row.tg || row.fbName || "(blank)");
    toast("Influencer deleted", {
      icon: "trash", actionLabel: "Undo", duration: 6000, onAction: undoDelete
    });
  }

  function undoDelete() {
    if (!lastDeleted) return;
    const { type, row, index } = lastDeleted;
    if (type === "influencer") {
      data.influencers.splice(index, 0, row);
      save(); renderInfluencers();
    } else {
      data.contracts.splice(index, 0, row);
      save(); renderContracts();
    }
    logHistory("restore", "Undid delete", row.tg || row.agentLine || "");
    lastDeleted = null;
    toast("Restored");
  }

  function renderInfluencers() {
    const filter = ($("#infSearch")?.value || "").toLowerCase();
    const tbody = $("#infTable tbody");
    const cards = $("#infCards");
    const empty = $("#infEmpty");
    const wrap = $("#influencers .table-wrap");
    if (!tbody || !cards) return;
    tbody.innerHTML = ""; cards.innerHTML = "";

    let visible = 0;
    const rows = sortedData(data.influencers, infSort);

    rows.forEach((row) => {
      const i = data.influencers.indexOf(row);
      const hay = [row.tg, row.fbName, row.fbLink, row.notes]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      // Desktop row
      const tr = document.createElement("tr");
      ["tg", "fbName", "fbLink", "notes"].forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.k = k;
        td.dataset.raw = row[k] || "";
        td.innerHTML = escAndHighlight(row[k], filter);
        td.addEventListener("blur", () => {
          const newVal = td.innerText.trim();
          if (data.influencers[i][k] !== newVal) {
            const oldVal = data.influencers[i][k] || "";
            data.influencers[i][k] = newVal;
            save();
            flashCell(td);
            logHistory("edit", `Edited influencer (${k})`, `${oldVal || "(blank)"} → ${newVal || "(blank)"}`);
          }
          td.innerHTML = escAndHighlight(data.influencers[i][k], filter);
        });
        td.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); }
        });
        tr.appendChild(td);
      });
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn"; delBtn.title = "Delete";
      delBtn.innerHTML = svgIcon("trash");
      delBtn.addEventListener("click", () => delInfluencer(i));
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);

      // Mobile card
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-head">
          <div class="card-body">
            <div class="card-title">${escAndHighlight(row.tg, filter) || "—"}</div>
            <div class="card-sub">${escAndHighlight(row.fbName, filter) || "No FB name"}</div>
          </div>
          <div class="card-actions">
            <button class="del-btn" title="Delete">${svgIcon("trash")}</button>
          </div>
        </div>
        ${row.fbLink ? `<div class="card-sub" style="margin-top:6px">${escAndHighlight(row.fbLink, filter)}</div>` : ""}
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".del-btn")) return;
        openInfluencerModal(i);
      });
      card.querySelector(".del-btn").addEventListener("click", (e) => {
        e.stopPropagation(); delInfluencer(i);
      });
      cards.appendChild(card);
    });

    // Empty states
    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        empty.querySelector("h3").textContent = filter ? "No matches" : "No influencers yet";
        empty.querySelector("p").innerHTML = filter
          ? `Nothing found for "<strong>${esc(filter)}</strong>".`
          : "Click <strong>Add Influencer</strong> or <strong>Import CSV</strong> to start.";
      } else {
        if (table) table.style.display = "";
        empty.hidden = true;
      }
    }
    if (visible === 0 && cards.parentElement) {
      cards.innerHTML = filter
        ? `<div class="empty-state"><h3>No matches</h3><p>Try a different search.</p></div>`
        : `<div class="empty-state"><h3>No influencers yet</h3><p>Tap <strong>Add Influencer</strong>.</p></div>`;
    }
  }

  /* ============ CONTRACTS ============ */
  function addContract() {
    const newRow = {
      agentLine: "", taskPosted: "", releaseTime: "", updateTime: "",
      contract: "", first: "", second: "", third: "",
      vloggerTg: "", domain: "", state: "Pending",
      myTg: prefs.lastMyTg || ""
    };
    data.contracts.push(newRow);
    save();
    renderContracts();
    logHistory("add", "Added contract", newRow.myTg ? `My TG: ${newRow.myTg}` : "");
    toast("Contract added");
  }

  function delContract(i) {
    const row = data.contracts[i];
    if (!row) return;
    lastDeleted = { type: "contract", row: { ...row }, index: i };
    data.contracts.splice(i, 1);
    save();
    renderContracts();
    logHistory("delete", "Deleted contract", row.agentLine || row.domain || "(blank)");
    toast("Contract deleted", {
      icon: "trash", actionLabel: "Undo", duration: 6000, onAction: undoDelete
    });
  }

  function renderContracts() {
    const filter = ($("#conSearch")?.value || "").toLowerCase();
    const tbody = $("#conTable tbody");
    const cards = $("#conCards");
    const empty = $("#conEmpty");
    const wrap = $("#contracts .table-wrap");
    if (!tbody || !cards) return;
    tbody.innerHTML = ""; cards.innerHTML = "";

    let visible = 0;
    const rows = sortedData(data.contracts, conSort);

    rows.forEach((row) => {
      const i = data.contracts.indexOf(row);
      const hay = [row.agentLine, row.vloggerTg, row.domain, row.myTg, row.contract, row.state]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      // Desktop row
      const tr = document.createElement("tr");
      const textFields = ["agentLine","taskPosted","releaseTime","updateTime","contract","first","second","third","vloggerTg","domain"];
      textFields.forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.k = k;
        td.innerHTML = escAndHighlight(row[k], filter);
        td.addEventListener("blur", () => {
          const newVal = td.innerText.trim();
          if (data.contracts[i][k] !== newVal) {
            const oldVal = data.contracts[i][k] || "";
            data.contracts[i][k] = newVal;
            save();
            flashCell(td);
            logHistory("edit", `Edited contract (${k})`, `${oldVal || "(blank)"} → ${newVal || "(blank)"}`);
          }
          td.innerHTML = escAndHighlight(data.contracts[i][k], filter);
        });
        td.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); }
        });
        tr.appendChild(td);
      });

      // State select
      const stateTd = document.createElement("td");
      const sel = document.createElement("select");
      sel.className = "state-select " + (STATE_CLASS[row.state] || "");
      STATES.forEach(s => {
        const opt = document.createElement("option");
        opt.value = s; opt.textContent = s;
        if (s === row.state) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", () => {
        const oldState = data.contracts[i].state;
        data.contracts[i].state = sel.value;
        sel.className = "state-select " + (STATE_CLASS[sel.value] || "");
        save();
        logHistory("edit", "Changed contract state", `${oldState} → ${sel.value}`);
      });
      stateTd.appendChild(sel);
      tr.appendChild(stateTd);

      // My TG
      const myTgTd = document.createElement("td");
      myTgTd.contentEditable = "true";
      myTgTd.dataset.k = "myTg";
      myTgTd.innerHTML = escAndHighlight(row.myTg, filter);
      myTgTd.addEventListener("blur", () => {
        const newVal = myTgTd.innerText.trim();
        if (data.contracts[i].myTg !== newVal) {
          const oldVal = data.contracts[i].myTg || "";
          data.contracts[i].myTg = newVal;
          if (newVal) { prefs.lastMyTg = newVal; savePrefs(); }
          save();
          flashCell(myTgTd);
          logHistory("edit", "Edited My TG", `${oldVal || "(blank)"} → ${newVal || "(blank)"}`);
        }
        myTgTd.innerHTML = escAndHighlight(data.contracts[i].myTg, filter);
      });
      myTgTd.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); myTgTd.blur(); }
      });
      tr.appendChild(myTgTd);

      // Delete
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn"; delBtn.title = "Delete";
      delBtn.innerHTML = svgIcon("trash");
      delBtn.addEventListener("click", () => delContract(i));
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);

      // Mobile card
      const card = document.createElement("div");
      card.className = "card";
      const metaRows = [
        ["Vlogger", row.vloggerTg],
        ["Contract", row.contract],
        ["Agent", row.agentLine],
        ["My TG", row.myTg]
      ].filter(([, v]) => v);
      card.innerHTML = `
        <div class="card-head">
          <div class="card-body">
            <div class="card-title">${escAndHighlight(row.domain, filter) || "—"}</div>
            ${row.taskPosted ? `<div class="card-sub">Task: ${escAndHighlight(row.taskPosted, filter)}</div>` : ""}
          </div>
          <div class="card-actions">
            <span class="state-badge ${STATE_CLASS[row.state] || ""}">${esc(row.state) || "Pending"}</span>
            <button class="del-btn" title="Delete">${svgIcon("trash")}</button>
          </div>
        </div>
        ${metaRows.length ? `
          <div class="card-meta">
            ${metaRows.map(([k, v]) => `
              <div class="card-meta-row">
                <strong>${k}</strong>
                <span>${escAndHighlight(v, filter)}</span>
              </div>`).join("")}
          </div>` : ""}
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".del-btn")) return;
        openContractModal(i);
      });
      card.querySelector(".del-btn").addEventListener("click", (e) => {
        e.stopPropagation(); delContract(i);
      });
      cards.appendChild(card);
    });

    // Empty states
    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        empty.querySelector("h3").textContent = filter ? "No matches" : "No contracts yet";
        empty.querySelector("p").innerHTML = filter
          ? `Nothing found for "<strong>${esc(filter)}</strong>".`
          : "Click <strong>Add Contract</strong> or <strong>Import CSV</strong>.";
      } else {
        if (table) table.style.display = "";
        empty.hidden = true;
      }
    }
    if (visible === 0 && cards.parentElement) {
      cards.innerHTML = filter
        ? `<div class="empty-state"><h3>No matches</h3><p>Try a different search.</p></div>`
        : `<div class="empty-state"><h3>No contracts yet</h3><p>Tap <strong>Add Contract</strong>.</p></div>`;
    }
  }

  function flashCell(td) {
    td.classList.remove("flash");
    void td.offsetWidth;
    td.classList.add("flash");
    setTimeout(() => td.classList.remove("flash"), 900);
  }

  /* ============ MODAL ============ */
  function openModal(title, fields, onSave) {
    editing = { onSave };
    const titleEl = $("#modalTitle");
    const body = $("#modalBody");
    if (!titleEl || !body) return;
    titleEl.textContent = title;
    body.innerHTML = "";

    fields.forEach(f => {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = f.label;
      wrap.appendChild(label);

      let input;
      if (f.type === "select") {
        input = document.createElement("select");
        (f.options || []).forEach(o => {
          const opt = document.createElement("option");
          opt.value = o; opt.textContent = o;
          if (o === f.value) opt.selected = true;
          input.appendChild(opt);
        });
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = f.value || "";
      }
      input.dataset.k = f.key;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); saveModal(); }
      });
      wrap.appendChild(input);
      body.appendChild(wrap);
    });

    const modal = $("#modal");
    if (modal) modal.hidden = false;
    const first = body.querySelector("input, select");
    if (first) setTimeout(() => first.focus(), 60);
  }

  function closeModal() {
    const modal = $("#modal");
    if (modal) modal.hidden = true;
    const body = $("#modalBody");
    if (body) body.innerHTML = "";
    editing = null;
  }

  function saveModal() {
    if (!editing || !editing.onSave) { closeModal(); return; }
    const values = {};
    $$("#modalBody [data-k]").forEach(el => {
      values[el.dataset.k] = (el.value || "").trim();
    });
    try { editing.onSave(values); }
    catch (e) { console.error("Save failed", e); toast("Save failed", { icon: "trash" }); return; }
    closeModal();
    toast("Saved");
  }

  function openInfluencerModal(i) {
    const row = data.influencers[i];
    if (!row) return;
    openModal("Edit Influencer", [
      { key: "tg",     label: "TG Username", value: row.tg },
      { key: "fbName", label: "FB Name",     value: row.fbName },
      { key: "fbLink", label: "FB Link",     value: row.fbLink },
      { key: "notes",  label: "Notes",       value: row.notes }
    ], (v) => {
      Object.assign(data.influencers[i], v);
      save(); renderInfluencers();
      logHistory("edit", "Edited influencer (modal)", row.tg || "(blank)");
    });
  }

  function openContractModal(i) {
    const row = data.contracts[i];
    if (!row) return;
    openModal("Edit Contract", [
      { key: "agentLine",   label: "Agent Line",         value: row.agentLine },
      { key: "taskPosted",  label: "Task Posted",        value: row.taskPosted },
      { key: "releaseTime", label: "Release Time",       value: row.releaseTime },
      { key: "updateTime",  label: "Update Time",        value: row.updateTime },
      { key: "contract",    label: "Contract",           value: row.contract },
      { key: "first",       label: "First Transaction",  value: row.first },
      { key: "second",      label: "Second Payment",     value: row.second },
      { key: "third",       label: "Third Payment",      value: row.third },
      { key: "vloggerTg",   label: "Vlogger's Telegram", value: row.vloggerTg },
      { key: "domain",      label: "Promotional Domain", value: row.domain },
      { key: "state",       label: "State", type: "select", options: STATES, value: row.state },
      { key: "myTg",        label: "My Telegram Name",   value: row.myTg }
    ], (v) => {
      Object.assign(data.contracts[i], v);
      if (v.myTg) { prefs.lastMyTg = v.myTg; savePrefs(); }
      save(); renderContracts();
      logHistory("edit", "Edited contract (modal)", row.agentLine || "(blank)");
    });
  }

  /* ============ CSV IMPORT ============ */
  function parseCSV(text) {
    // Handles quoted fields, commas inside quotes, newlines inside quotes
    const rows = [];
    let cur = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i+1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { cur.push(field); field = ""; }
        else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
        else if (c === "\r") { /* ignore */ }
        else field += c;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(r => r.some(v => v.trim() !== ""));
  }

  function openCsvModal(target) {
    csvImportTarget = target;
    const modal = $("#csvModal");
    const title = $("#csvModalTitle");
    const text = $("#csvText");
    const preview = $("#csvPreview");
    if (!modal) return;
    title.textContent = target === "influencers" ? "Import Influencers CSV" : "Import Contracts CSV";
    text.value = "";
    preview.textContent = "";
    modal.hidden = false;
    setTimeout(() => text.focus(), 60);
  }

  function closeCsvModal() {
    const modal = $("#csvModal");
    if (modal) modal.hidden = true;
    csvImportTarget = null;
  }

  function updateCsvPreview() {
    const preview = $("#csvPreview");
    const text = $("#csvText")?.value || "";
    if (!text.trim()) { preview.textContent = ""; return; }
    try {
      const rows = parseCSV(text);
      if (!rows.length) { preview.textContent = "No rows detected."; return; }
      const headers = rows[0];
      const count = rows.length - 1;
      preview.innerHTML = `Detected <strong>${count}</strong> row${count===1?"":"s"} with columns: <code>${headers.map(esc).join("</code> <code>")}</code>`;
    } catch(e) {
      preview.textContent = "Could not parse CSV.";
    }
  }

  function doCsvImport() {
    const text = $("#csvText")?.value || "";
    if (!text.trim()) { toast("Nothing to import", { icon: "trash" }); return; }
    const rows = parseCSV(text);
    if (rows.length < 2) { toast("Need headers + at least 1 row", { icon: "trash" }); return; }

    const headers = rows[0].map(h => h.trim().toLowerCase());
    const bodyRows = rows.slice(1);

    let imported = 0;

    if (csvImportTarget === "influencers") {
      const map = {
        "tg username": "tg", "tg": "tg", "telegram": "tg",
        "fb name": "fbName", "fb": "fbName", "facebook name": "fbName",
        "fb link": "fbLink", "link": "fbLink", "facebook link": "fbLink",
        "notes": "notes", "note": "notes"
      };
      bodyRows.forEach(r => {
        const obj = { tg: "", fbName: "", fbLink: "", notes: "" };
        headers.forEach((h, idx) => {
          const key = map[h];
          if (key) obj[key] = (r[idx] || "").trim();
        });
        if (Object.values(obj).some(v => v)) {
          data.influencers.push(obj);
          imported++;
        }
      });
    } else {
      const map = {
        "agent line": "agentLine", "agent": "agentLine",
        "task posted": "taskPosted", "task": "taskPosted",
        "release time": "releaseTime", "release": "releaseTime",
        "update time": "updateTime", "update": "updateTime",
        "contract": "contract",
        "first transaction": "first", "1st trans.": "first", "first": "first",
        "second payment": "second", "2nd pay": "second", "second": "second",
        "third payment": "third", "3rd pay": "third", "third": "third",
        "vlogger's telegram": "vloggerTg", "vlogger tg": "vloggerTg", "vlogger": "vloggerTg",
        "promotional domain": "domain", "domain": "domain",
        "state": "state",
        "my telegram name": "myTg", "my tg": "myTg", "my telegram": "myTg"
      };
      bodyRows.forEach(r => {
        const obj = {
          agentLine: "", taskPosted: "", releaseTime: "", updateTime: "",
          contract: "", first: "", second: "", third: "",
          vloggerTg: "", domain: "", state: "Pending", myTg: ""
        };
        headers.forEach((h, idx) => {
          const key = map[h];
          if (key) {
            const val = (r[idx] || "").trim();
            if (key === "state") {
              const found = STATES.find(s => s.toLowerCase() === val.toLowerCase());
              obj.state = found || "Pending";
            } else {
              obj[key] = val;
            }
          }
        });
        if (Object.values(obj).some(v => v && v !== "Pending")) {
          data.contracts.push(obj);
          imported++;
        }
      });
    }

    save();
    if (csvImportTarget === "influencers") renderInfluencers();
    else renderContracts();

    logHistory("import", `Imported ${imported} ${csvImportTarget} from CSV`, `Columns: ${headers.slice(0,5).join(", ")}${headers.length>5?"…":""}`);
    toast(`Imported ${imported} row${imported===1?"":"s"}`);
    closeCsvModal();
  }

  /* ============ EXCEL EXPORT ============ */
  function downloadExcel() {
    if (typeof XLSX === "undefined") {
      toast("Excel library failed to load", { icon: "trash" }); return;
    }
    const dateSlug = todaySlug();

    if (activeTab === "history") {
      // Export history as CSV
      exportHistoryCsv();
      return;
    }

    if (activeTab === "influencers") {
      if (!data.influencers.length) { toast("No influencers to export", { icon: "trash" }); return; }
      const rows = data.influencers.map(r => ({
        "TG Username": r.tg, "FB Name": r.fbName, "FB Link": r.fbLink, "Notes": r.notes
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Influencers");
      XLSX.writeFile(wb, `influencers ${dateSlug}.xlsx`);
      toast(`influencers ${dateSlug}.xlsx downloaded`);
    } else {
      if (!data.contracts.length) { toast("No contracts to export", { icon: "trash" }); return; }
      const rows = data.contracts.map(r => ({
        "Agent Line": r.agentLine, "Task Posted": r.taskPosted,
        "Release Time": r.releaseTime, "Update Time": r.updateTime,
        "Contract": r.contract, "First Transaction": r.first,
        "Second Payment": r.second, "Third Payment": r.third,
        "Vlogger's Telegram": r.vloggerTg, "Promotional Domain": r.domain,
        "State": r.state, "My Telegram Name": r.myTg
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Contracts");
      XLSX.writeFile(wb, `contracts ${dateSlug}.xlsx`);
      toast(`contracts ${dateSlug}.xlsx downloaded`);
    }
  }

  /* ============ HISTORY CSV ============ */
  function exportHistoryCsv() {
    if (!history.length) { toast("No history to export", { icon: "trash" }); return; }
    const header = "Timestamp,Type,Title,Details";
    const lines = history.map(h => {
      const t = new Date(h.ts).toLocaleString();
      const clean = (s) => `"${String(s||"").replace(/"/g, '""')}"`;
      return [clean(t), clean(h.type), clean(h.title), clean(h.details)].join(",");
    });
    const csv = header + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `history ${todaySlug()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("History CSV downloaded");
  }

  /* ============ JSON BACKUP ============ */
  function exportJson() {
    const payload = { ...data, _history: history, _prefs: prefs, _exportedAt: Date.now() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_${todaySlug()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast("Backup exported");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported.influencers) || !Array.isArray(imported.contracts)) {
          throw new Error("bad format");
        }
        if (confirm("Replace ALL current data with this backup?")) {
          data = { influencers: imported.influencers, contracts: imported.contracts };
          if (Array.isArray(imported._history)) history = imported._history;
          if (imported._prefs) prefs = Object.assign(prefs, imported._prefs);
          save(); savePrefs();
          try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch(e){}
          if (activeTab === "influencers") renderInfluencers();
          else if (activeTab === "contracts") renderContracts();
          else renderHistory();
          logHistory("restore", "Restored from backup", file.name);
          toast("Backup restored");
        }
      } catch (e) {
        toast("Invalid backup file", { icon: "trash" });
      }
    };
    reader.readAsText(file);
  }

  /* ============ INIT ============ */
  function init() {
    load();
    loadPrefs();
    initTheme();
    initTabs();
    initSortHeaders();

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };

    bind("addInfBtn", addInfluencer);
    bind("addConBtn", addContract);
    bind("downloadExcel", downloadExcel);
    bind("exportJson", exportJson);
    bind("modalCloseX", closeModal);
    bind("modalCancel", closeModal);
    bind("modalSave", saveModal);

    // CSV
    bind("csvModalClose", closeCsvModal);
    bind("csvModalCancel", closeCsvModal);
    bind("csvModalImport", doCsvImport);
    bind("exportHistCsv", exportHistoryCsv);
    bind("clearHist", () => {
      if (!history.length) { toast("History already empty"); return; }
      if (confirm("Clear ALL history? This cannot be undone.")) {
        history = [];
        try { localStorage.setItem(HISTORY_KEY, "[]"); } catch(e){}
        renderHistory(); renderHistoryBadge();
        toast("History cleared");
      }
    });

    const importInput = $("#importJson");
    if (importInput) {
      importInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) importJson(file);
        e.target.value = "";
      });
    }

    const importInfCsv = $("#importInfCsv");
    if (importInfCsv) {
      importInfCsv.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const r = new FileReader();
          r.onload = (ev) => {
            openCsvModal("influencers");
            const textEl = $("#csvText");
            if (textEl) { textEl.value = ev.target.result; updateCsvPreview(); }
          };
          r.readAsText(file);
        }
        e.target.value = "";
      });
    }

    const importConCsv = $("#importConCsv");
    if (importConCsv) {
      importConCsv.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) {
          const r = new FileReader();
          r.onload = (ev) => {
            openCsvModal("contracts");
            const textEl = $("#csvText");
            if (textEl) { textEl.value = ev.target.result; updateCsvPreview(); }
          };
          r.readAsText(file);
        }
        e.target.value = "";
      });
    }

    const csvText = $("#csvText");
    if (csvText) csvText.addEventListener("input", updateCsvPreview);

    const infSearch = $("#infSearch");
    if (infSearch) infSearch.addEventListener("input", renderInfluencers);
    const conSearch = $("#conSearch");
    if (conSearch) conSearch.addEventListener("input", renderContracts);

    const histSearch = $("#histSearch");
    if (histSearch) histSearch.addEventListener("input", renderHistory);
    const histTypeFilter = $("#histTypeFilter");
    if (histTypeFilter) histTypeFilter.addEventListener("change", renderHistory);

    const modal = $("#modal");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    const csvModal = $("#csvModal");
    if (csvModal) csvModal.addEventListener("click", (e) => { if (e.target === csvModal) closeCsvModal(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal && !modal.hidden) { closeModal(); return; }
        if (csvModal && !csvModal.hidden) { closeCsvModal(); return; }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const active = document.querySelector(".tab-content.active");
        const s = active?.querySelector(".search");
        if (s) s.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && lastDeleted) {
        e.preventDefault();
        undoDelete();
      }
    });

    renderCounts();
    renderInfluencers();
    renderHistoryBadge();
    updateLastSaved();
    updateStatus("Influencers");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
