// ----- Storage keys and helpers -------------------------------------------
const LS_KEYS = {
  dogs: 'dwt_dogs_v2',      // v2: array of {id,name,owner,breed}
  entries: 'dwt_entries_v2' // v2: array of {id,dogId,dtISO,weight,notes}
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Migration from v1 if needed
(function migrate() {
  const oldDogs = JSON.parse(localStorage.getItem('dwt_dogs') || 'null');
  const oldEntries = JSON.parse(localStorage.getItem('dwt_entries') || 'null');
  if (oldDogs && Array.isArray(oldDogs) && !localStorage.getItem(LS_KEYS.dogs)) {
    const v2Dogs = oldDogs.map(name => ({ id: crypto.randomUUID(), name, owner: '', breed: '' }));
    const nameToId = Object.fromEntries(v2Dogs.map(d => [d.name, d.id]));
    let v2Entries = [];
    if (oldEntries && Array.isArray(oldEntries)) {
      v2Entries = oldEntries.map(e => ({
        id: e.id || crypto.randomUUID(),
        dogId: nameToId[e.dog] || null,
        dtISO: e.date ? (e.date.length === 10 ? e.date + 'T00:00:00' : e.date) : new Date().toISOString(),
        weight: e.weight,
        notes: e.notes || ''
      })).filter(e => e.dogId);
    }
    localStorage.setItem(LS_KEYS.dogs, JSON.stringify(v2Dogs));
    localStorage.setItem(LS_KEYS.entries, JSON.stringify(v2Entries));
  }
})();

let dogs = load(LS_KEYS.dogs, []);       // [{id,name,owner,breed}]
let entries = load(LS_KEYS.entries, []); // [{id,dogId,dtISO,weight,notes}]

// ----- Elements ------------------------------------------------------------
const dogSelect = document.querySelector('#dogSelect');
const newDogName = document.querySelector('#newDogName');
const newOwner = document.querySelector('#newOwner');
const newBreed = document.querySelector('#newBreed');
const addDogBtn = document.querySelector('#addDogBtn');
const deleteDogBtn = document.querySelector('#deleteDogBtn');

const dtInput = document.querySelector('#dtInput');
const weightInput = document.querySelector('#weightInput');
const notesInput = document.querySelector('#notesInput');
const addEntryBtn = document.querySelector('#addEntryBtn');

const exportCsvBtn = document.querySelector('#exportCsvBtn');
const exportAllCsvBtn = document.querySelector('#exportAllCsvBtn');
const backupJsonBtn = document.querySelector('#backupJsonBtn');
const restoreJsonInput = document.querySelector('#restoreJsonInput');
const clearAllBtn = document.querySelector('#clearAllBtn');

const entriesBody = document.querySelector('#entriesBody');
const entriesTitle = document.querySelector('#entriesTitle');
const chartCanvas = document.querySelector('#chart');
const dupLastBtn = document.querySelector('#dupLastBtn');

// Install prompt
let deferredPrompt = null;
const installBtn = document.querySelector('#installBtn');
if (installBtn) installBtn.style.display = 'none';

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.style.display = 'inline-block';
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) {
    alert('If you do not see an Install prompt, use your browser menu: "Add to Home Screen" or "Install App".');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.style.display = 'none';
});
window.addEventListener('appinstalled', () => { if (installBtn) installBtn.style.display = 'none'; });

// ----- Utilities -----------------------------------------------------------
function todayLocalDatetimeValue() {
  const d = new Date(); d.setSeconds(0, 0);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getDog(dogId) { return dogs.find(d => d.id === dogId) || null; }
function formatKg(n) { const x = Number(n); return isFinite(x) ? x.toFixed(2) : ''; }

// ----- Init ----------------------------------------------------------------
function init() {
  dtInput.value = todayLocalDatetimeValue();
  renderDogs();
  renderEntries();
  renderChart();
}
document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => renderChart());

// ----- Dogs ----------------------------------------------------------------
function renderDogs() {
  dogSelect.innerHTML = '';
  if (dogs.length === 0) {
    const opt = document.createElement('option');
    opt.value = ''; opt.textContent = '— Add a dog first —';
    dogSelect.appendChild(opt);
    return;
  }
  for (const d of dogs) {
    const opt = document.createElement('option');
    opt.value = d.id;
    const parts = [d.name];
    const suffix = [];
    if (d.owner) suffix.push(d.owner);
    if (d.breed) suffix.push(`(${d.breed})`);
    if (suffix.length) parts.push('—', suffix.join(' '));
    opt.textContent = parts.join(' ');
    dogSelect.appendChild(opt);
  }
  if (!dogs.some(d => d.id === dogSelect.value)) {
    dogSelect.value = dogs[0].id;
  }
}
dogSelect?.addEventListener('change', () => { renderEntries(); renderChart(); });

addDogBtn.addEventListener('click', () => {
  const name = (newDogName.value || '').trim();
  const owner = (newOwner.value || '').trim();
  const breed = (newBreed.value || '').trim();
  if (!name) return alert('Enter a dog name.');
  if (dogs.some(d => d.name.toLowerCase() === name.toLowerCase() && d.owner.toLowerCase() === owner.toLowerCase())) {
    return alert('That dog (with this owner) already exists.');
  }
  const dog = { id: crypto.randomUUID(), name, owner, breed };
  dogs.push(dog);
  save(LS_KEYS.dogs, dogs);
  newDogName.value = ''; newOwner.value = ''; newBreed.value = '';
  renderDogs(); renderEntries(); renderChart();
});

deleteDogBtn.addEventListener('click', () => {
  const dogId = dogSelect.value;
  if (!dogId) return;
  const dog = getDog(dogId);
  if (!dog) return;
  if (!confirm(`Delete "${dog.name}" and ALL its entries?`)) return;
  dogs = dogs.filter(d => d.id !== dogId);
  entries = entries.filter(e => e.dogId !== dogId);
  save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
  renderDogs(); renderEntries(); renderChart();
});

// ----- Entries (with inline editing) --------------------------------------
let editingId = null; // which entry id is in edit mode

function renderEntries() {
  const dogId = dogSelect.value;
  const filtered = dogId ? entries.filter(e => e.dogId === dogId) : [];
  filtered.sort((a,b) => b.dtISO.localeCompare(a.dtISO)); // newest first
  const dog = getDog(dogId);
  entriesTitle.textContent = dog ? `Entries — ${dog.name}` : 'Entries';

  entriesBody.innerHTML = '';
  for (const e of filtered) {
    const d = getDog(e.dogId);
    const tr = document.createElement('tr');

    if (editingId === e.id) {
      // --- EDIT MODE ROW ---
      // Date/time editor
      const tdDT = document.createElement('td');
      const dt = document.createElement('input');
      dt.type = 'datetime-local';
      dt.value = (e.dtISO || '').slice(0,16);
      tdDT.appendChild(dt); tr.appendChild(tdDT);

      // Dog (read-only name)
      const tdDog = document.createElement('td'); tdDog.textContent = d?.name ?? ''; tr.appendChild(tdDog);
      const tdOwner = document.createElement('td'); tdOwner.textContent = d?.owner ?? ''; tr.appendChild(tdOwner);
      const tdBreed = document.createElement('td'); tdBreed.textContent = d?.breed ?? ''; tr.appendChild(tdBreed);

      // Weight editor
      const tdWeight = document.createElement('td');
      const w = document.createElement('input');
      w.type = 'number'; w.step = '0.01'; w.inputMode = 'decimal';
      w.value = formatKg(e.weight);
      tdWeight.appendChild(w); tr.appendChild(tdWeight);

      // Notes editor
      const tdNotes = document.createElement('td');
      const n = document.createElement('input');
      n.type = 'text'; n.value = e.notes || '';
      tdNotes.appendChild(n); tr.appendChild(tdNotes);

      // Actions: Save / Cancel
      const tdAct = document.createElement('td');
      const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel';
      cancelBtn.style.marginLeft = '6px';
      tdAct.appendChild(saveBtn); tdAct.appendChild(cancelBtn); tr.appendChild(tdAct);

      saveBtn.addEventListener('click', () => {
        const dtVal = dt.value;
        if (!dtVal) return alert('Enter date & time.');
        const weight = parseFloat(String(w.value).replace(',', '.'));
        if (!isFinite(weight)) return alert('Enter a numeric weight in kg (e.g., 21.30).');

        // Apply updates
        const idx = entries.findIndex(x => x.id === e.id);
        if (idx !== -1) {
          entries[idx] = {
            ...entries[idx],
            dtISO: dtVal.length === 16 ? dtVal + ':00' : dtVal,
            weight: Number(weight.toFixed(2)),
            notes: n.value.trim()
          };
          save(LS_KEYS.entries, entries);
        }
        editingId = null;
        renderEntries(); renderChart();
      });

      cancelBtn.addEventListener('click', () => {
        editingId = null;
        renderEntries();
      });

    } else {
      // --- READ MODE ROW ---
      const tdDT = document.createElement('td');
      tdDT.textContent = e.dtISO.replace('T', ' ').slice(0,16);
      tr.appendChild(tdDT);

      const tdDog = document.createElement('td'); tdDog.textContent = d?.name ?? ''; tr.appendChild(tdDog);
      const tdOwner = document.createElement('td'); tdOwner.textContent = d?.owner ?? ''; tr.appendChild(tdOwner);
      const tdBreed = document.createElement('td'); tdBreed.textContent = d?.breed ?? ''; tr.appendChild(tdBreed);

      const tdWeight = document.createElement('td'); tdWeight.textContent = formatKg(e.weight); tr.appendChild(tdWeight);

      const tdNotes = document.createElement('td'); tdNotes.textContent = e.notes || ''; tr.appendChild(tdNotes);

      const tdAct = document.createElement('td');
      const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
      const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.className = 'danger';
      delBtn.style.marginLeft = '6px';
      tdAct.appendChild(editBtn); tdAct.appendChild(delBtn); tr.appendChild(tdAct);

      editBtn.addEventListener('click', () => {
        editingId = e.id;
        renderEntries();
      });

      delBtn.addEventListener('click', () => {
        if (!confirm('Delete this entry?')) return;
        entries = entries.filter(x => x.id !== e.id);
        save(LS_KEYS.entries, entries);
        renderEntries(); renderChart();
      });
    }

    entriesBody.appendChild(tr);
  }
}

addEntryBtn.addEventListener('click', () => {
  const dogId = dogSelect.value;
  if (!dogId) return alert('Select a dog first.');
  const dtVal = dtInput.value;
  if (!dtVal) return alert('Enter date & time.');
  const weight = parseFloat(String(weightInput.value).replace(',', '.'));
  if (!isFinite(weight)) return alert('Enter a numeric weight in kg (e.g., 21.30).');

  const notes = (notesInput.value || '').trim();
  entries.push({
    id: crypto.randomUUID(),
    dogId,
    dtISO: dtVal.length === 16 ? dtVal + ':00' : dtVal, // normalise to seconds
    weight: Number(weight.toFixed(2)),
    notes
  });
  save(LS_KEYS.entries, entries);

  weightInput.value = ''; notesInput.value = ''; dtInput.value = todayLocalDatetimeValue();
  renderEntries(); renderChart();
});

// Duplicate last entry
dupLastBtn?.addEventListener('click', () => {
  const dogId = dogSelect.value;
  if (!dogId) return alert('Select a dog first.');
  const rows = entries.filter(e => e.dogId === dogId).sort((a,b)=> b.dtISO.localeCompare(a.dtISO));
  if (rows.length === 0) return alert('No previous entry to duplicate.');

  const last = rows[0];
  const dtNow = todayLocalDatetimeValue();
  entries.push({
    id: crypto.randomUUID(),
    dogId,
    dtISO: dtNow.length === 16 ? dtNow + ':00' : dtNow,
    weight: Number(Number(last.weight).toFixed(2)),
    notes: last.notes || ''
  });
  save(LS_KEYS.entries, entries);
  renderEntries(); renderChart();
});

// ----- Export / Backup -----------------------------------------------------
function toCsv(rows, includeDogInfo = true) {
  const header = includeDogInfo
    ? ['dog','owner','breed','datetime','weight_kg','notes']
    : ['datetime','weight_kg','notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const d = getDog(r.dogId);
    const n = (r.notes ?? '').replaceAll('"','""');
    if (includeDogInfo) {
      lines.push([
        (d?.name ?? ''), (d?.owner ?? ''), (d?.breed ?? ''), r.dtISO,
        Number(r.weight).toFixed(2), `"${n}"`
      ].join(','));
    } else {
      lines.push([r.dtISO, Number(r.weight).toFixed(2), `"${n}"`].join(','));
    }
  }
  return lines.join('\n');
}
function download(filename, text, type='text/plain') {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, download:filename });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

exportCsvBtn.addEventListener('click', () => {
  const dogId = dogSelect.value;
  if (!dogId) return alert('Select a dog first.');
  const rows = entries.filter(e => e.dogId === dogId).sort((a,b)=>a.dtISO.localeCompare(b.dtISO));
  if (rows.length === 0) return alert('No entries for this dog.');
  const dog = getDog(dogId);
  download(`${dog.name}-weights.csv`, toCsv(rows), 'text/csv');
});
exportAllCsvBtn.addEventListener('click', () => {
  if (entries.length === 0) return alert('No entries recorded.');
  const rows = [...entries].sort((a,b)=>{
    const da = getDog(a.dogId)?.name ?? '';
    const db = getDog(b.dogId)?.name ?? '';
    return da.localeCompare(db) || a.dtISO.localeCompare(b.dtISO);
  });
  download(`all-dog-weights.csv`, toCsv(rows), 'text/csv');
});

// Backup/Restore JSON
backupJsonBtn.addEventListener('click', () => {
  const payload = { dogs, entries, exportedAt: new Date().toISOString(), version: 2 };
  download('dog-weight-backup.json', JSON.stringify(payload,null,2), 'application/json');
});
restoreJsonInput.addEventListener('change', async (ev) => {
  const file = ev.target.files?.[0]; if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.dogs) || !Array.isArray(data.entries)) throw new Error('Invalid file');
    if (!confirm('Replace current data on this device with the backup?')) return;
    dogs = data.dogs; entries = data.entries;
    save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
    renderDogs(); renderEntries(); renderChart();
    alert('Restore complete.');
  } catch { alert('That file is not a valid backup.'); }
  finally { ev.target.value = ''; }
});

// Clear all
clearAllBtn.addEventListener('click', () => {
  if (!confirm('This will remove ALL data for this app on this device. Continue?')) return;
  dogs = []; entries = [];
  save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
  renderDogs(); renderEntries(); renderChart();
});

// ----- Tiny chart renderer (no libraries) ----------------------------------
function renderChart() {
  if (!chartCanvas) return;
  const dogId = dogSelect.value;
  const rows = dogId ? entries.filter(e => e.dogId === dogId) : [];
  rows.sort((a,b)=> a.dtISO.localeCompare(b.dtISO)); // oldest -> newest

  // Resize canvas to CSS size for crisp drawing
  const rect = chartCanvas.getBoundingClientRect();
  chartCanvas.width = Math.max(320, Math.floor(rect.width));
  chartCanvas.height = Math.max(200, Math.floor(rect.height));
  const ctx = chartCanvas.getContext('2d');

  // Clear
  ctx.clearRect(0,0,chartCanvas.width, chartCanvas.height);

  if (rows.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px system-ui';
    ctx.fillText('No data yet — add some weights to see the trend.', 12, 24);
    return;
  }

  // Padding
  const padL = 40, padR = 10, padT = 10, padB = 30;
  const W = chartCanvas.width - padL - padR;
  const H = chartCanvas.height - padT - padB;

  // Data ranges
  const xs = rows.map(r => new Date(r.dtISO).getTime());
  const ys = rows.map(r => Number(r.weight));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const yPad = (maxY - minY) === 0 ? 1 : (maxY - minY) * 0.1;
  const y0 = minY - yPad, y1 = maxY + yPad;

  const xScale = (t) => W * (t - minX) / ((maxX - minX) || 1);
  const yScale = (v) => H * (1 - (v - y0) / ((y1 - y0) || 1));

  // Axes
  ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT); ctx.lineTo(padL, padT+H); // y axis
  ctx.lineTo(padL+W, padT+H); // x axis
  ctx.stroke();

  // Y labels (min, mid, max)
  ctx.fillStyle = '#94a3b8'; ctx.font = '12px system-ui';
  const yTicks = [y0, (y0+y1)/2, y1];
  yTicks.forEach(v => {
    const y = padT + yScale(v);
    ctx.fillText(v.toFixed(1), 4, y+4);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL+W, y); ctx.stroke();
  });

  // Line
  ctx.strokeStyle = '#0f766e'; ctx.lineWidth = 2;
  ctx.beginPath();
  rows.forEach((r,i) => {
    const x = padL + xScale(new Date(r.dtISO).getTime());
    const y = padT + yScale(Number(r.weight));
    if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();

  // Points
  ctx.fillStyle = '#e5e7eb';
  rows.forEach(r => {
    const x = padL + xScale(new Date(r.dtISO).getTime());
    const y = padT + yScale(Number(r.weight));
    ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill();
  });

  // X labels: first and last date
  const fmt = (d)=> {
    const dd = new Date(d);
    return dd.toISOString().slice(0,10); // YYYY-MM-DD
  };
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(fmt(minX), padL, padT+H+22);
  ctx.textAlign = 'right';
  ctx.fillText(fmt(maxX), padL+W, padT+H+22);
  ctx.textAlign = 'left';

  // Last value label
  const last = rows[rows.length-1];
  const lx = padL + xScale(new Date(last.dtISO).getTime());
  const ly = padT + yScale(Number(last.weight));
  ctx.fillStyle = '#0f766e'; ctx.font = '12px system-ui';
  ctx.fillText(`${Number(last.weight).toFixed(2)} kg`, lx+6, ly-8);
}
