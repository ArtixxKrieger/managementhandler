(function () {
  "use strict";

  const STORAGE_KEY = "inf_contract_manager_v6";
  const LEGACY_KEYS = ["inf_contract_manager_v5", "inf_contract_manager_v4", "inf_contract_manager_v3"];
  const MIRROR_KEY = "inf_contract_manager_backup";
  const THEME_KEY = "inf_contract_theme";
  const PREFS_KEY = "inf_contract_prefs";
  const HISTORY_KEY = "inf_contract_history";
  const HISTORY_KEY_ALT = "inf_contract_manager_history";
  const BACKUP_TS_KEY = "inf_contract_last_backup_ts";
  const DAILY_RESET_KEY = "inf_contract_last_inf_reset";
  const HISTORY_LIMIT = 20000;

  const STATES = ["Pending", "Done", "Account banned", "In progress", "Scammer"];
  const STATE_CLASS = {
    "Done": "state-done",
    "Account banned": "state-banned",
    "Pending": "state-pending",
    "In progress": "state-progress",
    "Scammer": "state-scammer"
  };

  const INF_FIELDS = ["fbName", "fbLink", "telegram", "offerStatus", "phone", "date", "accountName"];
  const INF_DUP_FIELDS = ["fbLink", "telegram", "fbName"];
  
  const CON_TEXT_FIELDS = ["agentLine", "taskPosted", "releaseTime", "time", "contract", "first", "second", "third", "vloggerTg", "domain"];
  const CON_DUP_FIELDS = [];

  let data = { influencers: [], contracts: [] };
  let history = [];
  let prefs = { lastMyTg: "" };
  let editing = null;
  let lastDeleted = null;
  let lastSavedAt = null;
  let activeTab = "influencers";
  let csvImportTarget = null;
  const pickedHistoryIds = new Set();

  let histView = "days";
  let histSelectedDay = null;
  let histDetailFilter = "all";
  let histDaysShown = 30;

  const infSort = { key: null, dir: 1 };
  const conSort = { key: null, dir: 1 };

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  function uid() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  function pad(n) { return String(n).padStart(2, "0"); }
  function todaySlug() {
    const d = new Date();
    return `${pad(d.getMonth()+1)}-${pad(d.getDate())}-${d.getFullYear()}`;
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }
  function todayKey() { return dayKey(Date.now()); }
  function displayDay(dateKey) {
    const [y, m, d] = dateKey.split("-");
    return `${m}-${d}-${y}`;
  }
  function relativeTime(ts) {
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff/86400)}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function norm(v) {
    return String(v == null ? "" : v).trim().toLowerCase();
  }

  function dupSet(rows, fields) {
    const out = {};
    if (!fields.length) return out;
    const map = {};
    fields.forEach(f => { map[f] = new Map(); });
    rows.forEach(r => {
      fields.forEach(f => {
        const v = norm(r[f]);
        if (!v) return;
        const m = map[f];
        m.set(v, (m.get(v) || 0) + 1);
      });
    });
    fields.forEach(f => {
      out[f] = new Set();
      map[f].forEach((count, key) => {
        if (count > 1) out[f].add(key);
      });
    });
    return out;
  }

  function stripId(row) {
    const copy = { ...row };
    delete copy._id;
    return copy;
  }
  
  function isEmptyInfluencer(d) {
    if (!d) return true;
    return !((d.fbName || "").trim()) && 
           !((d.fbLink || "").trim()) && 
           !((d.telegram || "").trim()) && 
           !((d.offerStatus || "").trim()) &&
           !((d.phone || "").trim()) &&
           !((d.date || "").trim()) &&
           !((d.accountName || "").trim());
  }

  function isEmptyContract(d) {
    if (!d) return true;
    return !((d.agentLine || "").trim()) && !((d.domain || "").trim()) && !((d.vloggerTg || "").trim()) && !((d.myTg || "").trim()) && !((d.contract || "").trim()) && !((d.remarks || "").trim());
  }

  function logHistory(entity, row) {
    const ts = Date.now();
    history.unshift({
      id: ts + Math.random(),
      ts,
      dateKey: dayKey(ts),
      entity,
      rowId: row._id,
      data: stripId(row)
    });
    if (history.length > HISTORY_LIMIT) history.length = HISTORY_LIMIT;
    saveHistory();
    if (activeTab === "history" && histView === "days") renderHistory();
  }

  function updateHistorySnapshot(entity, row) {
    if (!row || !row._id) return;
    let updated = false;
    for (let i = 0; i < history.length; i++) {
      const h = history[i];
      if (h.entity === entity && h.rowId === row._id) {
        h.data = stripId(row);
        updated = true;
      }
    }
    if (updated) {
      saveHistory();
      if (activeTab === "history") renderHistory();
    } else {
      logHistory(entity, row);
    }
  }

  function saveHistory() {
    const payload = JSON.stringify(history);
    try { localStorage.setItem(HISTORY_KEY, payload); } catch(e){}
    try { localStorage.setItem(HISTORY_KEY_ALT, payload); } catch(e){}
  }

  function cleanupHistory() {
    const before = history.length;
    history = history.filter(h => {
      if (!h || !h.entity || !h.data) return false;
      if (h.entity === "influencer") return !isEmptyInfluencer(h.data);
      return !isEmptyContract(h.data);
    });
    if (history.length !== before) saveHistory();
    return before - history.length;
  }

  function deleteDay(dateKey) {
    const toRemove = history.filter(h => h.dateKey === dateKey).length;
    if (!toRemove) return;
    if (!confirm(`Delete ${displayDay(dateKey)} from history?\n\n${toRemove} entr${toRemove===1?"y":"ies"} will be removed.\nYour live influencers and contracts lists are NOT affected.`)) return;
    history = history.filter(h => h.dateKey !== dateKey);
    saveHistory();
    if (histSelectedDay === dateKey) {
      histSelectedDay = null;
      histView = "days";
    }
    renderHistory();
    toast(`Deleted ${toRemove} entr${toRemove===1?"y":"ies"} from ${displayDay(dateKey)}`, { icon: "trash" });
  }

  function getDaysMap() {
    const map = new Map();
    history.forEach(h => {
      if (!map.has(h.dateKey)) map.set(h.dateKey, { influencers: [], contracts: [] });
      const bucket = map.get(h.dateKey);
      if (h.entity === "influencer") bucket.influencers.push(h);
      else bucket.contracts.push(h);
    });
    return map;
  }

  function renderHistory() {
    const daysContainer = $("#histDays");
    const detailView = $("#histDetailView");
    const daysView = $("#histDaysView");
    if (!daysContainer) return;

    if (histView === "detail") {
      daysView.hidden = true;
      detailView.hidden = false;
      renderHistoryDetail();
      return;
    }

    daysView.hidden = false;
    detailView.hidden = true;

    const searchFilter = ($("#histSearch")?.value || "").toLowerCase();
    const monthFilter = $("#histMonthFilter")?.value || "";

    const daysMap = getDaysMap();
    let dayKeys = Array.from(daysMap.keys()).sort((a, b) => b.localeCompare(a));

    if (monthFilter) dayKeys = dayKeys.filter(k => k.startsWith(monthFilter));

    if (searchFilter) {
      dayKeys = dayKeys.filter(k => {
        const bucket = daysMap.get(k);
        const all = [...bucket.influencers, ...bucket.contracts];
        return all.some(h => {
          const d = h.data;
          const hay = h.entity === "influencer"
            ? [d.fbName, d.fbLink, d.telegram, d.offerStatus, d.phone, d.date, d.accountName].join(" ").toLowerCase()
            : [d.agentLine, d.domain, d.vloggerTg, d.myTg, d.contract, d.state, d.remarks].join(" ").toLowerCase();
          return hay.includes(searchFilter);
        });
      });
    }

    populateMonthFilter(Array.from(getDaysMap().keys()));

    const shown = dayKeys.slice(0, histDaysShown);
    const hasMore = dayKeys.length > shown.length;

    daysContainer.innerHTML = "";

    if (!shown.length) {
      daysContainer.innerHTML = `
        <div class="hist-empty">
          ${svgIcon("clock", 48)}
          <h3>${searchFilter || monthFilter ? "No matches" : "No history yet"}</h3>
          <p>${searchFilter || monthFilter ? "Try a different search or month." : "Added influencers and contracts will appear here by day."}</p>
        </div>`;
      $("#histLoadMore").hidden = true;
      return;
    }

    shown.forEach(key => {
      const bucket = daysMap.get(key);
      const infCount = bucket.influencers.length;
      const conCount = bucket.contracts.length;
      const card = document.createElement("div");
      card.className = "day-card";
      card.innerHTML = `
        <div class="day-card-icon">${svgIcon("calendar", 22)}</div>
        <div class="day-card-body">
          <div class="day-card-date">${displayDay(key)}</div>
          <div class="day-card-sub">
            ${infCount ? `<span class="day-card-chip chip-inf">${svgIcon("users", 11)} ${infCount} influencer${infCount===1?"":"s"}</span>` : ""}
            ${conCount ? `<span class="day-card-chip chip-con">${svgIcon("file", 11)} ${conCount} contract${conCount===1?"":"s"}</span>` : ""}
          </div>
        </div>
        <div class="day-card-actions">
          <button class="del-btn" title="Delete this day" data-del-day="${key}">${svgIcon("trash")}</button>
          <div class="day-card-arrow">${svgIcon("chevron-right", 18)}</div>
        </div>
      `;
      card.addEventListener("click", (e) => {
        if (e.target.closest("[data-del-day]")) return;
        openDayDetail(key);
      });
      card.querySelector("[data-del-day]").addEventListener("click", (e) => {
        e.stopPropagation();
        deleteDay(key);
      });
      daysContainer.appendChild(card);
    });

    $("#histLoadMore").hidden = !hasMore;
  }

  function populateMonthFilter(allKeys) {
    const sel = $("#histMonthFilter");
    if (!sel) return;
    const months = new Set();
    allKeys.forEach(k => months.add(k.slice(0, 7)));
    const sorted = Array.from(months).sort((a, b) => b.localeCompare(a));
    const current = sel.value;
    sel.innerHTML = `<option value="">All months</option>` +
      sorted.map(m => {
        const [y, mm] = m.split("-");
        return `<option value="${m}">${mm}-${y}</option>`;
      }).join("");
    sel.value = current || "";
  }

  function openDayDetail(key) {
    histSelectedDay = key;
    histDetailFilter = "all";
    histView = "detail";
    $$(".hist-tab").forEach(t => t.classList.toggle("active", t.dataset.histTab === "all"));
    const s = $("#histDetailSearch");
    if (s) s.value = "";
    renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function closeDayDetail() {
    histView = "days";
    histSelectedDay = null;
    const s = $("#histDetailSearch");
    if (s) s.value = "";
    renderHistory();
  }

  function setHistDetailFilter(f) {
    histDetailFilter = f;
    $$(".hist-tab").forEach(t => t.classList.toggle("active", t.dataset.histTab === f));
    renderHistoryDetail();
  }

  function renderHistoryDetail() {
    const title = $("#histDetailTitle");
    const body = $("#histDetailBody");
    if (!title || !body) return;

    const daysMap = getDaysMap();
    let bucket = daysMap.get(histSelectedDay);
    title.textContent = displayDay(histSelectedDay);

    if (!bucket) {
      body.innerHTML = `<div class="hist-empty"><h3>No data</h3></div>`;
      return;
    }

    const dayFilter = ($("#histDetailSearch")?.value || "").toLowerCase();
    if (dayFilter) {
      const matchInf = (r) => [r.fbName, r.fbLink, r.telegram, r.offerStatus, r.phone, r.date, r.accountName].join(" ").toLowerCase().includes(dayFilter);
      const matchCon = (r) => [r.agentLine, r.taskPosted, r.releaseTime, r.time, r.contract, r.first, r.second, r.third, r.vloggerTg, r.domain, r.state, r.myTg, r.remarks].join(" ").toLowerCase().includes(dayFilter);
      bucket = {
        influencers: bucket.influencers.filter(h => matchInf(h.data)),
        contracts: bucket.contracts.filter(h => matchCon(h.data))
      };
    }

    body.innerHTML = "";

    const showInf = histDetailFilter === "all" || histDetailFilter === "influencers";
    const showCon = histDetailFilter === "all" || histDetailFilter === "contracts";

    if (showInf && bucket.influencers.length) {
      const section = document.createElement("div");
      section.className = "hist-section";
      section.innerHTML = `
        <div class="hist-section-head">${svgIcon("users", 14)} Influencers · ${bucket.influencers.length}</div>
        <div class="table-wrap hist-table-wrap">
          <div class="table-scroll">
            <table class="hist-table">
              <thead>
                <tr>
                  <th>FB名字</th>
                  <th>FB链接</th>
                  <th>飞机</th>
                  <th>offer/status</th>
                  <th>手机号</th>
                  <th>date</th>
                  <th>Account name</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;
      const tbody = section.querySelector("tbody");
      bucket.influencers.forEach(h => {
        const r = h.data;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(r.fbName) || "—"}</td>
          <td>${r.fbLink ? `<a href="${esc(r.fbLink)}" target="_blank" rel="noopener" class="hist-link">${esc(r.fbLink)}</a>` : "—"}</td>
          <td>${esc(r.telegram) || "—"}</td>
          <td>${esc(r.offerStatus) || "—"}</td>
          <td>${esc(r.phone) || "—"}</td>
          <td>${esc(r.date) || "—"}</td>
          <td>${esc(r.accountName) || "—"}</td>
          <td class="hist-time-cell">${relativeTime(h.ts)}</td>
        `;
        tbody.appendChild(tr);
      });
      body.appendChild(section);
    }

    if (showCon && bucket.contracts.length) {
      const section = document.createElement("div");
      section.className = "hist-section";
      section.innerHTML = `
        <div class="hist-section-head">${svgIcon("file", 14)} Contracts · ${bucket.contracts.length}</div>
        <div class="table-wrap hist-table-wrap">
          <div class="table-scroll">
            <table class="hist-table">
              <thead>
                <tr>
                  <th>代理线</th>
                  <th>发布任务</th>
                  <th>发布时间</th>
                  <th>时间</th>
                  <th>合同</th>
                  <th>第一笔</th>
                  <th>第二笔</th>
                  <th>第三笔</th>
                  <th>博主电报</th>
                  <th>推广域名</th>
                  <th>状态</th>
                  <th>我的电报</th>
                  <th>备注</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;
      const tbody = section.querySelector("tbody");
      bucket.contracts.forEach(h => {
        const r = h.data;
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${esc(r.agentLine) || "—"}</td>
          <td>${esc(r.taskPosted) || "—"}</td>
          <td>${esc(r.releaseTime) || "—"}</td>
          <td>${esc(r.time) || "—"}</td>
          <td>${esc(r.contract) || "—"}</td>
          <td>${esc(r.first) || "—"}</td>
          <td>${esc(r.second) || "—"}</td>
          <td>${esc(r.third) || "—"}</td>
          <td>${esc(r.vloggerTg) || "—"}</td>
          <td>${r.domain ? `<a href="${esc(r.domain)}" target="_blank" rel="noopener" class="hist-link">${esc(r.domain)}</a>` : "—"}</td>
          <td>${r.state ? `<span class="state-badge ${STATE_CLASS[r.state]||''}">${esc(r.state)}</span>` : "—"}</td>
          <td>${esc(r.myTg) || "—"}</td>
          <td>${esc(r.remarks) || "—"}</td>
          <td class="hist-time-cell">${relativeTime(h.ts)}</td>
        `;
        tbody.appendChild(tr);
      });
      body.appendChild(section);
    }

    if (!body.children.length) {
      body.innerHTML = `
        <div class="hist-empty">
          ${svgIcon("clock", 48)}
          <h3>${dayFilter ? "No matches" : "Nothing to show"}</h3>
          <p>${dayFilter ? `Nothing found for "${esc(dayFilter)}" on this day.` : `No ${histDetailFilter === "all" ? "data" : histDetailFilter} on this day.`}</p>
        </div>`;
    }
  }

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
      actionBtn.onclick = () => { opts.onAction(); hideToast(); };
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

  function initTheme() {
    let saved = localStorage.getItem(THEME_KEY);
    if (!saved) saved = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
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
  function applyTheme(t) { document.documentElement.setAttribute("data-theme", t); }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) prefs = Object.assign(prefs, JSON.parse(raw));
    } catch(e){}
  }
  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch(e){}
  }

  function migrateRow(row, entity) {
    if (entity === "influencer") {
      return {
        _id: row._id || uid(),
        fbName: row.fbName || row.notes || "",
        fbLink: row.fbLink || "",
        telegram: row.telegram || row.tg || "",
        offerStatus: row.offerStatus || "",
        phone: row.phone || "",
        date: row.date || "",
        accountName: row.accountName || ""
      };
    } else {
      return {
        _id: row._id || uid(),
        agentLine: row.agentLine || "",
        taskPosted: row.taskPosted || "",
        releaseTime: row.releaseTime || "",
        time: row.time || row.updateTime || "", // fallback to old updateTime
        contract: row.contract || "",
        first: row.first || "",
        second: row.second || "",
        third: row.third || "",
        vloggerTg: row.vloggerTg || "",
        domain: row.domain || "",
        state: row.state || "Pending",
        myTg: row.myTg || "",
        remarks: row.remarks || ""
      };
    }
  }

  function load() {
    let loaded = false;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && (Array.isArray(parsed.influencers) || Array.isArray(parsed.contracts))) {
          data = parsed; loaded = true;
        }
      }
    } catch(e){}
    if (!loaded) {
      for (const key of LEGACY_KEYS) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && (Array.isArray(parsed.influencers) || Array.isArray(parsed.contracts))) {
              data = {
                influencers: Array.isArray(parsed.influencers) ? parsed.influencers : [],
                contracts: Array.isArray(parsed.contracts) ? parsed.contracts : []
              };
              loaded = true;
              save();
              break;
            }
          }
        } catch(e){}
      }
    }
    if (!data || typeof data !== "object") data = { influencers: [], contracts: [] };
    if (!Array.isArray(data.influencers)) data.influencers = [];
    if (!Array.isArray(data.contracts)) data.contracts = [];

    data.influencers = data.influencers.map(r => migrateRow(r, "influencer"));
    data.contracts = data.contracts.map(r => migrateRow(r, "contract"));

    let historyRaw = null;
    try {
      const a = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      const b = JSON.parse(localStorage.getItem(HISTORY_KEY_ALT) || "[]");
      const aLen = Array.isArray(a) ? a.length : 0;
      const bLen = Array.isArray(b) ? b.length : 0;
      if (aLen >= bLen && aLen > 0) historyRaw = a;
      else if (bLen > 0) historyRaw = b;
    } catch(e){}

    if (historyRaw) {
      history = historyRaw.filter(h => h && h.entity && h.data).map(h => {
        if (h.entity === "influencer") {
          h.data = {
            fbName: h.data.fbName || h.data.notes || "",
            fbLink: h.data.fbLink || "",
            telegram: h.data.telegram || h.data.tg || "",
            offerStatus: h.data.offerStatus || "",
            phone: h.data.phone || "",
            date: h.data.date || "",
            accountName: h.data.accountName || ""
          };
        } else {
          h.data = {
            agentLine: h.data.agentLine || "",
            taskPosted: h.data.taskPosted || "",
            releaseTime: h.data.releaseTime || "",
            time: h.data.time || h.data.updateTime || "",
            contract: h.data.contract || "",
            first: h.data.first || "",
            second: h.data.second || "",
            third: h.data.third || "",
            vloggerTg: h.data.vloggerTg || "",
            domain: h.data.domain || "",
            state: h.data.state || "Pending",
            myTg: h.data.myTg || "",
            remarks: h.data.remarks || ""
          };
        }
        if (h.rowId) return h;
        let match = null;
        if (h.entity === "influencer") {
          match = data.influencers.find(r =>
            (r.telegram && r.telegram === h.data.telegram) ||
            (r.fbName && r.fbName === h.data.fbName)
          );
        } else {
          match = data.contracts.find(r =>
            (r.agentLine && r.agentLine === h.data.agentLine) ||
            (r.domain && r.domain === h.data.domain)
          );
        }
        if (match) {
          h.rowId = match._id;
          h.data = stripId(match);
        }
        return h;
      });

      history.forEach(h => {
        if (!h.rowId) return;
        let live = null;
        if (h.entity === "influencer") live = data.influencers.find(r => r._id === h.rowId);
        else live = data.contracts.find(r => r._id === h.rowId);
        if (live) h.data = stripId(live);
      });
    }
    if (!Array.isArray(history)) history = [];

    const removed = cleanupHistory();
    if (removed > 0) console.info(`Cleaned ${removed} empty history entries`);
    save();
  }

  function save() {
    const payload = JSON.stringify(data);
    try {
      localStorage.setItem(STORAGE_KEY, payload);
      localStorage.setItem("inf_contract_manager_v5", payload);
      localStorage.setItem(MIRROR_KEY, payload);
      lastSavedAt = Date.now();
      updateLastSaved();
    } catch (e) {
      console.warn("Save failed", e);
      toast("Save failed — storage full?", { icon: "trash" });
    }
    renderCounts();
  }

  function renderCounts() {
    const a = $("#infBadge"); const b = $("#conBadge");
    if (a) a.textContent = data.influencers.length;
    if (b) b.textContent = data.contracts.length;
  }

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
        else {
          histView = "days";
          histSelectedDay = null;
          const s = $("#histDetailSearch");
          if (s) s.value = "";
          renderHistory();
        }
      });
    });
  }

  function sortedData(arr, sortState) {
    if (!sortState.key) return arr.slice();
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
    $$("#infTable thead th[data-sort]").forEach(th => {
      th.addEventListener("click", () => {
        const k = th.dataset.sort;
        if (infSort.key === k) infSort.dir *= -1;
        else { infSort.key = k; infSort.dir = 1; }
        updateSortIcons("#infTable", infSort);
        renderInfluencers();
      });
    });
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

  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function scrambleInfluencers() {
    if (data.influencers.length < 2) { toast("Not enough rows to scramble"); return; }
    if (!confirm("Scramble the order of influencers?\n\nRows will be shuffled randomly. Data stays with its row.")) return;
    data.influencers = shuffleArray(data.influencers);
    infSort.key = null;
    updateSortIcons("#infTable", infSort);
    save();
    renderInfluencers();
    toast("Influencers scrambled");
  }

  function scrambleContracts() {
    if (data.contracts.length < 2) { toast("Not enough rows to scramble"); return; }
    if (!confirm("Scramble the order of contracts?\n\nRows will be shuffled randomly. Data stays with its row.")) return;
    data.contracts = shuffleArray(data.contracts);
    conSort.key = null;
    updateSortIcons("#conTable", conSort);
    save();
    renderContracts();
    toast("Contracts scrambled");
  }

  function addInfluencer() {
    const row = { 
      _id: uid(), 
      fbName: "", 
      fbLink: "", 
      telegram: "", 
      offerStatus: "", 
      phone: "", 
      date: todaySlug(), 
      accountName: "" 
    };
    data.influencers.push(row);
    save();
    renderInfluencers();
    logHistory("influencer", row);
    toast("Influencer added");
  }

  function pickRandomInfluencerFromHistory() {
    const todayK = todayKey();

    const currentKeys = new Set();
    data.influencers.forEach(r => {
      const k = norm(r.telegram) || norm(r.fbName) || norm(r.fbLink);
      if (k) currentKeys.add(k);
    });

    const pool = history.filter(h => {
      if (!h || h.entity !== "influencer" || !h.data) return false;
      if (h.dateKey === todayK) return false;
      if (pickedHistoryIds.has(h.id)) return false;
      const r = h.data;
      const hasData = (r.fbName || "").trim() || (r.telegram || "").trim() || (r.fbLink || "").trim();
      if (!hasData) return false;
      const k = norm(r.telegram) || norm(r.fbName) || norm(r.fbLink);
      if (!k) return false;
      if (currentKeys.has(k)) return false;
      return true;
    });

    if (!pool.length) {
      toast("No more unique history to add", { icon: "trash" });
      return;
    }

    const pick = pool[Math.floor(Math.random() * pool.length)];
    const src = pick.data;
    const newRow = {
      _id: uid(),
      fbName: src.fbName || "",
      fbLink: src.fbLink || "",
      telegram: src.telegram || "",
      offerStatus: "",
      phone: "",
      date: todaySlug(),
      accountName: ""
    };

    data.influencers.push(newRow);
    pickedHistoryIds.add(pick.id);
    save();
    renderInfluencers();
    logHistory("influencer", newRow);
    toast(`Added ${newRow.telegram || newRow.fbName || "influencer"} from history`);
  }

  function delInfluencerById(id) {
    const idx = data.influencers.findIndex(r => r._id === id);
    if (idx === -1) return;
    const row = data.influencers[idx];
    lastDeleted = { type: "influencer", row: { ...row }, index: idx };
    data.influencers.splice(idx, 1);
    save(); renderInfluencers();
    toast("Influencer deleted", { icon: "trash", actionLabel: "Undo", duration: 6000, onAction: undoDelete });
  }
  function undoDelete() {
    if (!lastDeleted) return;
    const { type, row, index } = lastDeleted;
    if (type === "influencer") { data.influencers.splice(index, 0, row); save(); renderInfluencers(); }
    else { data.contracts.splice(index, 0, row); save(); renderContracts(); }
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
    const dups = dupSet(data.influencers, INF_DUP_FIELDS);

    rows.forEach((row) => {
      const rowId = row._id;
      const hay = [row.fbName, row.fbLink, row.telegram, row.offerStatus, row.phone, row.date, row.accountName].map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      const tr = document.createElement("tr");
      INF_FIELDS.forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true"; td.dataset.k = k;
        td.innerHTML = escAndHighlight(row[k], filter);
        if (INF_DUP_FIELDS.includes(k) && dups[k] && dups[k].has(norm(row[k]))) {
          td.classList.add("dup");
        }
        td.addEventListener("blur", () => {
          const newVal = td.innerText.trim();
          const live = data.influencers.find(r => r._id === rowId);
          if (!live) return;
          if (live[k] !== newVal) {
            live[k] = newVal;
            save(); flashCell(td);
            updateHistorySnapshot("influencer", live);
          }
          renderInfluencers();
        });
        td.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); } });
        tr.appendChild(td);
      });
      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn"; delBtn.title = "Delete";
      delBtn.innerHTML = svgIcon("trash");
      delBtn.addEventListener("click", () => delInfluencerById(rowId));
      delTd.appendChild(delBtn); tr.appendChild(delTd);
      tbody.appendChild(tr);

      const card = document.createElement("div");
      card.className = "card";
      const infDup = INF_DUP_FIELDS.some(k => dups[k] && dups[k].has(norm(row[k])));
      card.innerHTML = `
        <div class="card-head">
          <div class="card-body">
            <div class="card-title">${escAndHighlight(row.telegram, filter) || "—"}${infDup ? ' <span class="dup-badge">duplicate</span>' : ''}</div>
            <div class="card-sub">${escAndHighlight(row.fbName, filter) || "No FB name"}</div>
          </div>
          <div class="card-actions">
            <button class="del-btn" title="Delete">${svgIcon("trash")}</button>
          </div>
        </div>
        ${row.fbLink ? `<div class="card-sub" style="margin-top:6px">${escAndHighlight(row.fbLink, filter)}</div>` : ""}
      `;
      card.addEventListener("click", (e) => { if (e.target.closest(".del-btn")) return; openInfluencerModalById(rowId); });
      card.querySelector(".del-btn").addEventListener("click", (e) => { e.stopPropagation(); delInfluencerById(rowId); });
      cards.appendChild(card);
    });

    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        empty.querySelector("h3").textContent = filter ? "No matches" : "No influencers yet";
        empty.querySelector("p").innerHTML = filter
          ? `Nothing found for "<strong>${esc(filter)}</strong>".`
          : "Click <strong>Add Influencer</strong>, <strong>Import CSV</strong>, or <strong>Import Excel</strong> to start.";
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

  function addContract() {
    const row = {
      _id: uid(),
      agentLine: "", taskPosted: "", releaseTime: "", time: "",
      contract: "", first: "", second: "", third: "",
      vloggerTg: "", domain: "", state: "Pending",
      myTg: "", // <--- Removed prefs.lastMyTg from here
      remarks: ""
    };
    data.contracts.push(row);
    save(); renderContracts();
    logHistory("contract", row);
    toast("Contract added");
  }
  
  function delContractById(id) {
    const idx = data.contracts.findIndex(r => r._id === id);
    if (idx === -1) return;
    const row = data.contracts[idx];
    lastDeleted = { type: "contract", row: { ...row }, index: idx };
    data.contracts.splice(idx, 1);
    save(); renderContracts();
    toast("Contract deleted", { icon: "trash", actionLabel: "Undo", duration: 6000, onAction: undoDelete });
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
      const rowId = row._id;
      const hay = [row.agentLine, row.vloggerTg, row.domain, row.myTg, row.contract, row.state, row.remarks]
        .map(v => (v || "").toLowerCase()).join(" ");
      if (filter && !hay.includes(filter)) return;
      visible++;

      const tr = document.createElement("tr");
      CON_TEXT_FIELDS.forEach(k => {
        const td = document.createElement("td");
        td.contentEditable = "true"; td.dataset.k = k;
        td.innerHTML = escAndHighlight(row[k], filter);
        td.addEventListener("blur", () => {
          const newVal = td.innerText.trim();
          const live = data.contracts.find(r => r._id === rowId);
          if (!live) return;
          if (live[k] !== newVal) {
            live[k] = newVal;
            save(); flashCell(td);
            updateHistorySnapshot("contract", live);
          }
          td.innerHTML = escAndHighlight(live[k], filter);
        });
        td.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); td.blur(); } });
        tr.appendChild(td);
      });

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
        const live = data.contracts.find(r => r._id === rowId);
        if (!live) return;
        live.state = sel.value;
        sel.className = "state-select " + (STATE_CLASS[sel.value] || "");
        save();
        updateHistorySnapshot("contract", live);
      });
      stateTd.appendChild(sel); tr.appendChild(stateTd);

      const myTgTd = document.createElement("td");
      myTgTd.contentEditable = "true"; myTgTd.dataset.k = "myTg";
      myTgTd.innerHTML = escAndHighlight(row.myTg, filter);
      myTgTd.addEventListener("blur", () => {
        const newVal = myTgTd.innerText.trim();
        const live = data.contracts.find(r => r._id === rowId);
        if (!live) return;
        if (live.myTg !== newVal) {
          live.myTg = newVal;
          if (newVal) { prefs.lastMyTg = newVal; savePrefs(); } // still saves pref for next time if you want
          save(); flashCell(myTgTd);
          updateHistorySnapshot("contract", live);
        }
        myTgTd.innerHTML = escAndHighlight(live.myTg, filter);
      });
      myTgTd.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); myTgTd.blur(); } });
      tr.appendChild(myTgTd);

      const remarksTd = document.createElement("td");
      remarksTd.contentEditable = "true"; remarksTd.dataset.k = "remarks";
      remarksTd.innerHTML = escAndHighlight(row.remarks, filter);
      remarksTd.addEventListener("blur", () => {
        const newVal = remarksTd.innerText.trim();
        const live = data.contracts.find(r => r._id === rowId);
        if (!live) return;
        if (live.remarks !== newVal) {
          live.remarks = newVal;
          save(); flashCell(remarksTd);
          updateHistorySnapshot("contract", live);
        }
        remarksTd.innerHTML = escAndHighlight(live.remarks, filter);
      });
      remarksTd.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); remarksTd.blur(); } });
      tr.appendChild(remarksTd);

      const delTd = document.createElement("td");
      const delBtn = document.createElement("button");
      delBtn.className = "del-btn"; delBtn.title = "Delete";
      delBtn.innerHTML = svgIcon("trash");
      delBtn.addEventListener("click", () => delContractById(rowId));
      delTd.appendChild(delBtn); tr.appendChild(delTd);
      tbody.appendChild(tr);

      const card = document.createElement("div");
      card.className = "card";
      const metaRows = [
        ["Vlogger", row.vloggerTg],
        ["Contract", row.contract],
        ["Agent", row.agentLine],
        ["My TG", row.myTg],
        ["Remarks", row.remarks]
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
      card.addEventListener("click", (e) => { if (e.target.closest(".del-btn")) return; openContractModalById(rowId); });
      card.querySelector(".del-btn").addEventListener("click", (e) => { e.stopPropagation(); delContractById(rowId); });
      cards.appendChild(card);
    });

    if (empty && wrap) {
      const table = wrap.querySelector("table");
      if (visible === 0) {
        if (table) table.style.display = "none";
        empty.hidden = false;
        empty.querySelector("h3").textContent = filter ? "No matches" : "No contracts yet";
        empty.querySelector("p").innerHTML = filter
          ? `Nothing found for "<strong>${esc(filter)}</strong>".`
          : "Click <strong>Add Contract</strong>, <strong>Import CSV</strong>, or <strong>Import Excel</strong>.";
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
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveModal(); } });
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
    $$("#modalBody [data-k]").forEach(el => { values[el.dataset.k] = (el.value || "").trim(); });
    try { editing.onSave(values); }
    catch (e) { console.error("Save failed", e); toast("Save failed", { icon: "trash" }); return; }
    closeModal();
    toast("Saved");
  }
  function openInfluencerModalById(id) {
    const row = data.influencers.find(r => r._id === id);
    if (!row) return;
    openModal("Edit Influencer", [
      { key: "fbName",      label: "FB名字",       value: row.fbName },
      { key: "fbLink",      label: "FB链接",       value: row.fbLink },
      { key: "telegram",    label: "飞机",         value: row.telegram },
      { key: "offerStatus", label: "offer/status", value: row.offerStatus },
      { key: "phone",       label: "手机号",       value: row.phone },
      { key: "date",        label: "date",         value: row.date },
      { key: "accountName", label: "Account name", value: row.accountName }
    ], (v) => {
      Object.assign(row, v);
      save(); renderInfluencers();
      updateHistorySnapshot("influencer", row);
    });
  }
  function openContractModalById(id) {
    const row = data.contracts.find(r => r._id === id);
    if (!row) return;
    openModal("Edit Contract", [
      { key: "agentLine",   label: "代理线",       value: row.agentLine },
      { key: "taskPosted",  label: "发布任务",     value: row.taskPosted },
      { key: "releaseTime", label: "发布时间",     value: row.releaseTime },
      { key: "time",        label: "时间",         value: row.time },
      { key: "contract",    label: "合同",         value: row.contract },
      { key: "first",       label: "第一笔",       value: row.first },
      { key: "second",      label: "第二笔",       value: row.second },
      { key: "third",       label: "第三笔",       value: row.third },
      { key: "vloggerTg",   label: "博主电报",     value: row.vloggerTg },
      { key: "domain",      label: "推广域名",     value: row.domain },
      { key: "state",       label: "状态", type: "select", options: STATES, value: row.state },
      { key: "myTg",        label: "我的电报",     value: row.myTg },
      { key: "remarks",     label: "备注",         value: row.remarks }
    ], (v) => {
      Object.assign(row, v);
      if (v.myTg) { prefs.lastMyTg = v.myTg; savePrefs(); }
      save(); renderContracts();
      updateHistorySnapshot("contract", row);
    });
  }

  function parseCSV(text) {
    const rows = [];
    let cur = [], field = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQuotes = false; }
        else field += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ",") { cur.push(field); field = ""; }
        else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
        else if (c === "\r") {}
        else field += c;
      }
    }
    if (field.length || cur.length) { cur.push(field); rows.push(cur); }
    return rows.filter(r => r.some(v => v.trim() !== ""));
  }

  const INF_COL_MAP = {
    "fb名字": "fbName", "fb name": "fbName", "name": "fbName", "fb": "fbName", "facebook name": "fbName",
    "fb链接": "fbLink", "fb link": "fbLink", "link": "fbLink", "facebook link": "fbLink", "profile link": "fbLink",
    "飞机": "telegram", "telegram": "telegram", "tg": "telegram", "tg username": "telegram",
    "offer/status": "offerStatus", "offer": "offerStatus", "status": "offerStatus",
    "手机号": "phone", "phone": "phone", "phone number": "phone", "number": "phone",
    "date": "date",
    "account name": "accountName", "account": "accountName"
  };

  const CON_COL_MAP = {
    "代理线": "agentLine", "agent line": "agentLine", "agent": "agentLine", "agentline": "agentLine",
    "发布任务": "taskPosted", "task posted": "taskPosted", "task": "taskPosted", "taskposted": "taskPosted",
    "发布时间": "releaseTime", "release time": "releaseTime", "release": "releaseTime", "releasetime": "releaseTime",
    "时间": "time", "update time": "time", "updatetime": "time",
    "合同": "contract", "contract": "contract",
    "第一笔": "first", "first transaction": "first", "1st trans.": "first", "1st": "first", "first": "first",
    "第二笔": "second", "second payment": "second", "2nd pay": "second", "2nd": "second", "second": "second",
    "第三笔": "third", "third payment": "third", "3rd pay": "third", "3rd": "third", "third": "third",
    "博主电报": "vloggerTg", "vlogger's telegram": "vloggerTg", "vlogger tg": "vloggerTg", "vlogger": "vloggerTg", "vloggertg": "vloggerTg",
    "推广域名": "domain", "promotional domain": "domain", "domain": "domain",
    "状态": "state", "state": "state", "status": "state",
    "我的电报": "myTg", "my telegram name": "myTg", "my tg": "myTg", "mytelegram": "myTg", "my telegram": "myTg",
    "备注": "remarks", "remarks": "remarks", "notes": "remarks", "note": "remarks", "remark": "remarks"
  };

  function normalizeHeader(h) {
    return String(h || "").trim().toLowerCase().replace(/\s+/g, " ");
  }

  function importRowsToData(headers, bodyRows, target) {
    let imported = 0;
    const map = target === "influencers" ? INF_COL_MAP : CON_COL_MAP;

    if (target === "influencers") {
      bodyRows.forEach(r => {
        const obj = { _id: uid(), fbName: "", fbLink: "", telegram: "", offerStatus: "", phone: "", date: todaySlug(), accountName: "" };
        headers.forEach((h, idx) => {
          const key = map[normalizeHeader(h)];
          if (key) obj[key] = String(r[idx] == null ? "" : r[idx]).trim();
        });
        if (obj.fbName || obj.fbLink || obj.telegram || obj.offerStatus || obj.phone || obj.accountName) {
          data.influencers.push(obj);
          logHistory("influencer", obj);
          imported++;
        }
      });
    } else {
      bodyRows.forEach(r => {
        const obj = {
          _id: uid(),
          agentLine: "", taskPosted: "", releaseTime: "", time: "",
          contract: "", first: "", second: "", third: "",
          vloggerTg: "", domain: "", state: "Pending", myTg: "", remarks: ""
        };
        headers.forEach((h, idx) => {
          const key = map[normalizeHeader(h)];
          if (!key) return;
          const val = String(r[idx] == null ? "" : r[idx]).trim();
          if (key === "state") {
            const found = STATES.find(s => s.toLowerCase() === val.toLowerCase());
            obj.state = found || "Pending";
          } else obj[key] = val;
        });
        if (obj.agentLine || obj.domain || obj.vloggerTg || obj.myTg || obj.contract || obj.remarks) {
          data.contracts.push(obj);
          logHistory("contract", obj);
          imported++;
        }
      });
    }

    save();
    if (target === "influencers") renderInfluencers(); else renderContracts();
    return imported;
  }

  function handleCsvText(text, target) {
    const rows = parseCSV(text);
    if (rows.length < 2) { toast("Need headers + at least 1 row", { icon: "trash" }); return; }
    const headers = rows[0].map(h => String(h).trim());
    const bodyRows = rows.slice(1);
    const imported = importRowsToData(headers, bodyRows, target);
    toast(`Imported ${imported} row${imported===1?"":"s"}`);
  }

  function handleXlsxFile(file, target) {
    if (typeof XLSX === "undefined") { toast("Excel library not loaded", { icon: "trash" }); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array" });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
        const cleaned = rows.filter(r => r.some(v => String(v).trim() !== ""));
        if (cleaned.length < 2) { toast("File has no data rows", { icon: "trash" }); return; }
        const headers = cleaned[0].map(h => String(h).trim());
        const bodyRows = cleaned.slice(1);
        const imported = importRowsToData(headers, bodyRows, target);
        toast(`Imported ${imported} row${imported===1?"":"s"} from ${sheetName}`);
      } catch (err) {
        console.error(err);
        toast("Failed to read file", { icon: "trash" });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function openCsvModal(target) {
    csvImportTarget = target;
    const modal = $("#csvModal");
    const title = $("#csvModalTitle");
    const text = $("#csvText");
    const preview = $("#csvPreview");
    if (!modal) return;
    title.textContent = target === "influencers" ? "Import Influencers CSV" : "Import Contracts CSV";
    text.value = ""; preview.textContent = "";
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
    } catch(e) { preview.textContent = "Could not parse CSV."; }
  }
  function doCsvImport() {
    const text = $("#csvText")?.value || "";
    if (!text.trim()) { toast("Nothing to import", { icon: "trash" }); return; }
    handleCsvText(text, csvImportTarget);
    closeCsvModal();
  }

  function buildHistoryRows(entries) {
    return entries.map(h => {
      const d = new Date(h.ts);
      const date = `${pad(d.getMonth()+1)}-${pad(d.getDate())}-${d.getFullYear()}`;
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      if (h.entity === "influencer") {
        const r = h.data;
        return {
          "Date": date, "Time": time, "Entity": "influencer",
          "FB名字": r.fbName || "", "FB链接": r.fbLink || "",
          "飞机": r.telegram || "", "offer/status": r.offerStatus || "",
          "手机号": r.phone || "", "date": r.date || "",
          "Account name": r.accountName || "",
          "代理线": "", "发布任务": "", "发布时间": "", "时间": "", "合同": "", "第一笔": "", "第二笔": "", "第三笔": "", "博主电报": "", "推广域名": "", "状态": "", "我的电报": "", "备注": ""
        };
      } else {
        const r = h.data;
        return {
          "Date": date, "Time": time, "Entity": "contract",
          "FB名字": "", "FB链接": "", "飞机": "", "offer/status": "", "手机号": "", "date": "", "Account name": "",
          "代理线": r.agentLine || "", "发布任务": r.taskPosted || "",
          "发布时间": r.releaseTime || "", "时间": r.time || "",
          "合同": r.contract || "", "第一笔": r.first || "",
          "第二笔": r.second || "", "第三笔": r.third || "",
          "博主电报": r.vloggerTg || "", "推广域名": r.domain || "",
          "状态": r.state || "", "我的电报": r.myTg || "", "备注": r.remarks || ""
        };
      }
    });
  }

  function exportHistoryCsv() {
    if (!history.length) { toast("No history to export", { icon: "trash" }); return; }

    let entries = history;
    let filenameDate = todaySlug();

    if (histView === "detail" && histSelectedDay) {
      entries = history.filter(h => h.dateKey === histSelectedDay);
      if (!entries.length) { toast("No entries for this day", { icon: "trash" }); return; }
      const [y, m, d] = histSelectedDay.split("-");
      filenameDate = `${m}-${d}-${y}`;
    }

    const rows = buildHistoryRows(entries);

    if (typeof XLSX !== "undefined") {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "History");
      XLSX.writeFile(wb, `history ${filenameDate}.xlsx`);
      toast(`history ${filenameDate}.xlsx downloaded`);
      return;
    }

    const header = "Date,Time,Entity,FB名字,FB链接,飞机,offer/status,手机号,date,Account name,代理线,发布任务,发布时间,时间,合同,第一笔,第二笔,第三笔,博主电报,推广域名,状态,我的电报,备注";
    const lines = rows.map(r => [
      r["Date"], r["Time"], r["Entity"],
      `"${String(r["FB名字"]).replace(/"/g,'""')}"`,
      `"${String(r["FB链接"]).replace(/"/g,'""')}"`,
      `"${String(r["飞机"]).replace(/"/g,'""')}"`,
      `"${String(r["offer/status"]).replace(/"/g,'""')}"`,
      `"${String(r["手机号"]).replace(/"/g,'""')}"`,
      `"${String(r["date"]).replace(/"/g,'""')}"`,
      `"${String(r["Account name"]).replace(/"/g,'""')}"`,
      `"${String(r["代理线"]).replace(/"/g,'""')}"`,
      `"${String(r["发布任务"]).replace(/"/g,'""')}"`,
      `"${String(r["发布时间"]).replace(/"/g,'""')}"`,
      `"${String(r["时间"]).replace(/"/g,'""')}"`,
      `"${String(r["合同"]).replace(/"/g,'""')}"`,
      `"${String(r["第一笔"]).replace(/"/g,'""')}"`,
      `"${String(r["第二笔"]).replace(/"/g,'""')}"`,
      `"${String(r["第三笔"]).replace(/"/g,'""')}"`,
      `"${String(r["博主电报"]).replace(/"/g,'""')}"`,
      `"${String(r["推广域名"]).replace(/"/g,'""')}"`,
      `"${String(r["状态"]).replace(/"/g,'""')}"`,
      `"${String(r["我的电报"]).replace(/"/g,'""')}"`,
      `"${String(r["备注"]).replace(/"/g,'""')}"`
    ].join(","));
    const csv = header + "\n" + lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `history ${filenameDate}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast(`history ${filenameDate}.csv downloaded`);
  }

  async function downloadExcel() {
    if (typeof ExcelJS === "undefined" || typeof saveAs === "undefined") {
      toast("Excel styling library failed to load. Check your internet connection.", { icon: "trash" });
      return;
    }
    const dateSlug = todaySlug();
    
    if (activeTab === "history") { 
      exportHistoryCsv(); 
      return; 
    }
    
    if (activeTab === "influencers") {
      if (!data.influencers.length) { toast("No influencers to export", { icon: "trash" }); return; }
      
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Influencers');
      
      ws.columns = [
        { header: 'FB名字', key: 'fbName', width: 20 },
        { header: 'FB链接', key: 'fbLink', width: 35 },
        { header: '飞机', key: 'telegram', width: 20 },
        { header: 'offer/status', key: 'offerStatus', width: 15 },
        { header: '手机号', key: 'phone', width: 15 },
        { header: 'date', key: 'date', width: 12 },
        { header: 'Account name', key: 'accountName', width: 20 }
      ];

      data.influencers.forEach(r => {
        ws.addRow({
          fbName: r.fbName || "",
          fbLink: r.fbLink || "",
          telegram: r.telegram || "",
          offerStatus: r.offerStatus || "",
          phone: r.phone || "",
          date: r.date || "",
          accountName: r.accountName || ""
        });
      });
      
      styleBaseSheet(ws);
      
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `influencers ${dateSlug}.xlsx`);
      toast(`influencers ${dateSlug}.xlsx downloaded`);
      
    } else {
      if (!data.contracts.length) { toast("No contracts to export", { icon: "trash" }); return; }
      
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Contracts');
      
      ws.columns = [
        { header: '代理线', key: 'agentLine', width: 15 },
        { header: '发布任务', key: 'taskPosted', width: 12 },
        { header: '发布时间', key: 'releaseTime', width: 15 },
        { header: '时间', key: 'time', width: 15 },
        { header: '合同', key: 'contract', width: 12 },
        { header: '第一笔', key: 'first', width: 10 },
        { header: '第二笔', key: 'second', width: 10 },
        { header: '第三笔', key: 'third', width: 10 },
        { header: '博主电报', key: 'vloggerTg', width: 18 },
        { header: '推广域名', key: 'domain', width: 40 },
        { header: '状态', key: 'state', width: 15 },
        { header: '我的电报', key: 'myTg', width: 18 },
        { header: '备注', key: 'remarks', width: 20 }
      ];

      data.contracts.forEach(r => {
        ws.addRow({
          agentLine: r.agentLine || "",
          taskPosted: r.taskPosted || "",
          releaseTime: r.releaseTime || "",
          time: r.time || "",
          contract: r.contract || "",
          first: r.first || "",
          second: r.second || "",
          third: r.third || "",
          vloggerTg: r.vloggerTg || "",
          domain: r.domain || "",
          state: r.state || "",
          myTg: r.myTg || "",
          remarks: r.remarks || ""
        });
      });
      
      styleBaseSheet(ws);
      
      // Apply row coloring
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // skip header
        
        // rowNumber is 1-indexed, so data index is rowNumber - 2
        const rowData = data.contracts[rowNumber - 2];
        if (!rowData) return;

        let fillColor = null;
        
        if (rowData.state === "Account banned" || rowData.state === "Scammer") {
          fillColor = "FFFF0000"; // Red
        } else if (rowData.state === "Done") {
          fillColor = "FF00B050"; // Green
        }

        if (fillColor) {
          row.eachCell({ includeEmpty: true }, (cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: fillColor }
            };
            cell.font = { color: { argb: "FFFFFFFF" }, bold: true }; // White bold text
          });
        }
      });
      
      const buffer = await wb.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `contracts ${dateSlug}.xlsx`);
      toast(`contracts ${dateSlug}.xlsx downloaded`);
    }
  }
  
  function styleBaseSheet(ws) {
    // 1. Style Headers
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;
    
    // 2. Style all cells (alignment & wrap)
    ws.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (rowNumber > 1) {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
        }
      });
    });
  }

  function exportJson() {
    const payload = { ...data, _history: history, _prefs: prefs, _exportedAt: Date.now() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `backup_${todaySlug()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    try { localStorage.setItem(BACKUP_TS_KEY, String(Date.now())); } catch(e){}
    toast("Backup exported");
  }
  function importJson(file) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!Array.isArray(imported.influencers) || !Array.isArray(imported.contracts)) throw new Error("bad format");
        if (confirm("Replace ALL current data with this backup?")) {
          data = {
            influencers: imported.influencers.map(r => migrateRow(r, "influencer")),
            contracts: imported.contracts.map(r => migrateRow(r, "contract"))
          };
          if (Array.isArray(imported._history)) {
            history = imported._history.filter(h => h && h.entity && h.data);
          }
          if (imported._prefs) prefs = Object.assign(prefs, imported._prefs);
          save(); savePrefs();
          cleanupHistory();
          saveHistory();
          if (activeTab === "influencers") renderInfluencers();
          else if (activeTab === "contracts") renderContracts();
          else { histView = "days"; renderHistory(); }
          toast("Backup restored");
        }
      } catch (e) { toast("Invalid backup file", { icon: "trash" }); }
    };
    reader.readAsText(file);
  }

  function checkBackupReminder() {
    try {
      const last = Number(localStorage.getItem(BACKUP_TS_KEY) || 0);
      const days = last ? (Date.now() - last) / (1000*60*60*24) : 999;
      if (days >= 3) {
        setTimeout(() => {
          toast("It's been " + (last ? Math.floor(days) + " days" : "a while") + " since your last backup", {
            icon: "check", actionLabel: "Backup now", duration: 8000,
            onAction: exportJson
          });
        }, 2000);
      }
    } catch(e){}
  }

  function checkDailyInfluencerReset() {
    const todayK = todayKey();
    let lastK = null;
    try { lastK = localStorage.getItem(DAILY_RESET_KEY); } catch(e){}
    if (lastK === todayK) return;

    if (data.influencers.length > 0) {
      const count = data.influencers.length;
      data.influencers = [];
      save();
      try { localStorage.setItem(DAILY_RESET_KEY, todayK); } catch(e){}
      setTimeout(() => {
        toast(`Archived ${count} influencer${count===1?"":"s"} from yesterday — History has them`, {
          icon: "check", duration: 5000
        });
      }, 1500);
    } else {
      try { localStorage.setItem(DAILY_RESET_KEY, todayK); } catch(e){}
    }
  }

  function scheduleMidnightReset() {
    function msUntilMidnight() {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      return next - now;
    }
    function setNext() {
      const delay = msUntilMidnight();
      setTimeout(() => {
        if (data.influencers.length > 0) {
          const count = data.influencers.length;
          data.influencers = [];
          save();
          try { localStorage.setItem(DAILY_RESET_KEY, todayKey()); } catch(e){}
          if (activeTab === "influencers") renderInfluencers();
          toast(`New day — archived ${count} influencer${count===1?"":"s"} to History`, {
            icon: "check", duration: 5000
          });
        } else {
          try { localStorage.setItem(DAILY_RESET_KEY, todayKey()); } catch(e){}
        }
        setNext();
      }, delay);
    }
    setNext();
  }

  function scheduleMidnightWarning() {
    function msUntilWarning() {
      const now = new Date();
      const warn = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 55, 0);
      if (warn <= now) warn.setDate(warn.getDate() + 1);
      return warn - now;
    }
    function setNext() {
      setTimeout(() => {
        if (data.influencers.length > 0) {
          toast("New day in 5 minutes — influencers will be archived to History", {
            icon: "clock", duration: 6000
          });
        }
        setNext();
      }, msUntilWarning());
    }
    setNext();
  }

  function init() {
    load();
    loadPrefs();
    initTheme();
    checkDailyInfluencerReset();
    initTabs();
    initSortHeaders();

    const bind = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener("click", fn); };
    bind("addInfBtn", addInfluencer);
    bind("pickRandomInfBtn", pickRandomInfluencerFromHistory);
    bind("addConBtn", addContract);
    bind("downloadExcel", downloadExcel);
    bind("exportJson", exportJson);
    bind("modalCloseX", closeModal);
    bind("modalCancel", closeModal);
    bind("modalSave", saveModal);
    bind("csvModalClose", closeCsvModal);
    bind("csvModalCancel", closeCsvModal);
    bind("csvModalImport", doCsvImport);
    bind("exportHistCsv", exportHistoryCsv);
    bind("histBackBtn", closeDayDetail);
    bind("histLoadMoreBtn", () => { histDaysShown += 30; renderHistory(); });
    bind("scrambleInfBtn", scrambleInfluencers);
    bind("scrambleConBtn", scrambleContracts);
    bind("clearHist", () => {
      if (!history.length) { toast("History already empty"); return; }
      if (confirm("Clear ALL history? This cannot be undone.")) {
        history = [];
        saveHistory();
        renderHistory();
        toast("History cleared");
      }
    });

    $$(".hist-tab").forEach(t => {
      t.addEventListener("click", () => setHistDetailFilter(t.dataset.histTab));
    });

    const histSearch = $("#histSearch");
    if (histSearch) histSearch.addEventListener("input", () => { histDaysShown = 30; renderHistory(); });
    const histMonthFilter = $("#histMonthFilter");
    if (histMonthFilter) histMonthFilter.addEventListener("change", () => { histDaysShown = 30; renderHistory(); });
    const histDetailSearch = $("#histDetailSearch");
    if (histDetailSearch) histDetailSearch.addEventListener("input", () => renderHistoryDetail());

    const importInput = $("#importJson");
    if (importInput) importInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) importJson(file);
      e.target.value = "";
    });

    const importInfCsv = $("#importInfCsv");
    if (importInfCsv) importInfCsv.addEventListener("change", (e) => {
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
    const importConCsv = $("#importConCsv");
    if (importConCsv) importConCsv.addEventListener("change", (e) => {
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

    const importInfXlsx = $("#importInfXlsx");
    if (importInfXlsx) importInfXlsx.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleXlsxFile(file, "influencers");
      e.target.value = "";
    });
    const importConXlsx = $("#importConXlsx");
    if (importConXlsx) importConXlsx.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) handleXlsxFile(file, "contracts");
      e.target.value = "";
    });

    const csvText = $("#csvText");
    if (csvText) csvText.addEventListener("input", updateCsvPreview);

    const infSearch = $("#infSearch");
    if (infSearch) infSearch.addEventListener("input", renderInfluencers);
    const conSearch = $("#conSearch");
    if (conSearch) conSearch.addEventListener("input", renderContracts);

    const modal = $("#modal");
    if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    const csvModal = $("#csvModal");
    if (csvModal) csvModal.addEventListener("click", (e) => { if (e.target === csvModal) closeCsvModal(); });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (modal && !modal.hidden) { closeModal(); return; }
        if (csvModal && !csvModal.hidden) { closeCsvModal(); return; }
        if (activeTab === "history" && histView === "detail") { closeDayDetail(); return; }
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
    renderContracts();
    updateLastSaved();
    updateStatus("Influencers");
    checkBackupReminder();
    scheduleMidnightReset();
    scheduleMidnightWarning();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
          
