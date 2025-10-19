// ===== Storage keys and helpers ===========================================
const LS_KEYS = {
  dogs: 'dwt_dogs_v2',      // [{id,name,owner,breed}]
  entries: 'dwt_entries_v2' // [{id,dogId,dtISO,weight,notes}]
};

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---- Migration from v1 (kept) ----
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

let dogs = load(LS_KEYS.dogs, []);       // in-memory working set
let entries = load(LS_KEYS.entries, []);

// ===== Utilities ===========================================================
function todayLocalDatetimeValue() {
  const d = new Date(); d.setSeconds(0, 0);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function getDog(dogId) { return dogs.find(d => d.id === dogId) || null; }
function formatKg(n) { const x = Number(n); return isFinite(x) ? x.toFixed(2) : ''; }

// Validation helpers
const MIN_KG = 0.50, MAX_KG = 120.00, FUTURE_GRACE_MIN = 10;
function parseWeight(input) {
  const w = parseFloat(String(input).replace(',', '.'));
  if (!isFinite(w)) return null;
  return Number(w.toFixed(2));
}
function isTooFuture(dtISO) {
  const t = new Date(dtISO).getTime();
  return t > (Date.now() + FUTURE_GRACE_MIN * 60 * 1000);
}
function lastWeightForDog(dogId) {
  const rows = entries.filter(e => e.dogId === dogId).sort((a,b)=> b.dtISO.localeCompare(a.dtISO));
  return rows.length ? Number(rows[0].weight) : null;
}
function confirmLargeChange(dogId, newW) {
  const last = lastWeightForDog(dogId);
  if (last == null) return true;
  const diff = Math.abs(newW - last) / Math.max(0.01, last);
  return diff <= 0.20 || confirm(`This differs more than 20% from the last weight (${last.toFixed(2)} kg). Continue?`);
}

// ===== Safe element getters & event helper =================================
const $ = (sel) => document.querySelector(sel);
function on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

function showSoftMessage(text) {
  // Put a subtle line below the header if something important is missing
  let bar = document.getElementById('soft-msg');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'soft-msg';
    bar.style.cssText = 'margin:8px auto;max-width:980px;padding:8px 12px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;color:#111;';
    const main = $('main');
    (main ?? document.body).insertBefore(bar, main?.firstChild || null);
  }
  bar.textContent = text;
}

// ===== Rendering ===========================================================
function renderDogs() {
  const dogSelect = $('#dogSelect');
  if (!dogSelect) return;

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

function renderEntries() {
  const dogSelect = $('#dogSelect');
  const entriesBody = $('#entriesBody');
  const entriesTitle = $('#entriesTitle');
  if (!entriesBody || !entriesTitle) return;

  const dogId = dogSelect?.value || null;
  const filtered = dogId ? entries.filter(e => e.dogId === dogId) : [];
  filtered.sort((a,b) => b.dtISO.localeCompare(a.dtISO)); // newest first
  const dog = dogId ? getDog(dogId) : null;
  entriesTitle.textContent = dog ? `Entries — ${dog.name}` : 'Entries';

  entriesBody.innerHTML = '';
  for (const e of filtered) {
    const d = getDog(e.dogId);
    const tr = document.createElement('tr');

    const tdDT = document.createElement('td'); tdDT.textContent = e.dtISO.replace('T',' ').slice(0,16); tr.appendChild(tdDT);
    const tdDog = document.createElement('td'); tdDog.textContent = d?.name ?? ''; tr.appendChild(tdDog);
    const tdOwner = document.createElement('td'); tdOwner.textContent = d?.owner ?? ''; tr.appendChild(tdOwner);
    const tdBreed = document.createElement('td'); tdBreed.textContent = d?.breed ?? ''; tr.appendChild(tdBreed);
    const tdWeight = document.createElement('td'); tdWeight.textContent = formatKg(e.weight); tr.appendChild(tdWeight);
    const tdNotes = document.createElement('td'); tdNotes.textContent = e.notes || ''; tr.appendChild(tdNotes);

    const tdAct = document.createElement('td');
    const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
    const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.className = 'danger'; delBtn.style.marginLeft = '6px';
    tdAct.appendChild(editBtn); tdAct.appendChild(delBtn); tr.appendChild(tdAct);

    on(editBtn, 'click', () => { editingId = e.id; renderEntries(); });
    on(delBtn, 'click', () => {
      if (!confirm('Delete this entry?')) return;
      entries = entries.filter(x => x.id !== e.id);
      save(LS_KEYS.entries, entries);
      renderEntries(); renderChart();
    });

    // If in edit mode for this row, swap cells for inputs
    if (editingId === e.id) {
      tr.innerHTML = '';
      // dt
      const tdDT2 = document.createElement('td');
      const dt = document.createElement('input'); dt.type = 'datetime-local'; dt.value = (e.dtISO||'').slice(0,16);
      tdDT2.appendChild(dt); tr.appendChild(tdDT2);
      // dog/owner/breed (read-only)
      const tdDog2 = document.createElement('td'); tdDog2.textContent = d?.name ?? ''; tr.appendChild(tdDog2);
      const tdOwner2 = document.createElement('td'); tdOwner2.textContent = d?.owner ?? ''; tr.appendChild(tdOwner2);
      const tdBreed2 = document.createElement('td'); tdBreed2.textContent = d?.breed ?? ''; tr.appendChild(tdBreed2);
      // weight
      const tdW = document.createElement('td');
      const w = document.createElement('input'); w.type='number'; w.step='0.01'; w.inputMode='decimal'; w.value = formatKg(e.weight);
      tdW.appendChild(w); tr.appendChild(tdW);
      // notes
      const tdN = document.createElement('td');
      const n = document.createElement('input'); n.type='text'; n.value = e.notes || '';
      tdN.appendChild(n); tr.appendChild(tdN);
      // actions
      const tdA = document.createElement('td');
      const saveBtn = document.createElement('button'); saveBtn.textContent = 'Save';
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancel'; cancelBtn.style.marginLeft='6px';
      tdA.appendChild(saveBtn); tdA.appendChild(cancelBtn); tr.appendChild(tdA);

      on(saveBtn,'click', () => {
        const dtVal = dt.value;
        if (!dtVal) return alert('Enter date & time.');
        if (isTooFuture(dtVal)) return alert('Date/time is in the future. Please adjust.');
        const weight = parseWeight(w.value);
        if (weight == null) return alert('Enter a numeric weight in kg (e.g., 21.30).');
        if (weight < MIN_KG || weight > MAX_KG) return alert(`Weight must be between ${MIN_KG.toFixed(2)} and ${MAX_KG.toFixed(2)} kg.`);
        if (!confirmLargeChange(e.dogId, weight)) return;

        const idx = entries.findIndex(x => x.id === e.id);
        if (idx !== -1) {
          entries[idx] = { ...entries[idx], dtISO: dtVal.length===16? dtVal+':00': dtVal, weight, notes: n.value.trim() };
          save(LS_KEYS.entries, entries);
        }
        editingId = null; renderEntries(); renderChart();
      });
      on(cancelBtn,'click', () => { editingId = null; renderEntries(); });
    }

    entriesBody.appendChild(tr);
  }
}

// Tiny chart (unchanged)
function renderChart() {
  const canvas = $('#chart'); if (!canvas) return;
  const dogId = $('#dogSelect')?.value || null;
  const rows = dogId ? entries.filter(e => e.dogId === dogId) : [];
  rows.sort((a,b)=> a.dtISO.localeCompare(b.dtISO));

  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width));
  canvas.height = Math.max(200, Math.floor(rect.height));
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0,0,canvas.width, canvas.height);

  if (rows.length === 0) {
    ctx.fillStyle = '#6b7280'; ctx.font = '14px system-ui';
    ctx.fillText('No data yet — add some weights to see the trend.', 12, 24);
    return;
  }

  const padL=40,padR=10,padT=10,padB=30;
  const W = canvas.width - padL - padR;
  const H = canvas.height - padT - padB;
  const xs = rows.map(r => new Date(r.dtISO).getTime());
  const ys = rows.map(r => Number(r.weight));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const yPad = (maxY - minY) === 0 ? 1 : (maxY - minY) * 0.1;
  const y0 = minY - yPad, y1 = maxY + yPad;
  const xScale = (t) => W * (t - minX) / ((maxX - minX) || 1);
  const yScale = (v) => H * (1 - (v - y0) / ((y1 - y0) || 1));

  ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+H); ctx.lineTo(padL+W,padT+H); ctx.stroke();

  ctx.fillStyle = '#6b7280'; ctx.font = '12px system-ui';
  const yTicks = [y0,(y0+y1)/2,y1];
  yTicks.forEach(v=>{ const y=padT+yScale(v); ctx.fillText(v.toFixed(1),4,y+4);
    ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+W,y); ctx.stroke();
  });

  ctx.strokeStyle = '#2f6f3e'; ctx.lineWidth = 2; ctx.beginPath();
  rows.forEach((r,i)=>{ const x=padL+xScale(new Date(r.dtISO).getTime()); const y=padT+yScale(Number(r.weight)); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  rows.forEach(r=>{ const x=padL+xScale(new Date(r.dtISO).getTime()); const y=padT+yScale(Number(r.weight)); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });

  const fmt = (d)=> new Date(d).toISOString().slice(0,10);
  ctx.fillStyle = '#6b7280';
  ctx.fillText(fmt(minX), padL, padT+H+22); ctx.textAlign='right'; ctx.fillText(fmt(maxX), padL+W, padT+H+22); ctx.textAlign='left';

  const last = rows[rows.length-1];
  const lx=padL+xScale(new Date(last.dtISO).getTime()); const ly=padT+yScale(Number(last.weight));
  ctx.fillStyle = '#2f6f3e'; ctx.font = '12px system-ui';
  ctx.fillText(`${Number(last.weight).toFixed(2)} kg`, lx+6, ly-8);
}

// ===== App wiring after DOM is ready ======================================
let editingId = null;

function initApp() {
  // If critical elements are missing, tell the user but keep going
  if (!$('#entriesBody') || !$('#entriesTitle')) showSoftMessage('Heads up: Entries table not found in the page. Check index.html.');
  if (!$('#dogSelect')) showSoftMessage('Heads up: Dog selector not found in the page. Check index.html.');

  // Default date/time
  const dtInput = $('#dtInput');
  if (dtInput) dtInput.value = todayLocalDatetimeValue();

  // Dogs add/delete
  on($('#addDogBtn'),'click', () => {
    const name = ($('#newDogName')?.value || '').trim();
    const owner = ($('#newOwner')?.value || '').trim();
    const breed = ($('#newBreed')?.value || '').trim();
    if (!name) return alert('Enter a dog name.');
    if (dogs.some(d => d.name.toLowerCase() === name.toLowerCase() && d.owner.toLowerCase() === owner.toLowerCase())) {
      return alert('That dog (with this owner) already exists.');
    }
    const dog = { id: crypto.randomUUID(), name, owner, breed };
    dogs.push(dog); save(LS_KEYS.dogs, dogs);
    if ($('#newDogName')) $('#newDogName').value = '';
    if ($('#newOwner')) $('#newOwner').value = '';
    if ($('#newBreed')) $('#newBreed').value = '';
    renderDogs(); renderEntries(); renderChart();
  });

  on($('#deleteDogBtn'),'click', () => {
    const dogId = $('#dogSelect')?.value;
    if (!dogId) return;
    const dog = getDog(dogId); if (!dog) return;
    if (!confirm(`Delete "${dog.name}" and ALL its entries?`)) return;
    dogs = dogs.filter(d => d.id !== dogId);
    entries = entries.filter(e => e.dogId !== dogId);
    save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
    renderDogs(); renderEntries(); renderChart();
  });

  // Change selection
  on($('#dogSelect'),'change', () => { renderEntries(); renderChart(); });

  // Add entry
  on($('#addEntryBtn'),'click', () => {
    const dogId = $('#dogSelect')?.value;
    if (!dogId) return alert('Select a dog first.');
    const dtVal = $('#dtInput')?.value;
    if (!dtVal) return alert('Enter date & time.');
    if (isTooFuture(dtVal)) return alert('Date/time is in the future. Please adjust.');
    const weight = parseWeight($('#weightInput')?.value);
    if (weight == null) return alert('Enter a numeric weight in kg (e.g., 21.30).');
    if (weight < MIN_KG || weight > MAX_KG) return alert(`Weight must be between ${MIN_KG.toFixed(2)} and ${MAX_KG.toFixed(2)} kg.`);
    if (!confirmLargeChange(dogId, weight)) return;

    const notes = ($('#notesInput')?.value || '').trim();
    entries.push({ id: crypto.randomUUID(), dogId, dtISO: dtVal.length===16? dtVal+':00': dtVal, weight, notes });
    save(LS_KEYS.entries, entries);
    if ($('#weightInput')) $('#weightInput').value = '';
    if ($('#notesInput')) $('#notesInput').value = '';
    if ($('#dtInput')) $('#dtInput').value = todayLocalDatetimeValue();
    renderEntries(); renderChart();
  });

  // Duplicate last
  on($('#dupLastBtn'),'click', () => {
    const dogId = $('#dogSelect')?.value;
    if (!dogId) return alert('Select a dog first.');
    const rows = entries.filter(e => e.dogId === dogId).sort((a,b)=> b.dtISO.localeCompare(a.dtISO));
    if (rows.length === 0) return alert('No previous entry to duplicate.');
    const last = rows[0];
    const dtNow = todayLocalDatetimeValue();
    const weight = Number(Number(last.weight).toFixed(2));
    if (!confirmLargeChange(dogId, weight)) return;
    entries.push({ id: crypto.randomUUID(), dogId, dtISO: dtNow.length===16? dtNow+':00': dtNow, weight, notes: last.notes || '' });
    save(LS_KEYS.entries, entries);
    renderEntries(); renderChart();
  });

  // Export/backup
  function toCsv(rows, includeDogInfo = true) {
    const header = includeDogInfo ? ['dog','owner','breed','datetime','weight_kg','notes'] : ['datetime','weight_kg','notes'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const d = getDog(r.dogId);
      const n = (r.notes ?? '').replaceAll('"','""');
      if (includeDogInfo) lines.push([(d?.name ?? ''),(d?.owner ?? ''),(d?.breed ?? ''),r.dtISO,Number(r.weight).toFixed(2),`"${n}"`].join(','));
      else lines.push([r.dtISO,Number(r.weight).toFixed(2),`"${n}"`].join(','));
    }
    return lines.join('\n');
  }
  function download(filename, text, type='text/plain') {
    const blob = new Blob([text], {type});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href:url, download:filename });
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  on($('#exportCsvBtn'),'click', () => {
    const dogId = $('#dogSelect')?.value;
    if (!dogId) return alert('Select a dog first.');
    const rows = entries.filter(e => e.dogId === dogId).sort((a,b)=> a.dtISO.localeCompare(b.dtISO));
    if (rows.length === 0) return alert('No entries for this dog.');
    const dog = getDog(dogId);
    download(`${dog.name}-weights.csv`, toCsv(rows), 'text/csv');
  });
  on($('#exportAllCsvBtn'),'click', () => {
    if (entries.length === 0) return alert('No entries recorded.');
    const rows = [...entries].sort((a,b)=> {
      const da = getDog(a.dogId)?.name ?? ''; const db = getDog(b.dogId)?.name ?? '';
      return da.localeCompare(db) || a.dtISO.localeCompare(b.dtISO);
    });
    download('all-dog-weights.csv', toCsv(rows), 'text/csv');
  });
  on($('#backupJsonBtn'),'click', () => {
    const payload = { dogs, entries, exportedAt: new Date().toISOString(), version: 2 };
    download('dog-weight-backup.json', JSON.stringify(payload,null,2), 'application/json');
  });
  on($('#restoreJsonInput'),'change', async (ev) => {
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
  on($('#clearAllBtn'),'click', () => {
    if (!confirm('This will remove ALL data for this app on this device. Continue?')) return;
    dogs = []; entries = [];
    save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
    renderDogs(); renderEntries(); renderChart();
  });

  // About modal (safe bind)
  on($('#aboutBtn'),'click', () => { const m=$('#aboutModal'); if (m) m.hidden = false; });
  on($('#aboutClose'),'click', () => { const m=$('#aboutModal'); if (m) m.hidden = true; });
  on($('#aboutModal'),'click', (e) => { if (e.target === $('#aboutModal')) $('#aboutModal').hidden = true; });

  // First render
  renderDogs(); renderEntries(); renderChart();
}

// Install prompt (safe)
let deferredPrompt = null;
function wireInstall() {
  const installBtn = $('#installBtn');
  if (installBtn) installBtn.style.display = 'none';
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (installBtn) installBtn.style.display = 'inline-block';
  });
  on(installBtn,'click', async () => {
    if (!deferredPrompt) { alert('Use your browser menu: "Add to Home Screen" / "Install App".'); return; }
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null;
    if (installBtn) installBtn.style.display = 'none';
  });
  window.addEventListener('appinstalled', () => { if (installBtn) installBtn.style.display = 'none'; });
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { wireInstall(); initApp(); });
} else {
  wireInstall(); initApp();
}
