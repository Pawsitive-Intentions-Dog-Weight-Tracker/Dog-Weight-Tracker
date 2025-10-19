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
    // oldDogs were strings of names; create objects with generated ids
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

// ----- Utilities -----------------------------------------------------------
function todayLocalDatetimeValue() {
  // Return default value for <input type="datetime-local"> in local time
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function byName(dogId) {
  return dogs.find(d => d.id === dogId)?.name || '';
}
function getDog(dogId) {
  return dogs.find(d => d.id === dogId) || null;
}
function formatKg(n) {
  const x = Number(n);
  return isFinite(x) ? x.toFixed(2) : '';
}

// ----- Init ----------------------------------------------------------------
function init() {
  dtInput.value = todayLocalDatetimeValue();
  renderDogs();
  renderEntries();
}
document.addEventListener('DOMContentLoaded', init);

// ----- Dogs ----------------------------------------------------------------
function renderDogs() {
  dogSelect.innerHTML = '';
  if (dogs.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Add a dog first —';
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
  newDogName.value = '';
  newOwner.value = '';
  newBreed.value = '';
  renderDogs();
  renderEntries();
});

deleteDogBtn.addEventListener('click', () => {
  const dogId = dogSelect.value;
  if (!dogId) return;
  const dog = getDog(dogId);
  if (!dog) return;
  if (!confirm(`Delete "${dog.name}" and ALL its entries?`)) return;
  dogs = dogs.filter(d => d.id !== dogId);
  entries = entries.filter(e => e.dogId !== dogId);
  save(LS_KEYS.dogs, dogs);
  save(LS_KEYS.entries, entries);
  renderDogs();
  renderEntries();
});

// ----- Entries -------------------------------------------------------------
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

    const tdDT = document.createElement('td');
    tdDT.textContent = e.dtISO.replace('T', ' ').slice(0,16);
    tr.appendChild(tdDT);

    const tdDog = document.createElement('td');
    tdDog.textContent = d?.name ?? '';
    tr.appendChild(tdDog);

    const tdOwner = document.createElement('td');
    tdOwner.textContent = d?.owner ?? '';
    tr.appendChild(tdOwner);

    const tdBreed = document.createElement('td');
    tdBreed.textContent = d?.breed ?? '';
    tr.appendChild(tdBreed);

    const tdWeight = document.createElement('td');
    tdWeight.textContent = formatKg(e.weight);
    tr.appendChild(tdWeight);

    const tdNotes = document.createElement('td');
    tdNotes.textContent = e.notes || '';
    tr.appendChild(tdNotes);

    const tdDel = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Delete';
    btn.className = 'danger';
    btn.addEventListener('click', () => {
      if (!confirm('Delete this entry?')) return;
      entries = entries.filter(x => x.id !== e.id);
      save(LS_KEYS.entries, entries);
      renderEntries();
    });
    tdDel.appendChild(btn);
    tr.appendChild(tdDel);

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

  weightInput.value = '';
  notesInput.value = '';
  dtInput.value = todayLocalDatetimeValue();
  renderEntries();
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
        (d?.name ?? ''),
        (d?.owner ?? ''),
        (d?.breed ?? ''),
        r.dtISO,
        Number(r.weight).toFixed(2),
        `"${n}"`
      ].join(','));
    } else {
      lines.push([
        r.dtISO,
        Number(r.weight).toFixed(2),
        `"${n}"`
      ].join(','));
    }
  }
  return lines.join('\n');
}
function download(filename, text, type='text/plain') {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href:url, download:filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
  const file = ev.target.files?.[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data.dogs) || !Array.isArray(data.entries)) throw new Error('Invalid file');
    if (!confirm('Replace current data on this device with the backup?')) return;
    dogs = data.dogs;
    entries = data.entries;
    save(LS_KEYS.dogs, dogs);
    save(LS_KEYS.entries, entries);
    renderDogs();
    renderEntries();
    alert('Restore complete.');
  } catch (e) {
    alert('That file is not a valid backup.');
  } finally {
    ev.target.value = '';
  }
});

// Clear all
clearAllBtn.addEventListener('click', () => {
  if (!confirm('This will remove ALL data for this app on this device. Continue?')) return;
  dogs = [];
  entries = [];
  save(LS_KEYS.dogs, dogs);
  save(LS_KEYS.entries, entries);
  renderDogs();
  renderEntries();
});
