/* ============ STORAGE ============ */
const STORAGE_KEY = "inf_contract_manager_v2";

let data = { influencers: [], contracts: [] };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch(e) {}
  if (!Array.isArray(data.influencers)) data.influencers = [];
  if (!Array.isArray(data.contracts)) data.contracts = [];
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderCounts();
}

/* ============ TOAST ============ */
let toastTimer;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
}

/* ============ TABS ============ */
document.querySelectorAll(".tab").forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(tab.dataset.tab).classList.add("active");
  };
});

/* ============ COUNTS ============ */
function renderCounts() {
  document.getElementById("infBadge").textContent = data.influencers.length;
  document.getElementById("conBadge").textContent = data.contracts.length;
}

/* ============ INFLUENCERS ============ */
function addInfluencer() {
  data.influencers.push({
    date: new Date().toLocaleDateString(),
    tg: "", fbName: "", fbLink: "", notes: ""
  });
  save(); renderInfluencers();
  toast("Influencer added");
}

function renderInfluencers() {
  const filter = (document.getElementById("infSearch")?.value || "").toLowerCase();
  const tbody = document.querySelector("#infTable tbody");
  const cards = document.getElementById("infCards");
  tbody.innerHTML = ""; cards.innerHTML = "";

  data.influencers.forEach((row, i) => {
    const matches = !filter || [row.tg,row.fbName,row.fbLink,row.notes]
      .some(v => (v||"").toLowerCase().includes(filter));
    if (!matches) return;

    // Desktop row
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td contenteditable="true" data-k="date">${esc(row.date)}</td>
      <td contenteditable="true" data-k="tg">${esc(row.tg)}</td>
      <td contenteditable="true" data-k="fbName">${esc(row.fbName)}</td>
      <td contenteditable="true" data-k="fbLink">${esc(row.fbLink)}</td>
      <td contenteditable="true" data-k="notes">${esc(row.notes)}</td>
      <td><button class="del-btn" data-del="${i}">✕</button></td>`;
    tr.querySelectorAll("[contenteditable]").forEach(td => {
      td.onblur = () => {
        data.influencers[i][td.dataset.k] = td.innerText.trim();
        save();
      };
    });
    tr.querySelector("[data-del]").onclick = () => delInfluencer(i);
    tbody.appendChild(tr);

    // Mobile card
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div class="card-title">${esc(row.tg) || "—"}</div>
        <button class="del-btn" data-del="${i}">✕</button>
      </div>
      <div class="card-sub">${esc(row.fbName) || "No FB name"}</div>
      <div class="card-sub">${esc(row.fbLink) || "No link"}</div>`;
    card.onclick = (e) => {
      if (e.target.dataset.del !== undefined) return;
      openInfluencerModal(i);
    };
    card.querySelector("[data-del]").onclick = (e) => {
      e.stopPropagation(); delInfluencer(i);
    };
    cards.appendChild(card);
  });
}

function delInfluencer(i) {
  if (!confirm("Delete this influencer?")) return;
  data.influencers.splice(i,1);
  save(); renderInfluencers();
  toast("Deleted");
}

/* ============ CONTRACTS ============ */
const STATES = ["Pending", "Done", "Account banned", "In progress"];
const stateClassMap = {
  "Done": "state-done",
  "Account banned": "state-banned",
  "Pending": "state-pending",
  "In progress": "state-progress"
};

function addContract() {
  data.contracts.push({
    agentLine: "", taskPosted: "", releaseTime: "", updateTime: "",
    contract: "", first: "", second: "", third: "",
    vloggerTg: "", domain: "", state: "Pending", myTg: ""
  });
  save(); renderContracts();
  toast("Contract added");
}

function renderContracts() {
  const filter = (document.getElementById("conSearch")?.value || "").toLowerCase();
  const tbody = document.querySelector("#conTable tbody");
  const cards = document.getElementById("conCards");
  tbody.innerHTML = ""; cards.innerHTML = "";

  data.contracts.forEach((row, i) => {
    const matches = !filter || [
      row.agentLine, row.vloggerTg, row.domain, row.myTg, row.contract, row.state
    ].some(v => (v||"").toLowerCase().includes(filter));
    if (!matches) return;

    // Desktop row
    const tr = document.createElement("tr");
    const fields = [
      "agentLine","taskPosted","releaseTime","updateTime","contract",
      "first","second","third","vloggerTg","domain"
    ];
    let html = "";
    fields.forEach(k => {
      html += `<td contenteditable="true" data-k="${k}">${esc(row[k])}</td>`;
    });
    html += `<td>
      <select class="state-select ${stateClassMap[row.state]||''}" data-state="${i}">
        ${STATES.map(s => `<option ${s===row.state?"selected":""}>${s}</option>`).join("")}
      </select>
    </td>`;
    html += `<td contenteditable="true" data-k="myTg">${esc(row.myTg)}</td>`;
    html += `<td><button class="del-btn" data-del="${i}">✕</button></td>`;
    tr.innerHTML = html;

    tr.querySelectorAll("[contenteditable]").forEach(td => {
      td.onblur = () => {
        data.contracts[i][td.dataset.k] = td.innerText.trim();
        save();
      };
    });
    const sel = tr.querySelector("select");
    sel.onchange = () => {
      data.contracts[i].state = sel.value;
      sel.className = "state-select " + (stateClassMap[sel.value]||"");
      save();
    };
    tr.querySelector("[data-del]").onclick = () => delContract(i);
    tbody.appendChild(tr);

    // Mobile card
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="card-head">
        <div>
          <div class="card-title">${esc(row.agentLine) || "—"}</div>
          <div class="card-sub">${esc(row.domain) || "No domain"}</div>
        </div>
        <span class="state-badge ${stateClassMap[row.state]||''}">${row.state||"Pending"}</span>
      </div>
      <div class="card-sub" style="margin-top:6px;">
        Vlogger: ${esc(row.vloggerTg) || "—"} · Contract: ${esc(row.contract) || "—"}
      </div>`;
    card.onclick = () => openContractModal(i);
    cards.appendChild(card);
  });
}

function delContract(i) {
  if (!confirm("Delete this contract?")) return;
  data.contracts.splice(i,1);
  save(); renderContracts();
  toast("Deleted");
}

/* ============ MODALS (mobile) ============ */
const modal = document.getElementById("modal");
let modalSaveCb = null;

function openModal(title, fields, onSave) {
  document.getElementById("modalTitle").textContent = title;
  const body = document.getElementById("modalBody");
  body.innerHTML = "";
  fields.forEach(f => {
    const wrap = document.createElement("div");
    wrap.className = "field";
    wrap.innerHTML = `<label>${f.label}</label>`;
    let input;
    if (f.type === "select") {
      input = document.createElement("select");
      f.options.forEach(o => {
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
    wrap.appendChild(input);
    body.appendChild(wrap);
  });
  modalSaveCb = onSave;
  modal.hidden = false;
}

function closeModal() {
  modal.hidden = true;
  modalSaveCb = null;
}

document.getElementById("modalSave").onclick = () => {
  if (!modalSaveCb) return;
  const values = {};
  document.querySelectorAll("#modalBody [data-k]").forEach(el => {
    values[el.dataset.k] = el.value.trim();
  });
  modalSaveCb(values);
  closeModal();
};

function openInfluencerModal(i) {
  const row = data.influencers[i];
  openModal("Edit Influencer", [
    { key: "date", label: "Date Added", value: row.date },
    { key: "tg", label: "TG Username", value: row.tg },
    { key: "fbName", label: "FB Name", value: row.fbName },
    { key: "fbLink", label: "FB Link", value: row.fbLink },
    { key: "notes", label: "Notes", value: row.notes },
  ], (v) => {
    Object.assign(data.influencers[i], v);
    save(); renderInfluencers();
    toast("Saved");
  });
}

function openContractModal(i) {
  const row = data.contracts[i];
  openModal("Edit Contract", [
    { key: "agentLine", label: "Agent Line", value: row.agentLine },
    { key: "taskPosted", label: "Task Posted", value: row.taskPosted },
    { key: "releaseTime", label: "Release Time", value: row.releaseTime },
    { key: "updateTime", label: "Update Time", value: row.updateTime },
    { key: "contract", label: "Contract", value: row.contract },
    { key: "first", label: "First Transaction", value: row.first },
    { key: "second", label: "Second Payment", value: row.second },
    { key: "third", label: "Third Payment", value: row.third },
    { key: "vloggerTg", label: "Vlogger's Telegram", value: row.vloggerTg },
    { key: "domain", label: "Promotional Domain", value: row.domain },
    { key: "state", label: "State", type: "select", options: STATES, value: row.state },
    { key: "myTg", label: "My Telegram Name", value: row.myTg },
  ], (v) => {
    Object.assign(data.contracts[i], v);
    save(); renderContracts();
    toast("Saved");
  });
}

/* ============ EXCEL ============ */
document.getElementById("downloadExcel").onclick = () => {
  if (!data.influencers.length && !data.contracts.length) {
    toast("Nothing to export"); return;
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

  const today = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `Influencer_Contracts_${today}.xlsx`);
  toast("Excel downloaded");
};

/* ============ JSON ============ */
document.getElementById("exportJson").onclick = () => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup exported");
};

document.getElementById("importJson").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (!Array.isArray(imported.influencers) || !Array.isArray(imported.contracts))
        throw new Error("bad format");
      if (confirm("Replace ALL current data with this backup?")) {
        data = imported;
        save(); renderInfluencers(); renderContracts();
        toast("Backup restored");
      }
    } catch {
      alert("Invalid backup file.");
    }
    e.target.value = "";
  };
  reader.readAsText(file);
};

/* ============ SEARCH ============ */
document.getElementById("infSearch").oninput = renderInfluencers;
document.getElementById("conSearch").oninput = renderContracts;

/* ============ HELPERS ============ */
function esc(s) {
  return String(s ?? "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;");
}

/* ============ INIT ============ */
load();
renderInfluencers();
renderContracts();
