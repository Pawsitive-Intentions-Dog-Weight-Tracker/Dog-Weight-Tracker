// ===== Storage keys and helpers ===========================================
const LS_KEYS = { dogs: 'dwt_dogs_v2', entries: 'dwt_entries_v2', profile: 'dwt_profile_img' };
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

// ---- Migration from v1 (kept) ----
(function migrate() {
  const oldDogs = JSON.parse(localStorage.getItem('dwt_dogs') || 'null');
  const oldEntries = JSON.parse(localStorage.getItem('dwt_entries') || 'null');
  if (oldDogs && Array.isArray(oldDogs) && !localStorage.getItem(LS_KEYS.dogs)) {
    const v2Dogs = oldDogs.map(name => ({ id: crypto.randomUUID(), name, owner: '', breed: '' }));
    const nameToId = Object.fromEntries(v2Dogs.map(d => [d.name, d.id]));
    let v2Entries = [];
    if (oldEntries && Array.isArray(oldEntries)) {
      // normalise to date-only (YYYY-MM-DD)
      v2Entries = oldEntries.map(e => {
        const iso = e.date ? (e.date.length >= 10 ? e.date.slice(0,10) : e.date) : new Date().toISOString().slice(0,10);
        return {
          id: e.id || crypto.randomUUID(),
          dogId: nameToId[e.dog] || null,
          dtISO: iso, // date-only
          weight: e.weight,
          notes: e.notes || ''
        };
      }).filter(e => e.dogId);
    }
    localStorage.setItem(LS_KEYS.dogs, JSON.stringify(v2Dogs));
    localStorage.setItem(LS_KEYS.entries, JSON.stringify(v2Entries));
  }
})();

let dogs = load(LS_KEYS.dogs, []);
let entries = load(LS_KEYS.entries, []);
// --- One-time: trim any old datetime values to date-only (YYYY-MM-DD) ---
(function normaliseEntryDates(){
  let changed = false;
  for (const e of entries) {
    if (e && typeof e.dtISO === 'string' && e.dtISO.length > 10) {
      e.dtISO = e.dtISO.slice(0,10);
      changed = true;
    }
  }
  if (changed) save(LS_KEYS.entries, entries);
})();
let editingId = null;

// ===== Utilities & validation =============================================
const $ = s => document.querySelector(s);
const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

function todayLocalDateValue(){
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function getDog(id){ return dogs.find(d=>d.id===id)||null; }
function formatKg(n){ const x=Number(n); return isFinite(x)?x.toFixed(2):''; }
function formatUKDate(s){
  if (!s) return '';
  const iso = String(s).slice(0,10); // keep only YYYY-MM-DD
  const [y,m,d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
const MIN_KG=0.50, MAX_KG=120.00;
function parseWeight(input){ const w=parseFloat(String(input).replace(',','.')); if(!isFinite(w)) return null; return Number(w.toFixed(2)); }
function isFutureDate(dateStr){
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return d.getTime() > today.getTime();
}
function lastWeightForDog(dogId){ const rows=entries.filter(e=>e.dogId===dogId).sort((a,b)=>b.dtISO.localeCompare(a.dtISO)); return rows.length?Number(rows[0].weight):null; }
function confirmLargeChange(dogId,newW){ const last=lastWeightForDog(dogId); if(last==null) return true; const diff=Math.abs(newW-last)/Math.max(0.01,last); return diff<=0.20 || confirm(`This differs more than 20% from the last weight (${last.toFixed(2)} kg). Continue?`); }

// ===== Filters/sort state (date-only) =====================================
const filters = { from: null, to: null, owner: '', sort: 'date_desc' };
function applyFilters(rows){
  let out = rows.slice();
  if (filters.from) out = out.filter(r => r.dtISO >= filters.from);
  if (filters.to) out = out.filter(r => r.dtISO <= filters.to);
  if (filters.owner) out = out.filter(r => (getDog(r.dogId)?.owner || '').toLowerCase().includes(filters.owner.toLowerCase()));
  switch(filters.sort){
    case 'date_asc': out.sort((a,b)=> a.dtISO.localeCompare(b.dtISO)); break;
    case 'date_desc': out.sort((a,b)=> b.dtISO.localeCompare(a.dtISO)); break;
    case 'weight_asc': out.sort((a,b)=> Number(a.weight)-Number(b.weight)); break;
    case 'weight_desc': out.sort((a,b)=> Number(b.weight)-Number(a.weight)); break;
  }
  return out;
}

// ===== Rendering ===========================================================
function renderDogs(){
  const dogSelect = $('#dogSelect'); if (!dogSelect) return;
  dogSelect.innerHTML = '';
  if (dogs.length===0){
    const opt=document.createElement('option');
    opt.value=''; opt.textContent='— Add a dog first —';
    dogSelect.appendChild(opt);
    return;
  }
  for(const d of dogs){
    const opt=document.createElement('option'); opt.value=d.id;
    const parts=[d.name]; const suffix=[];
    if(d.owner) suffix.push(d.owner);
    if(d.breed) suffix.push(`(${d.breed})`);
    if (suffix.length) parts.push('—', suffix.join(' '));
    opt.textContent = parts.join(' ');
    dogSelect.appendChild(opt);
  }
  if(!dogs.some(d=>d.id===dogSelect.value)){ dogSelect.value=dogs[0].id; }
}

function renderEntries(){
  const dogSelect = $('#dogSelect');
  const entriesBody = $('#entriesBody');
  const title = $('#entriesTitle');
  const entriesCard = $('#entriesCard');
  const hint = $('#noEntriesHint');
  if (!entriesBody || !title || !entriesCard) return;

  let dogId = dogSelect?.value || null;
  if ((!dogId || !getDog(dogId)) && dogs.length > 0) {
    dogId = dogs[0].id;
    if (dogSelect) dogSelect.value = dogId;
  }

  const base = dogId ? entries.filter(e => e.dogId === dogId) : [];
  const filtered = applyFilters(base);

  entriesCard.style.display = '';
  if (hint) hint.hidden = base.length > 0;

  const dog = dogId ? getDog(dogId) : null;
  title.textContent = dog ? `Entries — ${dog.name}` : 'Entries';

  entriesBody.innerHTML = '';

  if (base.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No entries yet — add a weight below.';
    tr.appendChild(td);
    entriesBody.appendChild(tr);
    return;
  }

  for (const e of filtered){
    const d = getDog(e.dogId);
    const tr = document.createElement('tr');

    const tdDT = document.createElement('td');
    tdDT.dataset.label = 'Date';
    tdDT.textContent = formatUKDate(e.dtISO);
    tr.appendChild(tdDT);

    const tdOwner = document.createElement('td');
    tdOwner.dataset.label = 'Owner';
    tdOwner.textContent = d?.owner ?? '';
    tr.appendChild(tdOwner);

    const tdBreed = document.createElement('td');
    tdBreed.dataset.label = 'Breed';
    tdBreed.textContent = d?.breed ?? '';
    tr.appendChild(tdBreed);

    const tdW = document.createElement('td');
    tdW.dataset.label = 'Weight (kg)';
    tdW.textContent = formatKg(e.weight);
    tr.appendChild(tdW);

    const tdN = document.createElement('td');
    tdN.dataset.label = 'Notes';
    tdN.textContent = e.notes || '';
    tr.appendChild(tdN);

    const tdA = document.createElement('td');
    tdA.dataset.label = 'Actions';
    tdA.className = 'actions';
    const editBtn = document.createElement('button'); editBtn.textContent = 'Edit';
    const delBtn = document.createElement('button'); delBtn.textContent = 'Delete'; delBtn.className='danger'; delBtn.style.marginLeft='6px';
    tdA.appendChild(editBtn); tdA.appendChild(delBtn); tr.appendChild(tdA);

    on(editBtn,'click',()=> openEditModal(e.id));
    on(delBtn,'click',()=>{ if(!confirm('Delete this entry?')) return; entries = entries.filter(x=>x.id!==e.id); save(LS_KEYS.entries, entries); renderEntries(); renderChart(); });

    entriesBody.appendChild(tr);
  }

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No entries match the current filters.';
    tr.appendChild(td);
    entriesBody.appendChild(tr);
  }
}

// ----- Edit Modal ----------------------------------------------------------
function openEditModal(entryId){
  editingId = entryId;
  const e = entries.find(x => x.id === entryId); if (!e) return;
  $('#editDate').value = (e.dtISO || '').slice(0,10);
  $('#editWeight').value = formatKg(e.weight);
  $('#editNotes').value = e.notes || '';
  $('#editModal').hidden = false;
}
function closeEditModal(){ $('#editModal').hidden = true; editingId = null; }

on($('#editCancel'),'click', closeEditModal);
on($('#editModal'),'click', (ev)=>{ if (ev.target === $('#editModal')) closeEditModal(); });
on($('#editSave'),'click', ()=>{
  const e = entries.find(x => x.id === editingId); if (!e) return closeEditModal();
  const dtVal = $('#editDate').value;
  if (!dtVal) return alert('Enter a date.');
  if (isFutureDate(dtVal)) return alert('Date cannot be in the future.');
  const weight = parseWeight($('#editWeight').value);
  if (weight == null) return alert('Enter a numeric weight in kg (e.g., 21.30).');
  if (weight < MIN_KG || weight > MAX_KG) return alert(`Weight must be between ${MIN_KG.toFixed(2)} and ${MAX_KG.toFixed(2)} kg.`);
  if (!confirmLargeChange(e.dogId, weight)) return;

  e.dtISO = dtVal.slice(0,10);
  e.weight = weight;
  e.notes = ($('#editNotes').value || '').trim();
  save(LS_KEYS.entries, entries);
  closeEditModal();
  renderEntries(); renderChart();
});

// ----- Tiny chart renderer (no libraries) ----------------------------------
function renderChart(){
  const canvas=$('#chart'); if(!canvas) return;
  const dogId=$('#dogSelect')?.value||null;
  const rows = dogId ? entries.filter(e=>e.dogId===dogId) : [];
  rows.sort((a,b)=> a.dtISO.localeCompare(b.dtISO));

  const rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(320,Math.floor(rect.width));
  canvas.height=Math.max(200,Math.floor(rect.height));
  const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);

  if(rows.length===0){ ctx.fillStyle='#6b7280'; ctx.font='14px system-ui'; ctx.fillText('No data yet — add some weights to see the trend.',12,24); return; }

  const padL=40,padR=10,padT=10,padB=30, W=canvas.width-padL-padR, H=canvas.height-padT-padB;
  const xs=rows.map(r=> new Date(r.dtISO + 'T00:00:00').getTime());
  const ys=rows.map(r=> Number(r.weight));
  const minX=Math.min(...xs), maxX=Math.max(...xs), minY=Math.min(...ys), maxY=Math.max(...ys);
  const yPad=(maxY-minY)===0?1:(maxY-minY)*0.1; const y0=minY-yPad, y1=maxY+yPad;
  const xScale=t=> W*(t-minX)/((maxX-minX)||1); const yScale=v=> H*(1-(v-y0)/((y1-y0)||1));

  ctx.strokeStyle='#e5e7eb'; ctx.lineWidth=1; ctx.beginPath();
  ctx.moveTo(padL,padT); ctx.lineTo(padL,padT+H); ctx.lineTo(padL+W,padT+H); ctx.stroke();
  ctx.fillStyle='#6b7280'; ctx.font='12px system-ui';
  [y0,(y0+y1)/2,y1].forEach(v=>{ const y=padT+yScale(v); ctx.fillText(v.toFixed(1),4,y+4); ctx.strokeStyle='rgba(0,0,0,0.05)'; ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+W,y); ctx.stroke(); });

  ctx.strokeStyle='#2f6f3e'; ctx.lineWidth=2; ctx.beginPath();
  rows.forEach((r,i)=>{ const x=padL+xScale(new Date(r.dtISO + 'T00:00:00').getTime()); const y=padT+yScale(Number(r.weight)); if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
  ctx.fillStyle='#0f172a';
  rows.forEach(r=>{ const x=padL+xScale(new Date(r.dtISO + 'T00:00:00').getTime()); const y=padT+yScale(Number(r.weight)); ctx.beginPath(); ctx.arc(x,y,3,0,Math.PI*2); ctx.fill(); });
  const fmt=d=> new Date(d).toISOString().slice(0,10).split('-').reverse().join('/'); // UK label
  ctx.fillStyle='#6b7280'; ctx.fillText(fmt(minX),padL,padT+H+22); ctx.textAlign='right'; ctx.fillText(fmt(maxX),padL+W,padT+H+22); ctx.textAlign='left';
  const last=rows[rows.length-1]; const lx=padL+xScale(new Date(last.dtISO + 'T00:00:00').getTime()); const ly=padT+yScale(Number(last.weight));
  ctx.fillStyle='#2f6f3e'; ctx.font='12px system-ui'; ctx.fillText(`${Number(last.weight).toFixed(2)} kg`, lx+6, ly-8);
}

// ===== CSV + ZIP helpers ===================================================
function toCsv(rows, includeDogInfo=true){
  const header = includeDogInfo? ['dog','owner','breed','date','weight_kg','notes'] : ['date','weight_kg','notes'];
  const lines=[header.join(',')];
  for(const r of rows){
    const d=getDog(r.dogId); const n=(r.notes??'').replaceAll('"','""');
    if(includeDogInfo) lines.push([(d?.name??''),(d?.owner??''),(d?.breed??''),r.dtISO,Number(r.weight).toFixed(2),`"${n}"`].join(','));
    else lines.push([r.dtISO,Number(r.weight).toFixed(2),`"${n}"`].join(','));
  }
  return lines.join('\n');
}

// Minimal ZIP (STORE, no compression)
function crc32(buf){ let c=~0>>>0; for(let i=0;i<buf.length;i++){ c=(c>>>8)^CRC32_TABLE[(c^buf[i])&0xFF]; } return (~c)>>>0; }
const CRC32_TABLE = (()=>{ const t=new Uint32Array(256); for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c=((c&1)?(0xEDB88320^(c>>>1)):(c>>>1)); t[n]=c>>>0; } return t; })();
function strToU8(s){ return new TextEncoder().encode(s); }
function u32le(n){ const a=new Uint8Array(4); a[0]=n&255; a[1]=(n>>>8)&255; a[2]=(n>>>16)&255; a[3]=(n>>>24)&255; return a; }
function u16le(n){ const a=new Uint8Array(2); a[0]=n&255; a[1]=(n>>>8)&255; return a; }

function createZip(files){
  const fileRecs = [];
  let offset = 0;
  const chunks = [];

  for (const f of files){
    const nameU8 = strToU8(f.name);
    const data = f.data instanceof Uint8Array ? f.data : strToU8(String(f.data));
    const crc = crc32(data);
    const size = data.length;

    const LFH = [
      u32le(0x04034b50), u16le(20), u16le(0), u16le(0),
      u16le(0), u16le(0),
      u32le(crc), u32le(size), u32le(size),
      u16le(nameU8.length), u16le(0)
    ];
    chunks.push(...LFH, nameU8, data);

    fileRecs.push({ nameU8, crc, size, offset });
    offset += LFH.reduce((s,a)=>s+a.length,0) + nameU8.length + size;
  }

  const cdChunks = [];
  let cdSize = 0;
  for (const rec of fileRecs){
    const CDH = [
      u32le(0x02014b50),
      u16le(20), u16le(20), u16le(0), u16le(0), u16le(0), u16le(0),
      u32le(rec.crc), u32le(rec.size), u32le(rec.size),
      u16le(rec.nameU8.length), u16le(0), u16le(0),
      u16le(0), u16le(0), u32le(0),
      u32le(rec.offset)
    ];
    cdChunks.push(...CDH, rec.nameU8);
    cdSize += CDH.reduce((s,a)=>s+a.length,0) + rec.nameU8.length;
  }

  const cdStart = offset;
  const EOCD = [
    u32le(0x06054b50), u16le(0), u16le(0),
    u16le(fileRecs.length), u16le(fileRecs.length),
    u32le(cdSize), u32le(cdStart), u16le(0)
  ];

  const blob = new Blob([...chunks, ...cdChunks, ...EOCD], {type:'application/zip'});
  return blob;
}

// ===== App wiring ==========================================================
function initApp(){
  // Defaults
  if ($('#dtInput')) $('#dtInput').value = todayLocalDateValue();

  // Dogs — Add (robust handler)
  const addDogEl = document.querySelector('#addDogBtn');
  if (addDogEl) {
    addDogEl.addEventListener('click', () => {
      const name = (document.querySelector('#newDogName')?.value || '').trim();
      const owner = (document.querySelector('#newOwner')?.value || '').trim();
      const breed = (document.querySelector('#newBreed')?.value || '').trim();

      if (!name) { alert('Enter a dog name.'); document.querySelector('#newDogName')?.focus(); return; }

      const duplicate = dogs.some(d =>
        d.name.toLowerCase() === name.toLowerCase() &&
        (d.owner || '').toLowerCase() === owner.toLowerCase()
      );
      if (duplicate) { alert('That dog (with this owner) already exists.'); return; }

      const dog = { id: crypto.randomUUID(), name, owner, breed };
      dogs.push(dog);
      save(LS_KEYS.dogs, dogs);

      const n = document.querySelector('#newDogName');
      const o = document.querySelector('#newOwner');
      const b = document.querySelector('#newBreed');
      if (n) n.value = '';
      if (o) o.value = '';
      if (b) b.value = '';

      renderDogs();
      const sel = document.querySelector('#dogSelect');
      if (sel) sel.value = dog.id;

      renderEntries();
      renderChart();
    });
  }

  // Dogs — Delete (custom modal already in HTML)
  const confirmModal = $('#confirmModal');
  const confirmDogName = $('#confirmDogName');
  const confirmDeleteBtn = $('#confirmDeleteBtn');
  const confirmCancelBtn = $('#confirmCancelBtn');
  let pendingDeleteDogId = null;

  on($('#deleteDogBtn'),'click', ()=>{
    const dogId=$('#dogSelect')?.value;
    const dog=dogId ? getDog(dogId) : null;
    if(!dogId || !dog) return alert('Select a dog first.');
    pendingDeleteDogId = dogId;
    if (confirmDogName) confirmDogName.textContent = dog.name;
    if (confirmModal) confirmModal.hidden = false;
  });
  on(confirmCancelBtn,'click', ()=>{ pendingDeleteDogId = null; if (confirmModal) confirmModal.hidden = true; });
  on(confirmModal,'click', (e)=>{ if (e.target === confirmModal) { pendingDeleteDogId = null; confirmModal.hidden = true; } });
  on(confirmDeleteBtn,'click', ()=>{
    const dogId = pendingDeleteDogId;
    if (!dogId) { if (confirmModal) confirmModal.hidden = true; return; }
    dogs = dogs.filter(d => d.id !== dogId);
    entries = entries.filter(e => e.dogId !== dogId);
    save(LS_KEYS.dogs, dogs); save(LS_KEYS.entries, entries);
    pendingDeleteDogId = null;
    if (confirmModal) confirmModal.hidden = true;
    renderDogs(); renderEntries(); renderChart();
  });

  // Dog select change
  on($('#dogSelect'),'change', ()=>{ renderEntries(); renderChart(); });

  // Entries add / duplicate (date-only)
  on($('#addEntryBtn'),'click', ()=>{
    const dogId=$('#dogSelect')?.value; if(!dogId) return alert('Select a dog first.');
    const dtVal=$('#dtInput')?.value; if(!dtVal) return alert('Enter a date.');
    if(isFutureDate(dtVal)) return alert('Date cannot be in the future.');
    const weight=parseWeight($('#weightInput')?.value); if(weight==null) return alert('Enter a numeric weight in kg (e.g., 21.30).');
    if(weight<MIN_KG||weight>MAX_KG) return alert(`Weight must be between ${MIN_KG.toFixed(2)} and ${MAX_KG.toFixed(2)} kg.`);
    if(!confirmLargeChange(dogId, weight)) return;
    const notes=($('#notesInput')?.value||'').trim();
    entries.push({ id:crypto.randomUUID(), dogId, dtISO: dtVal.slice(0,10), weight, notes });
    save(LS_KEYS.entries, entries);
    if($('#weightInput')) $('#weightInput').value=''; if($('#notesInput')) $('#notesInput').value=''; if($('#dtInput')) $('#dtInput').value=todayLocalDateValue();
    renderEntries(); renderChart();
  });

  on($('#dupLastBtn'),'click', ()=>{
    const dogId=$('#dogSelect')?.value; if(!dogId) return alert('Select a dog first.');
    const rows=entries.filter(e=>e.dogId===dogId).sort((a,b)=>b.dtISO.localeCompare(a.dtISO));
    if(rows.length===0) return alert('No previous entry to duplicate.');
    const last=rows[0]; const dtNow=todayLocalDateValue(); const weight=Number(Number(last.weight).toFixed(2));
    if(!confirmLargeChange(dogId, weight)) return;
    entries.push({ id:crypto.randomUUID(), dogId, dtISO: dtNow, weight, notes:last.notes||'' });
    save(LS_KEYS.entries, entries); renderEntries(); renderChart();
  });

  // Filters & Sort
  on($('#filterFrom'),'change', e=>{ filters.from = e.target.value || null; renderEntries(); });
  on($('#filterTo'),'change', e=>{ filters.to = e.target.value || null; renderEntries(); });
  on($('#filterOwner'),'input', e=>{ filters.owner = e.target.value || ''; renderEntries(); });
  on($('#sortSelect'),'change', e=>{ filters.sort = e.target.value; renderEntries(); });
  on($('#clearFiltersBtn'),'click', ()=>{
    const fFrom=$('#filterFrom'), fTo=$('#filterTo'), fOwn=$('#filterOwner'), sSel=$('#sortSelect');
    if(fFrom) fFrom.value=''; if(fTo) fTo.value=''; if(fOwn) fOwn.value=''; if(sSel) sSel.value='date_desc';
    filters.from=null; filters.to=null; filters.owner=''; filters.sort='date_desc'; renderEntries();
  });

  // Export/backup/print
  function download(filename, blobOrText, type='text/plain'){
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], {type});
    const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }
  on($('#exportCsvBtn'),'click', ()=>{
    const dogId=$('#dogSelect')?.value; if(!dogId) return alert('Select a dog first.');
    const rows=entries.filter(e=>e.dogId===dogId).sort((a,b)=> a.dtISO.localeCompare(b.dtISO));
    if(rows.length===0) return alert('No entries for this dog.');
    const dog=getDog(dogId); download(`${dog.name}-weights.csv`, toCsv(rows), 'text/csv');
  });
  on($('#exportAllCsvBtn'),'click', ()=>{
    if(entries.length===0) return alert('No entries recorded.');
    const rows=[...entries].sort((a,b)=> (getDog(a.dogId)?.name??'').localeCompare(getDog(b.dogId)?.name??'') || a.dtISO.localeCompare(b.dtISO));
    download('all-dog-weights.csv', toCsv(rows), 'text/csv');
  });
  on($('#backupJsonBtn'),'click', ()=>{
    const payload={ dogs, entries, exportedAt:new Date().toISOString(), version:2 };
    download('dog-weight-backup.json', JSON.stringify(payload,null,2), 'application/json');
  });
  on($('#downloadZipBtn'),'click', ()=>{
    const dogsJson = JSON.stringify(dogs, null, 2);
    const entriesJson = JSON.stringify(entries, null, 2);
    const allRows=[...entries].sort((a,b)=> (getDog(a.dogId)?.name??'').localeCompare(getDog(b.dogId)?.name??'') || a.dtISO.localeCompare(b.dtISO));
    const csv = toCsv(allRows);
    const zip = createZip([
      {name:'dogs.json', data: strToU8(dogsJson)},
      {name:'entries.json', data: strToU8(entriesJson)},
      {name:'all-dog-weights.csv', data: strToU8(csv)}
    ]);
    download('dog-weight-backup.zip', zip, 'application/zip');
  });
  on($('#printBtn'),'click', ()=> window.print());

  // About modal
  on($('#aboutBtn'),'click', ()=> { const m=$('#aboutModal'); if(m) m.hidden=false; });
  on($('#aboutClose'),'click', ()=> { const m=$('#aboutModal'); if(m) m.hidden=true; });
  on($('#aboutModal'),'click', (e)=> { if (e.target === $('#aboutModal')) $('#aboutModal').hidden = true; });

  // Profile photo (device-only) — lives in the Entries header now
  const profileImg = $('#profileImg');
  const stored = localStorage.getItem(LS_KEYS.profile);
  if (stored && profileImg) profileImg.src = stored;
  on($('#profileFile'),'change', async (ev)=>{
    const file = ev.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      localStorage.setItem(LS_KEYS.profile, dataUrl);
      if (profileImg) profileImg.src = dataUrl;
    };
    reader.readAsDataURL(file);
    ev.target.value = '';
  });
  on($('#profileClearBtn'),'click', ()=>{
    localStorage.removeItem(LS_KEYS.profile);
    if (profileImg) profileImg.src = '';
  });

  // Initial render
  if ($('#dtInput')) $('#dtInput').value = todayLocalDateValue();
  renderDogs(); renderEntries(); renderChart();
}

// ===== Install prompt (PWA) ===============================================
let deferredPrompt=null;
function wireInstall(){
  const installBtn=$('#installBtn'); if(installBtn) installBtn.style.display='none';
  window.addEventListener('beforeinstallprompt',(e)=>{ e.preventDefault(); deferredPrompt=e; if(installBtn) installBtn.style.display='inline-block'; });
  on(installBtn,'click', async ()=>{
    if(!deferredPrompt){ alert('Use your browser menu: "Add to Home Screen" / "Install App".'); return; }
    deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; if(installBtn) installBtn.style.display='none';
  });
  window.addEventListener('appinstalled',()=>{ if($('#installBtn')) $('#installBtn').style.display='none'; });
}

// ===== Start when DOM is ready ============================================
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded', ()=>{ wireInstall(); initApp(); });
} else {
  wireInstall(); initApp();
}
