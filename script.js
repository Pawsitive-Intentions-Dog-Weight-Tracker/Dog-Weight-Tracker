// --- Simple local storage DB ----------------------------------------------
const LS_KEYS = {
  dogs: 'dwt_dogs',
  entries: 'dwt_entries'
};
const todayISO = () => new Date().toISOString().slice(0,10);

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let dogs = load(LS_KEYS.dogs, []);                 // ["Raq", "Pip"]
let entries = load(LS_KEYS.entries, []);           // [{id, dog, date, weight, notes}]

// --- Elements --------------------------------------------------------------
const dogSelect = document.querySelector('#dogSelect');
const newDogName = document.querySelector('#newDogName');
const addDogBtn = document.querySelector('#addDogBtn');
const deleteDogBtn = document.querySelector('#deleteDogBtn');

const dateInput = document.querySelector('#dateInput');
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

// --- Init ------------------------------------------------------------------
function init() {
  dateInput.value = todayISO();
  renderDogs();
  renderEntries();
}
document.addEventListener('DOMContentLoaded', init);

// --- Dogs ------------------------------------------------------------------
function renderDogs() {
  dogSelect.innerHTML = '';
  if (dogs.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— Add a dog first —';
    dogSelect.appendChild(opt);
    dogSelect.disabled = false;
    return;
  }
  dogs.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    dogSelect.appendChild(opt);
  });
  // Keep selection stable
  if (!dogs.includes(dogSelect.value)) {
    dogSelect.value = dogs[0];
  }
}

addDogBtn.addEventListener('click', () => {
  const name = (newDogName.value || '').trim();
  if (!name) return alert('Enter a dog name.');
  if (dogs.includes(name)) return alert('That name already exists.');
  dogs.push(name);
  save(LS_KEYS.dogs, dogs);
  newDogName.value = '';
  renderDogs();
});

deleteDogBtn.addEventListener('click', () => {
  const dog = dogSelect.value;
  if (!dog) return;
  if (!confirm(`Delete "${dog}" and ALL its entries?`)) return;
  dogs = dogs.filter(d => d !== dog);
  entries = entries.filter(e => e.dog !== dog);
  save(LS_KEYS.dogs, dogs);
  save(LS_KEYS.entries, entries);
  renderDogs();
  renderEntries();
});

// --- Entries ---------------------------------------------------------------
function renderEntries() {
  const dog = dogSelect.value;
  const filtered = dog ? entries.filter(e => e.dog === dog) : [];
  filtered.sort((a,b) => b.date.localeCompare(a.date)); // newest first

  entriesTitle.textContent = dog ? `Entries — ${dog}` : 'Entries';

  entriesBody.innerHTML = '';
  for (const e of filtered) {
    const tr = document.createElement('tr');

    const tdDate = document.createElement('td');
    tdDate.textContent = e.date;
    tr.appendChild(tdDate);

    const tdWeight = document.createElement('td');
    tdWeight.textContent = Number(e.weight).toFixed(2);
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
  const dog = dogSelect.value;
  if (!dog) return alert('Select a dog first.');
  const date = dateInput.value || todayISO();
  const weight = parseFloat(String(weightInput.value).replace(',', '.'));
  if (!isFinite(weight)) return alert('Enter a numeric weight in kg (e.g., 21.3).');
  const notes = (notesInput.value || '').trim();

  entries.push({
    id: crypto.randomUUID(),
    dog, date, weight, notes
  });
  save(LS_KEYS.entries, entries);
  weightInput.value = '';
  notesInput.value = '';
  renderEntries();
});

// --- Export / Backup -------------------------------------------------------
function toCsv(rows) {
  const header = ['dog','date','weight_kg','notes'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const n = (r.notes ?? '').replaceAll('"','""');
    lines.push([r.dog, r.date, Number(r.weight).toFixed(2), `"${n}"`].join(','));
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
  const dog = dogSelect.value;
  if (!dog) return alert('Select a dog first.');
  const rows = entries.filter(e => e.dog === dog).sort((a,b)=>a.date.localeCompare(b.date));
  if (rows.length === 0) return alert('No entries for this dog.');
  download(`${dog}-weights.csv`, toCsv(rows), 'text/csv');
});

exportAllCsvBtn.addEventListener('click', () => {
  if (entries.length === 0) return alert('No entries recorded.');
  const rows = [...entries].sort((a,b)=> a.dog.localeCompare(b.dog) || a.date.localeCompare(b.date));
  download(`all-dog-weights.csv`, toCsv(rows), 'text/csv');
});

// Backup/Restore JSON
backupJsonBtn.addEventListener('click', () => {
  const payload = { dogs, entries, exportedAt: new Date().toISOString() };
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
