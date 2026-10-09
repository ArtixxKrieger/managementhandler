/* =========================================================
   Influencer & Contract Manager  v2
   ========================================================= */

(function () {
  "use strict";

  const STORAGE_KEY = "inf_contract_manager_v4";
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

  /* ---------- HELPERS ---------- */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
  }

  /* ---------- THEME ---------- */
  function initTheme() {
    const saved = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(saved);

    const btn = $("#themeToggle");
    if (btn) {
      btn.addEventListener("click", () => {
        const current = document.documentElement.getAttribute("data-theme");
        const next = current === "dark" ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(THEME_KEY, next);
      });
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const icon = $("#themeIcon");
    if (icon) icon.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  /* ---------- STORAGE ---------- */
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) data = JSON.parse(raw);
    } catch (e) {
      console.warn("Load failed", e);
    }
    if (!data || !Array.isArray(data.influencers)) data = { influencers: [], contracts: [] };
    if (!Array.isArray(data.contracts)) data.contracts = [];
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("Save failed", e);
    }
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
        $$(".tab").forEach(t => t.classList.remove("active"));
        $$(".tab-content").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add("active");
      });
    });
  }

  /* ========== INFLUENCERS ========== */
  function addInfluencer() {
    data.influencers.push({
      date: new Date().toLocaleDateString(),
      tg: "", fbName: "", fbLink: "", notes: ""
    });
    save();
    renderInfluencers();
    toast("Influencer added");
  }

  function delInfluencer(i) {
    if (!confirm("Delete this influencer?")) return;
    data.influencers.splice(i, 1);
    save();
    renderInfluencers();
    toast("Deleted");
  }

  function renderInfluencers() {
    const filter = ($("#infSearch")?.value || "").toLowerCase();
    const tbody = $("#infTable tbody");
    const cards = $("#infCards");
    if (!tbody || !cards) return;
    tbody.innerHTML = "";
    cards.innerHTML = "";

    data.influencers.forEach((row, i) => {
      const hay = [row.tg, row.fbName, row.fbLink, row.notes]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;

      // Desktop row
      const tr = document.createElement("tr");
      const fields = ["date", "tg", "fbName", "fbLink", "notes"];
      fields.forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true";
        td.dataset.k = k;
        td.innerText = row[k] || "";
        td.addEventListener("blur", () => {
          data.influencers[i][k] = td.innerText.trim();
          save();
        });
        tr.appendChild(td);
      });
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => delInfluencer(i));
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);
      tbody.appendChild(tr);

      // Mobile card
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-head">
          <div class="card-title">${esc(row.tg) || "—"}</div>
          <button class="del-btn">✕</button>
        </div>
        <div class="card-sub">${esc(row.fbName) || "No FB name"}</div>
        <div class="card-sub">${esc(row.fbLink) || "No link"}</div>
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
  }

  /* ========== CONTRACTS ========== */
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
    if (!confirm("Delete this contract?")) return;
    data.contracts.splice(i, 1);
    save();
    renderContracts();
    toast("Deleted");
  }

  function renderContracts() {
    const filter = ($("#conSearch")?.value || "").toLowerCase();
    const tbody = $("#conTable tbody");
    const cards = $("#conCards");
    if (!tbody || !cards) return;
    tbody.innerHTML = "";
    cards.innerHTML = "";

    data.contracts.forEach((row, i) => {
      const hay = [row.agentLine, row.vloggerTg, row.domain, row.myTg, row.contract, row.state]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;

      // ----- Desktop row -----
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
          data.contracts[i][k] = td.innerText.trim();
          save();
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
        data.contracts[i].myTg = myTgTd.innerText.trim();
        save();
      });
      tr.appendChild(myTgTd);

      // Delete
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn";
      delBtn.textContent = "✕";
      delBtn.addEventListener("click", () => delContract(i));
      delTd.appendChild(delBtn);
      tr.appendChild(delTd);

      tbody.appendChild(tr);

      // ----- Mobile card -----
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-head">
          <div>
            <div class="card-title">${esc(row.agentLine) || "—"}</div>
            <div class="card-sub">${esc(row.domain) || "No domain"}</div>
          </div>
          <span class="state-badge ${STATE_CLASS[row.state] || ""}">${esc(row.state) || "Pending"}</span>
        </div>
        <div class="card-sub" style="margin-top:6px;">
          Vlogger: ${esc(row.vloggerTg) || "—"} · Contract: ${esc(row.contract) || "—"}
        </div>
      `;
      card.addEventListener("click", () => openContractModal(i));
      cards.appendChild(card);
    });
  }

  /* ========== MODAL ========== */
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
      wrap.appendChild(input);
      body.appendChild(wrap);
    });

    const modal = $("#modal");
    if (modal) modal.hidden = false;

    const first = body.querySelector("input, select");
    if (first) setTimeout(() => first.focus(), 50);
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
      toast("Save failed");
      return;
    }
    closeModal();
    toast("Saved");
  }

  function openInfluencerModal(i) {
    const row = data.influencers[i];
    if (!row) return;
    openModal("Edit Influencer", [
      { key: "date",   label: "Date Added",  value: row.date },
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

  /* ========== EXCEL ========== */
  function downloadExcel() {
    if (!data.influencers.length && !data.contracts.length) {
      toast("Nothing to export");
      return;
    }
    if (typeof XLSX === "undefined") {
      alert("Excel library failed to load. Check your internet connection.");
      return;
    }
    const wb = XLSX.utils.book_new();

    const infData = data.influencers.map(r => ({
      "Date Added": r.date, "TG Username": r.tg, "FB Name": r.fbName,
      "FB Link": r.fbLink, "Notes": r.notes
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(infData), "Influencers");

    const conData = data.contracts.map(r => ({
      "Agent Line": r.agentLine, "Task Posted": r.taskPosted,
      "Release Time": r.releaseTime, "Update Time": r.updateTime,
      "Contract": r.contract, "First Transaction": r.first,
      "Second Payment": r.second, "Third Payment": r.third,
      "Vlogger's Telegram": r.vloggerTg, "Promotional Domain": r.domain,
      "State": r.state, "My Telegram Name": r.myTg
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(conData), "Contracts");

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `Influencer_Contracts_${today}.xlsx`);
    toast("Excel downloaded");
  }

  /* ========== JSON ========== */
  function exportJson() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
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
          renderInfluencers();
          renderContracts();
          toast("Backup restored");
        }
      } catch (e) {
        alert("Invalid backup file.");
      }
    };
    reader.readAsText(file);
  }

  /* ========== INIT ========== */
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
      if (e.key === "Escape" && modal && !modal.hidden) closeModal();
    });

    renderInfluencers();
    renderContracts();
    renderCounts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
