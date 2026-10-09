/* =========================================================
   Influencer & Contract Manager v3.1
   ========================================================= */
(function () {
  "use strict";

  const STORAGE_KEY = "inf_contract_manager_v5";
  const THEME_KEY = "inf_contract_theme";
  const STATES = ["Pending", "Done", "Account banned", "In progress"];
  const STATE_CLASS = {
    "Done": "state-done",
    "Account banned": "state-banned",
    "Pending": "state-pending",
    "In progress": "state-progress"
  };

  let data = { influencers: [], contracts: [] };
  let editing = null;
  let lastDeleted = null;
  let lastSavedAt = null;
  let activeTab = "influencers";

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

  function svgIcon(name, size = 16) {
    return `<svg class="icon-svg" width="${size}" height="${size}"><use href="#i-${name}"/></svg>`;
  }

  /* ---------- DATE UTILS ---------- */
  // Returns MM-DD-YYYY
  function todaySlug() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}-${dd}-${yyyy}`;
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
    const diff = Math.floor((Date.now() - lastSavedAt) / 1000);
    if (diff < 5) el.textContent = "Saved just now";
    else if (diff < 60) el.textContent = `Saved ${diff}s ago`;
    else if (diff < 3600) el.textContent = `Saved ${Math.floor(diff/60)}m ago`;
    else el.textContent = `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}`;
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
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
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
    const a = $("#infBadge");
    const b = $("#conBadge");
    if (a) a.textContent = data.influencers.length;
    if (b) b.textContent = data.contracts.length;
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
        updateStatus(next === "influencers" ? "Influencers" : "Contracts");

        // Render ONLY the newly active tab
        if (next === "influencers") renderInfluencers();
        else renderContracts();
      });
    });
  }

  /* ============ INFLUENCERS ============ */
  function addInfluencer() {
    data.influencers.push({ tg: "", fbName: "", fbLink: "", notes: "" });
    save();
    renderInfluencers();
    toast("Influencer added");
  }

  function delInfluencer(i) {
    const row = data.influencers[i];
    if (!row) return;
    lastDeleted = { type: "influencer", row: { ...row }, index: i };
    data.influencers.splice(i, 1);
    save();
    renderInfluencers();
    toast("Influencer deleted", {
      icon: "trash",
      actionLabel: "Undo",
      duration: 6000,
      onAction: undoDelete
    });
  }

  function undoDelete() {
    if (!lastDeleted) return;
    const { type, row, index } = lastDeleted;
    if (type === "influencer") {
      data.influencers.splice(index, 0, row);
      save();
      renderInfluencers();
    } else if (type === "contract") {
      data.contracts.splice(index, 0, row);
      save();
      renderContracts();
    }
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
    tbody.innerHTML = "";
    cards.innerHTML = "";

    let visible = 0;

    data.influencers.forEach((row, i) => {
      const hay = [row.tg, row.fbName, row.fbLink, row.notes]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      // Desktop row (NO "Date Added" column)
      const tr = document.createElement("tr");
      ["tg", "fbName", "fbLink", "notes"].forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.k = k;
        td.innerText = row[k] || "";
        td.addEventListener("blur", () => {
          if (data.influencers[i][k] !== td.innerText.trim()) {
            data.influencers[i][k] = td.innerText.trim();
            save();
            flashCell(td);
          }
        });
        td.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); }
        });
        tr.appendChild(td);
      });
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.title = "Delete";
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
            <div class="card-title">${esc(row.tg) || "—"}</div>
            <div class="card-sub">${esc(row.fbName) || "No FB name"}</div>
          </div>
          <div class="card-actions">
            <button class="del-btn" title="Delete">${svgIcon("trash")}</button>
          </div>
        </div>
        ${row.fbLink ? `<div class="card-sub" style="margin-top:6px">${esc(row.fbLink)}</div>` : ""}
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".del-btn")) return;
        openInfluencerModal(i);
      });
      card.querySelector(".del-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        delInfluencer(i);
      });
      cards.appendChild(card);
    });

    // Desktop empty state
    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        if (filter) {
          empty.querySelector("h3").textContent = "No matches";
          empty.querySelector("p").innerHTML = `Nothing found for "<strong>${esc(filter)}</strong>".`;
        } else {
          empty.querySelector("h3").textContent = "No influencers yet";
          empty.querySelector("p").innerHTML = "Click <strong>Add Influencer</strong> to start tracking prospects.";
        }
      } else {
        if (table) table.style.display = "";
        empty.hidden = true;
      }
    }

    // Mobile empty state
    if (visible === 0 && cards.parentElement) {
      cards.innerHTML = filter
        ? `<div class="empty-state"><h3>No matches</h3><p>Try a different search.</p></div>`
        : `<div class="empty-state"><h3>No influencers yet</h3><p>Tap <strong>Add Influencer</strong> to begin.</p></div>`;
    }
  }

  /* ============ CONTRACTS ============ */
  function addContract() {
    data.contracts.push({
      agentLine: "", taskPosted: "", releaseTime: "", updateTime: "",
      contract: "", first: "", second: "", third: "",
      vloggerTg: "", domain: "", state: "Pending", myTg: ""
    });
    save();
    renderContracts();
    toast("Contract added");
  }

  function delContract(i) {
    const row = data.contracts[i];
    if (!row) return;
    lastDeleted = { type: "contract", row: { ...row }, index: i };
    data.contracts.splice(i, 1);
    save();
    renderContracts();
    toast("Contract deleted", {
      icon: "trash",
      actionLabel: "Undo",
      duration: 6000,
      onAction: undoDelete
    });
  }

  function renderContracts() {
    const filter = ($("#conSearch")?.value || "").toLowerCase();
    const tbody = $("#conTable tbody");
    const cards = $("#conCards");
    const empty = $("#conEmpty");
    const wrap = $("#contracts .table-wrap");
    if (!tbody || !cards) return;
    tbody.innerHTML = "";
    cards.innerHTML = "";

    let visible = 0;

    data.contracts.forEach((row, i) => {
      const hay = [row.agentLine, row.vloggerTg, row.domain, row.myTg, row.contract, row.state]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      // Desktop row
      const tr = document.createElement("tr");
      const textFields = [
        "agentLine", "taskPosted", "releaseTime", "updateTime", "contract",
        "first", "second", "third", "vloggerTg", "domain"
      ];
      textFields.forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.k = k;
        td.innerText = row[k] || "";
        td.addEventListener("blur", () => {
          if (data.contracts[i][k] !== td.innerText.trim()) {
            data.contracts[i][k] = td.innerText.trim();
            save();
            flashCell(td);
          }
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
        opt.value = s;
        opt.textContent = s;
        if (s === row.state) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener("change", () => {
        data.contracts[i].state = sel.value;
        sel.className = "state-select " + (STATE_CLASS[sel.value] || "");
        save();
      });
      stateTd.appendChild(sel);
      tr.appendChild(stateTd);

      // My TG
      const myTgTd = document.createElement("td");
      myTgTd.contentEditable = "true";
      myTgTd.dataset.k = "myTg";
      myTgTd.innerText = row.myTg || "";
      myTgTd.addEventListener("blur", () => {
        if (data.contracts[i].myTg !== myTgTd.innerText.trim()) {
          data.contracts[i].myTg = myTgTd.innerText.trim();
          save();
          flashCell(myTgTd);
        }
      });
      myTgTd.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); myTgTd.blur(); }
      });
      tr.appendChild(myTgTd);

      // Delete
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.title = "Delete";
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
        ["My TG", row.myTg],
      ].filter(([, v]) => v);

      card.innerHTML = `
        <div class="card-head">
          <div class="card-body">
            <div class="card-title">${esc(row.domain) || "—"}</div>
            ${row.taskPosted ? `<div class="card-sub">Task: ${esc(row.taskPosted)}</div>` : ""}
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
                <span>${esc(v)}</span>
              </div>`).join("")}
          </div>` : ""}
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest(".del-btn")) return;
        openContractModal(i);
      });
      card.querySelector(".del-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        delContract(i);
      });
      cards.appendChild(card);
    });

    // Desktop empty state
    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        if (filter) {
          empty.querySelector("h3").textContent = "No matches";
          empty.querySelector("p").innerHTML = `Nothing found for "<strong>${esc(filter)}</strong>".`;
        } else {
          empty.querySelector("h3").textContent = "No contracts yet";
          empty.querySelector("p").innerHTML = "Click <strong>Add Contract</strong> to create your first entry.";
        }
      } else {
        if (table) table.style.display = "";
        empty.hidden = true;
      }
    }

    // Mobile empty state
    if (visible === 0 && cards.parentElement) {
      cards.innerHTML = filter
        ? `<div class="empty-state"><h3>No matches</h3><p>Try a different search.</p></div>`
        : `<div class="empty-state"><h3>No contracts yet</h3><p>Tap <strong>Add Contract</strong> to begin.</p></div>`;
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
          opt.value = o;
          opt.textContent = o;
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
    try {
      editing.onSave(values);
    } catch (e) {
      console.error("Save failed", e);
      toast("Save failed", { icon: "trash" });
      return;
    }
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
      save();
      renderInfluencers();
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
      save();
      renderContracts();
    });
  }

  /* ============ EXCEL EXPORT ============ */
  function downloadExcel() {
    if (typeof XLSX === "undefined") {
      toast("Excel library failed to load", { icon: "trash" });
      return;
    }

    const dateSlug = todaySlug();

    if (activeTab === "influencers") {
      if (!data.influencers.length) {
        toast("No influencers to export", { icon: "trash" });
        return;
      }
      // NO "Date Added" column — only what's in the table
      const rows = data.influencers.map(r => ({
        "TG Username": r.tg,
        "FB Name": r.fbName,
        "FB Link": r.fbLink,
        "Notes": r.notes
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Influencers");
      XLSX.writeFile(wb, `influencers ${dateSlug}.xlsx`);
      toast(`influencers ${dateSlug}.xlsx downloaded`);
    } else {
      if (!data.contracts.length) {
        toast("No contracts to export", { icon: "trash" });
        return;
      }
      const rows = data.contracts.map(r => ({
        "Agent Line": r.agentLine,
        "Task Posted": r.taskPosted,
        "Release Time": r.releaseTime,
        "Update Time": r.updateTime,
        "Contract": r.contract,
        "First Transaction": r.first,
        "Second Payment": r.second,
        "Third Payment": r.third,
        "Vlogger's Telegram": r.vloggerTg,
        "Promotional Domain": r.domain,
        "State": r.state,
        "My Telegram Name": r.myTg
      }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Contracts");
      XLSX.writeFile(wb, `contracts ${dateSlug}.xlsx`);
      toast(`contracts ${dateSlug}.xlsx downloaded`);
    }
  }

  /* ============ JSON BACKUP ============ */
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_${todaySlug()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
          data = imported;
          save();
          // Only render the active tab
          if (activeTab === "influencers") renderInfluencers();
          else renderContracts();
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
    initTheme();
    initTabs();

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

    const importInput = $("#importJson");
    if (importInput) {
      importInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (file) importJson(file);
        e.target.value = "";
      });
    }

    const infSearch = $("#infSearch");
    if (infSearch) infSearch.addEventListener("input", renderInfluencers);

    const conSearch = $("#conSearch");
    if (conSearch) conSearch.addEventListener("input", renderContracts);

    const modal = $("#modal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && modal && !modal.hidden) {
        closeModal();
        return;
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

    // Render ONLY the active tab initially
    renderCounts();
    renderInfluencers();   // activeTab defaults to "influencers"
    updateLastSaved();
    updateStatus("Influencers");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
