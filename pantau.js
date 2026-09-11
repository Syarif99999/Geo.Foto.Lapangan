/* ==========================================================================
   PETA PANTAU - Geo Foto Lapangan (halaman publik, real-time)
   ========================================================================== */

const CATEGORY_META = {
  reklame:    { label:'Pajak Reklame',          color:'#c8952c', icon:'📢' },
  hotel:      { label:'Pajak Hotel',            color:'#2f6b4f', icon:'🏨' },
  restoran:   { label:'Pajak Restoran',         color:'#a1720f', icon:'🍽️' },
  hiburan:    { label:'Kesenian & Hiburan',     color:'#7a3fa0', icon:'🎭' },
  mblb:       { label:'Pajak MBLB',             color:'#555555', icon:'⛏️' },
  parkir:     { label:'Pajak Parkir',           color:'#1f6fa8', icon:'🅿️' },
  walet:      { label:'Sarang Burung Walet',    color:'#0e8f8f', icon:'🐦' },
  penagihan:  { label:'Penagihan',              color:'#a8352b', icon:'🧾' },
  pbb_bphtb:  { label:'PBB & BPHTB',            color:'#8a6d3b', icon:'🏠' }
};

const FALLBACK_CENTER = [-1.6136, 116.2019]; // Tanah Grogot, Paser

let allDocs = {};
let activeFilters = new Set(Object.keys(CATEGORY_META));
let map = null, markersLayer = null, satOn = false, osmLayer = null, satLayer = null;

/* ---------- UTIL ---------- */
function escapeHtml(s){
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function fmtDate(ts){
  try{ return new Date(ts).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' }); }
  catch(e){ return ''; }
}
function catMeta(id){
  return CATEGORY_META[id] || { label:id, color:'#888', icon:'📍' };
}

/* ---------- MARKER ICON (pin + label nama usaha) ---------- */
function pinDivIcon(color, label){
  const trimmed = (label || '').trim();
  const labelHtml = trimmed
    ? `<div class="pin-label" style="background:${color};">${escapeHtml(trimmed)}</div>
       <style>.leaflet-pin .pin-label::after{border-top-color:${color};}</style>`
    : '';
  const svg = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6.2" fill="#0f2647"/></svg>`;
  return L.divIcon({
    className: 'leaflet-pin',
    html: `<div style="position:relative;width:30px;height:42px;">${labelHtml}${svg}</div>`,
    iconSize:[30,42], iconAnchor:[15,42], popupAnchor:[0,-38]
  });
}

/* ---------- PETA ---------- */
function initMap(){
  map = L.map('mainMap', { zoomControl:true }).setView(FALLBACK_CENTER, 12);
  osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution:'&copy; OpenStreetMap contributors', maxZoom:19
  }).addTo(map);
  satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution:'Tiles &copy; Esri', maxZoom:19
  });
  markersLayer = L.layerGroup().addTo(map);

  document.getElementById('satToggle').addEventListener('click', () => {
    satOn = !satOn;
    map.removeLayer(satOn ? osmLayer : satLayer);
    map.addLayer(satOn ? satLayer : osmLayer);
    document.getElementById('satToggle').textContent = satOn ? '🗺️ Standar' : '🛰️ Satelit';
  });
}

function renderMarkers(){
  markersLayer.clearLayers();
  const docs = Object.values(allDocs).filter(d => activeFilters.has(d.category));
  const bounds = [];
  docs.forEach(d => {
    if(d.lat == null || d.lng == null) return;
    const meta = catMeta(d.category);
    const marker = L.marker([d.lat, d.lng], { icon: pinDivIcon(meta.color, d.businessName) });
    const title = d.businessName ? escapeHtml(d.businessName) : escapeHtml(d.address || 'Tanpa nama');
    marker.bindPopup(`
      <div class="popup-card">
        ${d.thumbDataUrl ? `<img src="${d.thumbDataUrl}" alt="Foto">` : ''}
        <div class="p-tag" style="background:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</div>
        <div class="p-title">${title}</div>
        ${d.address ? `<div class="p-addr">${escapeHtml(d.address)}</div>` : ''}
        <div class="p-time">${fmtDate(d.timestamp)}</div>
      </div>
    `);
    marker.addTo(markersLayer);
    bounds.push([d.lat, d.lng]);
  });
  if(bounds.length && !renderMarkers._fitted){
    map.fitBounds(bounds, { padding:[30,30], maxZoom:16 });
    renderMarkers._fitted = true;
  }
}

/* ---------- FILTER CHIPS ---------- */
function renderFilterBar(){
  const bar = document.getElementById('filterBar');
  bar.innerHTML = '';
  Object.keys(CATEGORY_META).forEach(id => {
    const meta = CATEGORY_META[id];
    const chip = document.createElement('div');
    chip.className = 'chip active';
    chip.dataset.id = id;
    chip.innerHTML = `<span class="dot" style="background:${meta.color};"></span>${meta.icon} ${meta.label}`;
    chip.addEventListener('click', () => {
      if(activeFilters.has(id)){ activeFilters.delete(id); chip.classList.remove('active'); }
      else { activeFilters.add(id); chip.classList.add('active'); }
      renderMarkers();
      renderList();
    });
    bar.appendChild(chip);
  });
}

/* ---------- STATS ---------- */
function updateStats(){
  const total = Object.values(allDocs).length;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statUpdated').textContent = 'Diperbarui: ' + new Date().toLocaleTimeString('id-ID');
}

/* ---------- LIST PANEL ---------- */
function renderList(){
  const container = document.getElementById('listItems');
  const docs = Object.values(allDocs)
    .filter(d => activeFilters.has(d.category))
    .sort((a,b) => (b.timestamp||0) - (a.timestamp||0))
    .slice(0, 60);

  if(docs.length === 0){
    container.innerHTML = `<div class="empty-state">Belum ada data untuk filter ini.</div>`;
    return;
  }

  container.innerHTML = docs.map(d => {
    const meta = catMeta(d.category);
    const title = d.businessName ? escapeHtml(d.businessName) : '(tanpa nama usaha)';
    return `
      <div class="list-item" data-lat="${d.lat}" data-lng="${d.lng}" data-id="${d.id}">
        <img src="${d.thumbDataUrl || ''}" alt="Foto">
        <div class="list-item-body">
          <span class="list-item-tag" style="background:${meta.color};">${meta.icon} ${escapeHtml(meta.label)}</span>
          <div class="list-item-title">${title}</div>
          <div class="list-item-addr">${escapeHtml(d.address || '')}</div>
          <div class="list-item-time">${fmtDate(d.timestamp)}</div>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.list-item').forEach(item => {
    item.addEventListener('click', () => {
      const lat = parseFloat(item.dataset.lat);
      const lng = parseFloat(item.dataset.lng);
      if(isFinite(lat) && isFinite(lng)){
        map.setView([lat, lng], 17);
        closeListPanel();
        setTimeout(() => {
          markersLayer.eachLayer(m => {
            const p = m.getLatLng();
            if(Math.abs(p.lat - lat) < 1e-9 && Math.abs(p.lng - lng) < 1e-9) m.openPopup();
          });
        }, 350);
      }
    });
  });
}

function openListPanel(){ document.getElementById('listPanel').classList.add('show'); renderList(); }
function closeListPanel(){ document.getElementById('listPanel').classList.remove('show'); }

/* ---------- FIREBASE REALTIME ---------- */
function startListening(){
  if(typeof FIREBASE_CONFIG === 'undefined' || !FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('PASTE_') === 0){
    document.getElementById('configWarning').style.display = 'block';
    document.getElementById('statUpdated').textContent = 'Cloud belum dikonfigurasi';
    return;
  }
  try{
    firebase.initializeApp(FIREBASE_CONFIG);
    const db = firebase.firestore();
    db.collection(FIRESTORE_COLLECTION).onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if(change.type === 'removed'){ delete allDocs[change.doc.id]; }
        else { allDocs[change.doc.id] = { id: change.doc.id, ...change.doc.data() }; }
      });
      renderMarkers();
      renderList();
      updateStats();
    }, (err) => {
      console.error('Firestore error:', err);
      document.getElementById('statUpdated').textContent = 'Gagal memuat data cloud (cek koneksi / rules Firestore)';
    });
  }catch(e){
    console.error('Gagal inisialisasi Firebase:', e);
    document.getElementById('configWarning').style.display = 'block';
  }
}

/* ---------- INIT ---------- */
window.addEventListener('DOMContentLoaded', () => {
  initMap();
  renderFilterBar();
  document.getElementById('listToggleBtn').addEventListener('click', openListPanel);
  document.getElementById('listCloseBtn').addEventListener('click', closeListPanel);
  startListening();
});
