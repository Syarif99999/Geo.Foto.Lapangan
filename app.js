/* ==========================================================================
   Geo Foto Lapangan - BAPENDA Kabupaten Paser
   ========================================================================== */

const CATEGORIES = [
  { id:'reklame', label:'Pajak Reklame', icon:'📢', sub:'PBJT Reklame' },
  { id:'hotel', label:'Pajak Hotel', icon:'🏨', sub:'PBJT Hotel' },
  { id:'restoran', label:'Pajak Restoran', icon:'🍽️', sub:'PBJT Restoran' },
  { id:'hiburan', label:'Kesenian & Hiburan', icon:'🎭', sub:'PBJT Kesenian/Hiburan' },
  { id:'mblb', label:'Pajak MBLB', icon:'⛏️', sub:'Mineral Bukan Logam' },
  { id:'parkir', label:'Pajak Parkir', icon:'🅿️', sub:'Pendataan Parkir' },
  { id:'walet', label:'Sarang Burung Walet', icon:'🐦', sub:'Pajak Walet' },
  { id:'penagihan', label:'Penagihan', icon:'🧾', sub:'Penagihan Piutang Pajak' },
  { id:'pbb_bphtb', label:'PBB & BPHTB', icon:'🏠', sub:'PBB & BPHTB' },
  { id:'umum', label:'Umum', icon:'📁', sub:'Objek Pajak Lainnya' }
];

const FALLBACK_CENTER = [-1.6136, 116.2019]; // Tanah Grogot, Paser

let currentCategory = null;
let currentTab = 'capture';

/* ==========================================================================
   INDEXEDDB
   ========================================================================== */
const DB_NAME = 'geoFotoLapanganDB';
const DB_VERSION = 1;
const STORE = 'entries';

function openDB(){
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if(!db.objectStoreNames.contains(STORE)){
        const store = db.createObjectStore(STORE, { keyPath:'id', autoIncrement:true });
        store.createIndex('category', 'category', { unique:false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const dbPromise = openDB();

/* ==========================================================================
   ID PERANGKAT (untuk mencegah tabrakan ID dokumen Firestore)
   --------------------------------------------------------------------------
   PENTING: id entri di IndexedDB (keyPath 'id', autoIncrement) HANYA unik
   di dalam satu HP. Kalau id lokal itu dipakai LANGSUNG sebagai ID dokumen
   Firestore, dua HP berbeda yang sama-sama punya entri id=1,2,3,... akan
   saling TIMPA di cloud (dokumen terakhir yang menang) — inilah penyebab
   "Daftar Data" di HP tidak singkron / data lama hilang di Peta Pantau.
   Solusi: setiap HP punya DEVICE_ID acak yang disimpan permanen di
   localStorage, lalu ID dokumen cloud dibentuk dari `${DEVICE_ID}_${id}`
   supaya dijamin unik lintas HP.
   ========================================================================== */
function getDeviceId(){
  let id = localStorage.getItem('geoFotoDeviceId');
  if(!id){
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : ('dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
    localStorage.setItem('geoFotoDeviceId', id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();
function makeCloudDocId(localId){
  return `${DEVICE_ID}_${localId}`;
}

// Selalu pertahankan ID dokumen cloud yang sudah melekat pada entri.
// Entri lama sebelum cloudDocId diperkenalkan memakai id lokal sebagai ID
// Firestore; pertahankan pola lama untuk data yang sudah pernah tersinkron
// agar migrasi tidak meninggalkan salinan baru di cloud.
function getStableCloudDocId(entry){
  if(entry && entry.cloudDocId) return String(entry.cloudDocId);
  if(entry && entry.cloudSynced === true && entry.id != null) return String(entry.id);
  return makeCloudDocId(entry.id);
}

async function addEntry(entry){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).add(entry);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function updateEntry(id, changes){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const data = Object.assign(getReq.result, changes);
      const putReq = store.put(data);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
async function deleteEntry(id){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getEntry(id){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getEntriesByCategory(cat){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('category');
    const req = idx.getAll(cat);
    req.onsuccess = () => resolve(
      req.result.filter(en => en.deleted !== true).sort((a,b) => b.timestamp - a.timestamp)
    );
    req.onerror = () => reject(req.error);
  });
}
async function getTrashByCategory(cat){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const idx = tx.objectStore(STORE).index('category');
    const req = idx.getAll(cat);
    req.onsuccess = () => resolve(
      req.result.filter(en => en.deleted === true).sort((a,b) => (b.deletedAt||0) - (a.deletedAt||0))
    );
    req.onerror = () => reject(req.error);
  });
}
async function getAllEntries(){
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 hari
async function purgeOldTrash(){
  try{
    const all = await getAllEntries();
    const now = Date.now();
    const expired = all.filter(en => en.deleted === true && en.deletedAt && (now - en.deletedAt) > TRASH_RETENTION_MS);
    for(const en of expired){
      await deleteEntry(en.id);
      const cloudId = getStableCloudDocId(en);
      deleteEntryFromCloud(cloudId);
    }
    if(expired.length > 0 && currentTab === 'list') renderList();
  }catch(e){ console.warn('Gagal membersihkan sampah lama:', e); }
}

/* ==========================================================================
   EXIF GPS PARSER (vanilla JS, tanpa library eksternal)
   ========================================================================== */
const TYPE_SIZES = {1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8};

function readIFD(view, tiffStart, dirStart, little){
  const numEntries = view.getUint16(dirStart, little);
  const tags = {};
  for(let i=0;i<numEntries;i++){
    const entryOffset = dirStart + 2 + i*12;
    const tag = view.getUint16(entryOffset, little);
    const type = view.getUint16(entryOffset+2, little);
    const count = view.getUint32(entryOffset+4, little);
    const typeSize = TYPE_SIZES[type] || 1;
    const totalSize = typeSize * count;
    let valueOffset = entryOffset + 8;
    if(totalSize > 4){
      valueOffset = tiffStart + view.getUint32(entryOffset+8, little);
    }
    let value = null;
    try{
      if(type === 2){ // ASCII
        let str = '';
        for(let j=0;j<count-1;j++){ str += String.fromCharCode(view.getUint8(valueOffset+j)); }
        value = str;
      } else if(type === 5 || type === 10){ // RATIONAL / SRATIONAL array
        const arr = [];
        for(let j=0;j<count;j++){
          const num = view.getUint32(valueOffset + j*8, little);
          const den = view.getUint32(valueOffset + j*8 + 4, little);
          arr.push(den === 0 ? 0 : num/den);
        }
        value = arr;
      } else if(type === 3){ value = view.getUint16(valueOffset, little); }
      else if(type === 4){ value = view.getUint32(valueOffset, little); }
      else { value = view.getUint8(valueOffset); }
    }catch(e){ value = null; }
    tags[tag] = value;
  }
  return { tags };
}

function parseExifGPS(arrayBuffer){
  try{
    const view = new DataView(arrayBuffer);
    if(view.getUint16(0, false) !== 0xFFD8) return null; // bukan JPEG
    let offset = 2;
    const len = view.byteLength;
    while(offset < len - 1){
      const marker = view.getUint16(offset, false);
      offset += 2;
      if(marker === 0xFFE1){
        const segLength = view.getUint16(offset, false);
        if(view.getUint32(offset+2, false) === 0x45786966){ // 'Exif'
          const tiffOffset = offset + 8;
          const little = view.getUint16(tiffOffset, false) === 0x4949;
          const firstIFDOffset = view.getUint32(tiffOffset+4, little);
          const ifd0 = readIFD(view, tiffOffset, tiffOffset + firstIFDOffset, little);
          const result = { orientation: ifd0.tags[0x0112] || 1, lat:null, lng:null };
          const gpsPtr = ifd0.tags[0x8825];
          if(gpsPtr != null){
            const gpsIFD = readIFD(view, tiffOffset, tiffOffset + gpsPtr, little);
            const latRef = gpsIFD.tags[1];
            const latArr = gpsIFD.tags[2];
            const lngRef = gpsIFD.tags[3];
            const lngArr = gpsIFD.tags[4];
            if(Array.isArray(latArr) && Array.isArray(lngArr) && latArr.length===3 && lngArr.length===3){
              let lat = latArr[0] + latArr[1]/60 + latArr[2]/3600;
              let lng = lngArr[0] + lngArr[1]/60 + lngArr[2]/3600;
              if(latRef === 'S') lat = -lat;
              if(lngRef === 'W') lng = -lng;
              if(isFinite(lat) && isFinite(lng)){ result.lat = lat; result.lng = lng; }
            }
          }
          return result;
        }
        offset += segLength;
      } else if(marker === 0xFFDA || (marker & 0xFF00) !== 0xFF00){
        break;
      } else {
        const segLength = view.getUint16(offset, false);
        offset += segLength;
      }
    }
  }catch(e){ console.warn('EXIF parse gagal', e); }
  return null;
}

/* ==========================================================================
   KOMPRESI & ORIENTASI FOTO
   ========================================================================== */
function applyOrientationTransform(ctx, orientation, w, h){
  switch(orientation){
    case 2: ctx.transform(-1,0,0,1,w,0); break;
    case 3: ctx.transform(-1,0,0,-1,w,h); break;
    case 4: ctx.transform(1,0,0,-1,0,h); break;
    case 5: ctx.transform(0,1,1,0,0,0); break;
    case 6: ctx.transform(0,1,-1,0,h,0); break;
    case 7: ctx.transform(0,-1,-1,0,h,w); break;
    case 8: ctx.transform(0,-1,1,0,0,w); break;
    default: break;
  }
}

async function loadRawBitmap(file){
  if(window.createImageBitmap){
    try{ return await createImageBitmap(file, { imageOrientation:'none' }); }catch(e){}
  }
  return await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

async function compressImage(file, orientation, maxDim, quality){
  const bitmap = await loadRawBitmap(file);
  const width = bitmap.width || bitmap.naturalWidth;
  const height = bitmap.height || bitmap.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));
  const swapWH = orientation >= 5 && orientation <= 8;
  const canvas = document.createElement('canvas');
  canvas.width = swapWH ? targetH : targetW;
  canvas.height = swapWH ? targetW : targetH;
  const ctx = canvas.getContext('2d');
  applyOrientationTransform(ctx, orientation, targetW, targetH);
  ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  if(bitmap.close) bitmap.close();
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', quality));
}

/* ==========================================================================
   GEOLOKASI & REVERSE GEOCODING
   ========================================================================== */
function getCurrentPositionAsync(opts){
  opts = opts || { enableHighAccuracy:true, timeout:12000, maximumAge:0 };
  return new Promise((resolve, reject) => {
    if(!navigator.geolocation){ reject(new Error('Geolocation tidak didukung')); return; }
    navigator.geolocation.getCurrentPosition(resolve, reject, opts);
  });
}

async function reverseGeocode(lat, lng){
  try{
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=id`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if(!res.ok) return null;
    const data = await res.json();
    return data.display_name || null;
  }catch(e){ return null; }
}

/* ==========================================================================
   UTIL UI
   ========================================================================== */
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(() => t.classList.remove('show'), 2600);
}
function fmtDate(ts){
  try{
    return new Date(ts).toLocaleString('id-ID', { dateStyle:'medium', timeStyle:'short' });
  }catch(e){ return ''; }
}
function catLabel(id){
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.label : id;
}

/* ==========================================================================
   PETA (Leaflet)
   ========================================================================== */
function pinDivIcon(color, label){
  color = color || '#c8952c';
  const svg = `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg"><path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="15" r="6.2" fill="#0f2647"/></svg>`;
  const trimmed = (label || '').trim();
  const labelHtml = trimmed ? `<div class="pin-label">${escapeHtml(trimmed)}</div>` : '';
  return L.divIcon({
    className: 'leaflet-pin',
    html: `<div style="position:relative;width:30px;height:42px;">${labelHtml}${svg}</div>`,
    iconSize:[30,42], iconAnchor:[15,42], popupAnchor:[0,-38]
  });
}
function makeOsmLayer(){
  return L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors', maxZoom: 19
  });
}
function makeSatLayer(){
  return L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri', maxZoom: 19
  });
}
function attachSatToggle(map, layers, btn){
  let satOn = false;
  btn.onclick = () => {
    satOn = !satOn;
    map.removeLayer(satOn ? layers.osm : layers.sat);
    map.addLayer(satOn ? layers.sat : layers.osm);
    btn.textContent = satOn ? '🗺️ Standar' : '🛰️ Satelit';
  };
}

/* ---- Review map (single draggable pin) ---- */
let reviewMap = null, reviewMarker = null, reviewLayers = null;
function initReviewMap(lat, lng){
  const el = document.getElementById('reviewMap');
  if(reviewMap){ reviewMap.remove(); reviewMap = null; }
  const hasCoord = lat != null && lng != null;
  const center = hasCoord ? [lat, lng] : FALLBACK_CENTER;
  reviewMap = L.map(el, { zoomControl:true }).setView(center, hasCoord ? 17 : 14);
  const osm = makeOsmLayer().addTo(reviewMap);
  const sat = makeSatLayer();
  reviewLayers = { osm, sat };
  reviewMarker = L.marker(center, { draggable:true, icon: pinDivIcon() }).addTo(reviewMap);
  reviewMarker.on('dragend', () => {
    const p = reviewMarker.getLatLng();
    onReviewCoordChanged(p.lat, p.lng);
  });
  reviewMap.on('click', (e) => {
    reviewMarker.setLatLng(e.latlng);
    onReviewCoordChanged(e.latlng.lat, e.latlng.lng);
  });
  attachSatToggle(reviewMap, reviewLayers, document.getElementById('reviewSatToggle'));
  setTimeout(() => reviewMap.invalidateSize(), 150);
}

/* ---- Overview map (semua data kategori) ---- */
let overviewMap = null, overviewLayers = null, overviewMarkers = [];
async function renderOverviewMap(){
  const el = document.getElementById('overviewMap');
  if(overviewMap){ overviewMap.remove(); overviewMap = null; overviewMarkers = []; }
  overviewMap = L.map(el, { zoomControl:true }).setView(FALLBACK_CENTER, 13);
  const osm = makeOsmLayer().addTo(overviewMap);
  const sat = makeSatLayer();
  overviewLayers = { osm, sat };
  attachSatToggle(overviewMap, overviewLayers, document.getElementById('overviewSatToggle'));

  const entries = await getEntriesByCategory(currentCategory);
  if(entries.length === 0){
    setTimeout(() => overviewMap.invalidateSize(), 150);
    return;
  }
  const bounds = [];
  entries.forEach(en => {
    if(en.lat == null || en.lng == null) return;
    const marker = L.marker([en.lat, en.lng], { icon: pinDivIcon('#c8952c', en.businessName) }).addTo(overviewMap);
    const addr = en.addressManual || en.addressAuto || 'Alamat belum tersedia';
    const thumbUrl = URL.createObjectURL(en.thumbBlob);
    const titleLine = en.businessName ? escapeHtml(en.businessName) : escapeHtml(addr);
    marker.bindPopup(`<div style="max-width:180px;"><img src="${thumbUrl}" style="width:100%;border-radius:6px;margin-bottom:6px;"><div style="font-size:.78rem;font-weight:700;color:#0f2647;">${titleLine}</div>${en.businessName ? `<div style=\"font-size:.7rem;color:#555;margin-top:1px;\">${escapeHtml(addr)}</div>` : ''}<div style="font-size:.68rem;color:#888;margin-top:2px;">${fmtDate(en.timestamp)}</div></div>`);
    overviewMarkers.push(marker);
    bounds.push([en.lat, en.lng]);
  });
  if(bounds.length){ overviewMap.fitBounds(bounds, { padding:[30,30], maxZoom:17 }); }
  setTimeout(() => overviewMap.invalidateSize(), 150);
}

/* ---- Edit map ---- */
let editMap = null, editMarker = null, editLayers = null, editingId = null;
function initEditMap(lat, lng, businessName){
  const el = document.getElementById('editMap');
  if(editMap){ editMap.remove(); editMap = null; }
  const center = [lat, lng];
  editMap = L.map(el, { zoomControl:true }).setView(center, 17);
  const osm = makeOsmLayer().addTo(editMap);
  const sat = makeSatLayer();
  editLayers = { osm, sat };
  editMarker = L.marker(center, { draggable:true, icon: pinDivIcon('#c8952c', businessName) }).addTo(editMap);
  editMarker.on('dragend', () => {
    const p = editMarker.getLatLng();
    syncEditCoordInputs(p.lat, p.lng);
  });
  editMap.on('click', (e) => {
    editMarker.setLatLng(e.latlng);
    syncEditCoordInputs(e.latlng.lat, e.latlng.lng);
  });
  attachSatToggle(editMap, editLayers, document.getElementById('editSatToggle'));
  syncEditCoordInputs(lat, lng);
  setTimeout(() => editMap.invalidateSize(), 150);
}

function syncEditCoordInputs(lat, lng){
  const latInput = document.getElementById('editLatInput');
  const lngInput = document.getElementById('editLngInput');
  if(!latInput || !lngInput) return;
  latInput.value = lat != null ? lat.toFixed(6) : '';
  lngInput.value = lng != null ? lng.toFixed(6) : '';
}

function onEditLatInputPasted(){
  const latInput = document.getElementById('editLatInput');
  const lngInput = document.getElementById('editLngInput');
  if(!lngInput.value.trim()){
    const combo = parseLatLngString(latInput.value);
    if(combo){
      latInput.value = combo.lat.toFixed(6);
      lngInput.value = combo.lng.toFixed(6);
    }
  }
}

function onApplyEditCoord(){
  const latInput = document.getElementById('editLatInput');
  const lngInput = document.getElementById('editLngInput');
  let lat = parseFloat(latInput.value);
  let lng = parseFloat(lngInput.value);
  if(!isFinite(lat) || !isFinite(lng)){
    const combo = parseLatLngString(latInput.value) || parseLatLngString(lngInput.value);
    if(combo){ lat = combo.lat; lng = combo.lng; }
  }
  if(!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180){
    showToast('Koordinat tidak valid. Contoh benar: -1.612345, 116.201234');
    return;
  }
  if(editMap && editMarker){
    editMap.setView([lat, lng], 17);
    editMarker.setLatLng([lat, lng]);
  }
  syncEditCoordInputs(lat, lng);
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/* ==========================================================================
   ANTRIAN AMBIL / IMPOR FOTO (review queue)
   ========================================================================== */
let queue = [];
let qIndex = 0;
let currentDraft = null;
let geocodeDebounce = null;
let lastSavedEntryId = null;
let sharedLocationData = null;

function startQueue(fileList, source){
  queue = Array.from(fileList).map(f => ({ file:f, source, mediaType: f.type && f.type.startsWith('video/') ? 'video' : 'photo' }));
  qIndex = 0;
  sharedLocationData = null;
  document.getElementById('lastSavedBar').style.display = 'none';
  document.getElementById('reviewPanel').style.display = 'block';
  document.getElementById('reviewPanel').scrollIntoView({ behavior:'smooth', block:'start' });
  processQueueItem();
}

function setReviewLoading(isLoading, text){
  document.getElementById('reviewLoading').style.display = isLoading ? 'flex' : 'none';
  document.getElementById('reviewContent').style.display = isLoading ? 'none' : 'block';
  if(text) document.getElementById('reviewLoadingText').textContent = text;
}

async function processQueueItem(){
  if(qIndex >= queue.length){ endQueue(); return; }
  const item = queue[qIndex];
  const mediaLabel = item.mediaType === 'video' ? 'Video' : 'Foto';
  document.getElementById('reviewProgress').textContent = `${mediaLabel} ${qIndex+1} dari ${queue.length} — ${item.source === 'camera' ? 'Kamera Langsung' : 'Impor Galeri/WA'}`;
  setReviewLoading(true, item.mediaType === 'video' ? 'Menyiapkan video...' : 'Membaca metadata & memproses foto...');

  const previewUrl = URL.createObjectURL(item.file);
  const photoPreview = document.getElementById('reviewPhoto');
  const videoPreview = document.getElementById('reviewVideo');
  const typeBadge = document.getElementById('reviewMediaType');
  typeBadge.textContent = item.mediaType === 'video' ? 'Video lapangan' : 'Foto lapangan';
  photoPreview.style.display = item.mediaType === 'video' ? 'none' : 'block';
  videoPreview.style.display = item.mediaType === 'video' ? 'block' : 'none';
  if(item.mediaType === 'video') videoPreview.src = previewUrl; else photoPreview.src = previewUrl;

  let exif = null;
  try{
    const buf = await item.file.arrayBuffer();
    exif = parseExifGPS(buf);
  }catch(e){ exif = null; }

  const orientation = (exif && exif.orientation) || 1;
  if(item.mediaType === 'video') {
    let lat = null, lng = null, coordSource = null;
    if(item.source === 'camera') {
      try { const pos = await getCurrentPositionAsync(); lat=pos.coords.latitude; lng=pos.coords.longitude; coordSource=`GPS perangkat saat direkam (±${Math.round(pos.coords.accuracy)}m)`; } catch(e) {}
    }
    const poster = new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="100%" height="100%" fill="#0f2647"/><text x="50%" y="50%" fill="#e0b354" text-anchor="middle" dominant-baseline="middle" font-size="34">VIDEO</text></svg>`], {type:'image/svg+xml'});
    currentDraft = { file:item.file, source:item.source, mediaType:'video', videoBlob:item.file, stampedVideoBlob:item.file.geoStamped ? item.file : null, photoBlob:null, thumbBlob:poster, lat, lng, coordSource, addressAuto:'', addressManual:'' };
    updateCoordBox(); initReviewMap(lat, lng); setReviewLoading(false);
    if(lat != null && lng != null) autoReverseGeocode(); else document.getElementById('addrAuto').placeholder='GPS tidak ditemukan — tandai lokasi di peta atau isi manual';
    return;
  }
  // Pertahankan resolusi asli (hingga 4K) dan gunakan kualitas sangat tinggi.
  // Downscale/quality rendah di sini membuat foto yang dibagikan terlihat pecah,
  // terutama setelah WhatsApp melakukan kompresi tambahannya. Thumbnail tetap
  // dibuat terpisah karena hanya dipakai untuk daftar, peta, dan cloud publik.
  const [photoBlob, thumbBlob] = await Promise.all([
    compressImage(item.file, orientation, 4096, 0.98),
    compressImage(item.file, orientation, 480, 0.85)
  ]);

  let lat = null, lng = null, coordSource = null;

  if(item.source === 'camera'){
    try{
      const pos = await getCurrentPositionAsync();
      lat = pos.coords.latitude; lng = pos.coords.longitude;
      coordSource = `GPS perangkat saat difoto (±${Math.round(pos.coords.accuracy)}m)`;
    }catch(e){
      if(exif && exif.lat != null){ lat = exif.lat; lng = exif.lng; coordSource = 'EXIF Foto'; }
    }
  } else {
    if(exif && exif.lat != null){ lat = exif.lat; lng = exif.lng; coordSource = 'EXIF Foto (Galeri/WA)'; }
  }

  currentDraft = {
    file: item.file, source: item.source, mediaType:'photo',
    photoBlob, thumbBlob,
    lat, lng, coordSource,
    addressAuto: '', addressManual: ''
  };

  document.getElementById('addrAuto').value = '';
  document.getElementById('addrManual').value = '';
  document.getElementById('noteInput').value = '';
  document.getElementById('businessNameInput').value = '';
  updateCoordBox();
  initReviewMap(lat, lng);
  setReviewLoading(false);

  // Foto berikutnya memakai data lokasi yang sama setelah pengguna memilih
  // "Simpan lokasi ini untuk semua foto"; setiap foto tetap menjadi entri terpisah.
  if(sharedLocationData && qIndex > 0){
    currentDraft.lat = sharedLocationData.lat;
    currentDraft.lng = sharedLocationData.lng;
    currentDraft.coordSource = sharedLocationData.coordSource;
    currentDraft.addressAuto = sharedLocationData.addressAuto;
    document.getElementById('businessNameInput').value = sharedLocationData.businessName;
    document.getElementById('addrAuto').value = sharedLocationData.addressAuto;
    document.getElementById('addrManual').value = sharedLocationData.addressManual;
    document.getElementById('noteInput').value = sharedLocationData.note;
    updateCoordBox();
    setTimeout(() => saveDraftAndAdvance(sharedLocationData), 0);
    return;
  }

  if(lat != null && lng != null){
    autoReverseGeocode();
  } else {
    document.getElementById('addrAuto').placeholder = 'GPS tidak ditemukan — tandai lokasi di peta lalu tekan "Gunakan Lokasi Saat Ini" atau isi manual';
  }
}

function updateCoordBox(){
  const box = document.getElementById('coordBox');
  if(currentDraft && currentDraft.lat != null){
    box.className = 'coord-box ok';
    box.innerHTML = `📍 <b>${currentDraft.lat.toFixed(6)}, ${currentDraft.lng.toFixed(6)}</b> &middot; ${currentDraft.coordSource || ''}`;
  } else {
    box.className = 'coord-box warn';
    box.innerHTML = `⚠️ Koordinat GPS belum ada. Tap peta di bawah, atau ketik langsung di kolom koordinat manual.`;
  }
  syncCoordInputs();
}

function syncCoordInputs(){
  const latInput = document.getElementById('latInput');
  const lngInput = document.getElementById('lngInput');
  if(!latInput || !lngInput) return;
  if(currentDraft && currentDraft.lat != null){
    latInput.value = currentDraft.lat.toFixed(6);
    lngInput.value = currentDraft.lng.toFixed(6);
  } else {
    latInput.value = '';
    lngInput.value = '';
  }
}

function parseLatLngString(str){
  if(!str) return null;
  const parts = str.trim().split(/[,;\s]+/).filter(Boolean);
  if(parts.length < 2) return null;
  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);
  if(!isFinite(lat) || !isFinite(lng)) return null;
  if(lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function onLatInputPasted(){
  const latInput = document.getElementById('latInput');
  const lngInput = document.getElementById('lngInput');
  if(!lngInput.value.trim()){
    const combo = parseLatLngString(latInput.value);
    if(combo){
      latInput.value = combo.lat.toFixed(6);
      lngInput.value = combo.lng.toFixed(6);
    }
  }
}

function onApplyManualCoord(){
  const latInput = document.getElementById('latInput');
  const lngInput = document.getElementById('lngInput');
  let lat = parseFloat(latInput.value);
  let lng = parseFloat(lngInput.value);
  if(!isFinite(lat) || !isFinite(lng)){
    const combo = parseLatLngString(latInput.value) || parseLatLngString(lngInput.value);
    if(combo){ lat = combo.lat; lng = combo.lng; }
  }
  if(!isFinite(lat) || !isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180){
    showToast('Koordinat tidak valid. Contoh benar: -1.612345, 116.201234');
    return;
  }
  currentDraft.lat = lat; currentDraft.lng = lng;
  currentDraft.coordSource = 'Diketik manual';
  updateCoordBox();
  if(reviewMap && reviewMarker){
    reviewMap.setView([lat, lng], 17);
    reviewMarker.setLatLng([lat, lng]);
  } else {
    initReviewMap(lat, lng);
  }
  autoReverseGeocode();
}

function onReviewCoordChanged(lat, lng){
  currentDraft.lat = lat; currentDraft.lng = lng;
  currentDraft.coordSource = currentDraft.coordSource && currentDraft.coordSource.includes('EXIF') ? currentDraft.coordSource : 'Ditandai manual di peta';
  updateCoordBox();
  clearTimeout(geocodeDebounce);
  geocodeDebounce = setTimeout(autoReverseGeocode, 600);
}

async function autoReverseGeocode(){
  if(!currentDraft || currentDraft.lat == null) return;
  const addrAutoField = document.getElementById('addrAuto');
  addrAutoField.placeholder = 'Mendeteksi alamat...';
  const addr = await reverseGeocode(currentDraft.lat, currentDraft.lng);
  if(!currentDraft) return;
  if(addr){
    currentDraft.addressAuto = addr;
    addrAutoField.value = addr;
    const manualField = document.getElementById('addrManual');
    if(!manualField.value.trim()) manualField.value = addr;
  } else {
    addrAutoField.value = '';
    addrAutoField.placeholder = 'Alamat otomatis tidak ditemukan (cek koneksi internet) — isi manual';
  }
}

async function onLocateNowClick(){
  const btn = document.getElementById('btnLocateNow');
  btn.disabled = true; btn.textContent = '📍 Mengambil lokasi...';
  try{
    const pos = await getCurrentPositionAsync();
    currentDraft.lat = pos.coords.latitude;
    currentDraft.lng = pos.coords.longitude;
    currentDraft.coordSource = `GPS perangkat saat ini (±${Math.round(pos.coords.accuracy)}m)`;
    updateCoordBox();
    if(reviewMap && reviewMarker){
      reviewMap.setView([currentDraft.lat, currentDraft.lng], 17);
      reviewMarker.setLatLng([currentDraft.lat, currentDraft.lng]);
    } else {
      initReviewMap(currentDraft.lat, currentDraft.lng);
    }
    autoReverseGeocode();
  }catch(e){
    showToast('Gagal mengambil lokasi. Pastikan GPS & izin lokasi aktif.');
  }
  btn.disabled = false; btn.textContent = '📍 Gunakan Lokasi Saat Ini';
}

function readDraftLocationData(){
  return {
    lat: currentDraft.lat,
    lng: currentDraft.lng,
    coordSource: currentDraft.coordSource || 'Manual',
    addressAuto: currentDraft.addressAuto || '',
    addressManual: document.getElementById('addrManual').value.trim() || currentDraft.addressAuto || '',
    note: document.getElementById('noteInput').value.trim(),
    businessName: document.getElementById('businessNameInput').value.trim()
  };
}

let liveStream = null, liveRecorder = null, liveChunks = [], liveWatchId = null, liveGpsPollTimer = null;
let liveGps = null, liveDrawFrame = null, liveRecordingStartedAt = 0, liveMapCrop = null, liveMapKey = '', liveAddress = '';
/* =====================================================================
   ORIENTASI VIDEO — SEKARANG PUNYA MODE OTOMATIS
   'auto'      : ikut posisi fisik HP (screen.orientation / window.orientation),
                 dicek ulang tiap frame pratinjau, jadi stempel & bingkai
                 langsung menyesuaikan saat HP diputar — TANPA ditekan manual.
   'portrait'  : dipaksa potret, apa pun posisi HP.
   'landscape' : dipaksa lanskap, apa pun posisi HP.
   Mode manual tetap disediakan sebagai jaring pengaman untuk HP yang
   sensor/rotasi-otomatisnya dimatikan atau tidak akurat.
   ===================================================================== */
let liveOrientMode = 'auto';
let liveOrientLocked = null;   // dikunci saat merekam supaya ukuran kanvas tidak berubah di tengah rekaman
let liveStampInfoTick = 0;

/* Deteksi posisi HP.
   Masalah lama: hanya membaca screen.orientation. Kalau ROTASI OTOMATIS di
   HP dimatikan (banyak petugas lapangan mematikannya), screen.orientation
   tetap melaporkan "portrait" walau HP sudah dimiringkan — jadi bingkai
   video tidak pernah ikut mendatar. Aplikasi sejenis (GPS Map Camera) tidak
   terpengaruh karena membaca SENSOR KEMIRINGAN, bukan status layar.
   Sekarang kita pakai keduanya: layar dulu, sensor sebagai penentu saat
   layar terkunci potret. */
let tiltOrient = null;           // hasil sensor kemiringan (null = belum ada)
let tiltCandidate = null, tiltSince = 0, tiltHandler = null;
let lastOrientSource = 'layar';

function handleTilt(ev){
  const g = ev.gamma, b = ev.beta;
  if(typeof g !== 'number' || typeof b !== 'number') return;
  let o = null;
  if(Math.abs(g) >= 40 && Math.abs(b) <= 45) o = 'landscape';
  else if(Math.abs(g) <= 25) o = 'portrait';
  else return;                   // 25°–40° zona abu-abu: diabaikan (histeresis)
  const now = Date.now();
  if(o !== tiltCandidate){ tiltCandidate = o; tiltSince = now; return; }
  if(now - tiltSince >= 450) tiltOrient = o;   // harus stabil ~0,5 detik
}
async function startTiltWatch(){
  if(tiltHandler || typeof window.DeviceOrientationEvent === 'undefined') return;
  try{
    // iOS butuh izin, dan izin hanya bisa diminta dari sentuhan pengguna —
    // di sini masih dalam rangkaian klik tombol "Rekam Video".
    if(typeof DeviceOrientationEvent.requestPermission === 'function'){
      const izin = await DeviceOrientationEvent.requestPermission();
      if(izin !== 'granted') return;
    }
  }catch(e){ return; }
  tiltHandler = handleTilt;
  window.addEventListener('deviceorientation', tiltHandler, true);
}
function stopTiltWatch(){
  if(tiltHandler) window.removeEventListener('deviceorientation', tiltHandler, true);
  tiltHandler = null; tiltOrient = null; tiltCandidate = null;
}

function detectDeviceOrientation(){
  let layar = null;
  try{
    const t = (screen.orientation && screen.orientation.type) || '';
    if(t) layar = t.indexOf('landscape') === 0 ? 'landscape' : 'portrait';
  }catch(e){}
  if(layar == null && typeof window.orientation === 'number'){
    layar = Math.abs(window.orientation) === 90 ? 'landscape' : 'portrait';
  }
  if(layar === 'landscape'){ lastOrientSource = 'layar'; return 'landscape'; }
  if(tiltOrient){ lastOrientSource = 'sensor'; return tiltOrient; }
  if(layar){ lastOrientSource = 'layar'; return layar; }
  lastOrientSource = 'rasio';
  return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
}
function effectiveLiveOrient(){
  if(liveOrientLocked) return liveOrientLocked;
  if(liveOrientMode === 'auto') return detectDeviceOrientation();
  return liveOrientMode === 'landscape' ? 'landscape' : 'portrait';
}

/* =====================================================================
   MESIN STEMPEL "GPS MAP CAMERA" — SATU SUMBER UNTUK FOTO & VIDEO
   Foto tersimpan, pratinjau video live, dan penstempelan ulang video
   sekarang memakai FUNGSI YANG SAMA (drawGeoStamp), jadi tampilannya
   dijamin identik: kotak peta satelit + pin di kiri, judul lokasi tebal,
   alamat, koordinat, tanggal berzona waktu, dan lencana di pojok —
   seperti GPS Map Camera.

   MODE STEMPEL:
   - auto    : template DAN warna dipilih sendiri oleh aplikasi
   - lengkap : judul + alamat 2 baris + koordinat + tanggal + catatan
   - klasik  : judul + alamat 1 baris + koordinat + tanggal (untuk lanskap)
   - ringkas : hanya koordinat + tanggal, tanpa kotak peta (frame kecil)
   - elegan  : panel terang, kotak peta bulat, garis aksen emas
   ===================================================================== */
const STAMP_MODES = ['auto','lengkap','klasik','ringkas','elegan'];
const STAMP_MODE_LABEL = { auto:'Otomatis', lengkap:'Lengkap', klasik:'Klasik', ringkas:'Ringkas', elegan:'Elegan' };
let stampMode = 'auto';
/* Ukuran tulisan stempel. Banyak pengguna lapangan (dan pembaca laporan)
   sudah berumur, jadi bawaan sekarang BESAR, bukan normal. */
const STAMP_SCALES = { normal:1, besar:1.28, jumbo:1.6 };
const STAMP_SCALE_LABEL = { normal:'Normal', besar:'Besar', jumbo:'Jumbo' };
let stampScale = 'besar';
try{
  const savedStampMode = localStorage.getItem('geoFotoStampMode');
  if(savedStampMode && STAMP_MODES.indexOf(savedStampMode) >= 0) stampMode = savedStampMode;
  const savedScale = localStorage.getItem('geoFotoStampScale');
  if(savedScale && STAMP_SCALES[savedScale]) stampScale = savedScale;
}catch(e){}
let lastStampResolution = { template:'lengkap', theme:'gelap' };

const STAMP_THEME = {
  gelap:{ panel:'rgba(11,19,32,0.82)', border:'rgba(255,255,255,0.10)', title:'#ffffff', sub:'#cfd8e4',
          coord:'#ffd166', date:'#b6c1d1', credit:'#8d9aab', badgeBg:'rgba(224,179,84,0.94)', badgeText:'#10233f' },
  terang:{ panel:'rgba(247,249,252,0.90)', border:'rgba(15,38,71,0.14)', title:'#0f2033', sub:'#3d4c60',
          coord:'#8a5b00', date:'#5a6779', credit:'#7b8798', badgeBg:'rgba(15,38,71,0.94)', badgeText:'#ffd98a' }
};

// Rata-rata kecerahan bagian bawah frame — dipakai mode OTOMATIS untuk
// memilih panel gelap (di atas gambar terang) atau panel terang (di atas
// gambar gelap), supaya stempel selalu terbaca.
// Hanya beberapa petak kecil yang dibaca (bukan seluruh area) dan hasilnya
// disimpan sebentar, supaya tidak membebani pratinjau video 30 fps.
let stampBrightnessBlocked = false;
let stampBrightnessCache = { at:0, value:null };
// Penguncian gaya stempel selama SATU video berjalan (live maupun stempel
// ulang). Selama terkunci, template & warna tidak berubah di tengah video.
let liveStampLock = null;

/* Dulu: sekali getImageData gagal (kanvas "tainted"), mode OTOMATIS mati
   SELAMANYA untuk seluruh aplikasi — termasuk untuk video berikutnya yang
   sebenarnya baik-baik saja. Sekarang status itu di-reset setiap kali
   pekerjaan baru dimulai (buka kamera live, stempel foto, stempel video). */
function resetStampAutoState(){
  stampBrightnessBlocked = false;
  stampBrightnessCache = { at:0, value:null };
}

function sampleFrameBrightness(ctx, x, y, w, h, fresh){
  if(stampBrightnessBlocked) return null;
  const now = Date.now();
  if(!fresh && stampBrightnessCache.value != null && now - stampBrightnessCache.at < 700) return stampBrightnessCache.value;
  try{
    const pw = Math.max(8, Math.min(48, Math.round(w/12)));
    const ph = Math.max(6, Math.min(32, Math.round(h/4)));
    const spots = [x + w*0.10, x + w*0.45, x + w*0.80];
    let sum = 0, n = 0;
    spots.forEach(sx => {
      const px = Math.max(0, Math.min(Math.round(sx), Math.round(x + w) - pw));
      const py = Math.max(0, Math.round(y + h/2 - ph/2));
      const d = ctx.getImageData(px, py, pw, ph).data;
      for(let i = 0; i + 2 < d.length; i += 16){
        sum += 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
        n++;
      }
    });
    const val = n ? sum/n : null;
    stampBrightnessCache = { at:now, value:val };
    return val;
  }catch(e){
    stampBrightnessBlocked = true;
    return null;
  }
}

// Otak mode OTOMATIS: menentukan template + warna dari bentuk frame,
// kelengkapan data, dan kecerahan bagian bawah gambar.
function resolveStampStyle(ctx, W, H, data, mode, forcedTheme, fresh){
  const auto = (!mode || mode === 'auto');
  let template = auto ? null : mode;
  let theme = forcedTheme || null;
  if(!template){
    const base = Math.min(W, H);
    const isLandscape = W >= H;
    const punyaIsi = !!((data.address && data.address.length > 3) || (data.title && data.title.length > 3));
    if(base < 420) template = 'ringkas';              // frame kecil: teks panjang malah tidak terbaca
    else if(!punyaIsi) template = 'ringkas';          // alamat belum ketemu: jangan pasang baris kosong
    else if(isLandscape) template = 'klasik';         // lanskap: panel pendek supaya objek tidak tertutup
    else if(H < 900) template = 'klasik';             // potret kecil/sedang: panel Lengkap terlalu memakan layar
    else template = 'lengkap';
  }
  if(!theme){
    const lum = sampleFrameBrightness(ctx, W*0.04, H*0.74, W*0.92, H*0.22, fresh);
    // Ambang beda untuk naik/turun (histeresis) supaya warna panel tidak
    // berkedip bolak-balik saat kecerahan gambar pas di perbatasan.
    const sebelumnya = lastStampResolution.theme;
    if(lum == null) theme = sebelumnya || 'gelap';
    else if(sebelumnya === 'terang') theme = lum < 148 ? 'gelap' : 'terang';
    else theme = lum > 180 ? 'terang' : 'gelap';
  }
  if(template === 'elegan') theme = 'terang';
  lastStampResolution = { template, theme, auto };
  return { template, theme, auto };
}

function stampStatusText(){
  const r = lastStampResolution;
  const nama = STAMP_MODE_LABEL[r.template] || r.template;
  const kunci = liveStampLock ? ' · dikunci selama rekaman' : '';
  const ukuran = ` · Huruf: ${STAMP_SCALE_LABEL[stampScale] || stampScale}`;
  return (stampMode === 'auto'
    ? `Mode stempel: Otomatis → ${nama} (${r.theme})`
    : `Mode stempel: ${STAMP_MODE_LABEL[stampMode] || stampMode}`) + ukuran + kunci;
}

// Alamat panjang dari reverse-geocode sering berisi ekor yang tidak berguna
// di stempel ("…, 76211, Kalimantan Timur, Indonesia"). Ekor itu dipangkas
// supaya panel tidak melar jadi dua-tiga baris.
function shortenAddressForStamp(addr){
  let s = String(addr || '').trim().replace(/\s+/g, ' ');
  s = s.replace(/,\s*Indonesia\s*$/i, '');
  s = s.replace(/,\s*\d{5}(?=\s*,|\s*$)/g, '');
  s = s.replace(/\s*,\s*/g, ', ').replace(/^,\s*|,\s*$/g, '');
  return s.trim();
}

// Penggambar stempel. ctx sudah berisi gambar/frame; fungsi ini hanya
// menambahkan panel di bagian bawah.
function drawGeoStamp(ctx, W, H, data, options){
  options = options || {};
  const style = resolveStampStyle(ctx, W, H, data, options.mode || stampMode, options.theme, options.fresh);
  const template = style.template, theme = style.theme;
  const C = STAMP_THEME[theme];
  const base = Math.min(W, H);
  const isLandscape = W >= H;
  const compact = template === 'ringkas';
  const showMap = !compact;
  const margin = Math.max(8, Math.round(base * (compact ? 0.018 : 0.022)));
  const pad = Math.max(8, Math.round(base * 0.022));
  const gap = Math.max(6, Math.round(base * 0.020));

  const title = String(data.title || '').trim();
  const address = shortenAddressForStamp(data.address);
  const note = String(data.note || '').trim();
  const punyaKoordinat = data.lat != null && data.lng != null && isFinite(data.lat) && isFinite(data.lng);
  const coordLine = punyaKoordinat
    ? `Lat ${Number(data.lat).toFixed(6)}°  Long ${Number(data.lng).toFixed(6)}°`
    : (data.coordFallback || 'GPS mencari lokasi...');
  const dateLine = data.dateText || formatStampDate(data.timestamp || Date.now());
  const credit = data.credit || 'Geo Foto Lapangan · BAPENDA Paser';

  // Ukuran huruf sedikit dikecilkan dibanding v42 supaya panel tidak melar.
  // Khusus LANSKAP hurufnya dinaikkan ~18%: di bingkai mendatar, `base`
  // memakai sisi pendek (tinggi), sehingga dengan rumus lama tulisan jadi
  // kekecilan relatif terhadap lebar gambar — itu sebab stempel lanskap
  // terlihat "kurang jelas".
  // Angka dasar dinaikkan ±30% dari v44 (keluhan: tulisan terlalu kecil,
  // kasihan pembaca lanjut usia), lalu dikalikan setelan Ukuran Tulisan.
  const ts = (isLandscape ? 1.18 : 1) * (STAMP_SCALES[stampScale] || 1.28);
  const fsTitle = Math.max(16, Math.round(base * (compact ? 0.032 : 0.038) * ts));
  const fsBody  = Math.max(14, Math.round(base * 0.024 * ts));
  const fsCoord = Math.max(16, Math.round(base * 0.030 * ts));
  const fsSmall = Math.max(12, Math.round(base * 0.020 * ts));

  // Batas tinggi panel: jauh lebih ketat dari v42 (dulu 30% untuk semua).
  const skala = STAMP_SCALES[stampScale] || 1.28;
  const ruang = 1 + (skala - 1) * 0.75;   // huruf besar butuh panel sedikit lebih tinggi
  const maxPanelH = Math.round(H * (compact ? 0.15 : (isLandscape ? 0.24 : 0.28)) * ruang);

  let mapSize = showMap ? Math.min(Math.round(base * (isLandscape ? 0.15 : 0.175)), Math.round(H * 0.15)) : 0;
  const fullPanelW = W - margin * 2;
  let textW = compact ? Math.max(40, fullPanelW - pad*2)
                      : Math.max(40, fullPanelW - pad*2 - (showMap ? mapSize + gap : 0));

  /* prio = urutan korban kalau panel kepanjangan.
     0 = tidak pernah dibuang (koordinat & tanggal — inti bukti lapangan). */
  const rows = [];
  if(!compact){
    if(title)   rows.push({ text:title,   size:fsTitle, weight:'700', color:C.title, wrap:true, max:2, prio:2 });
    if(address) rows.push({ text:address, size:fsBody,  color:C.sub,  wrap:true, max: template === 'lengkap' ? 2 : 1, prio:3 });
  }
  rows.push({ text:coordLine, size:fsCoord, weight:'700', color:C.coord, mono:true, prio:0 });
  rows.push({ text:dateLine,  size:fsSmall, color:C.date, prio:0 });
  if(template === 'lengkap' && note) rows.push({ text:note, size:fsSmall, color:C.sub, wrap:true, max:1, prio:4 });
  if(!compact) rows.push({ text:credit, size:fsSmall, color:C.credit, prio:5 });

  const lines = [];
  rows.forEach(r => {
    const family = r.mono ? 'monospace' : 'Arial, sans-serif';
    if(r.wrap){
      ctx.font = `${r.weight ? r.weight + ' ' : ''}${r.size}px ${family}`;
      const parts = wrapText(ctx, r.text, textW).slice(0, r.max || 2);
      parts.forEach((t, i) => {
        // baris lanjutan (baris ke-2 judul/alamat) dibuang lebih dulu
        lines.push({ text:t, size:r.size, weight:r.weight, color:r.color, family, prio: r.prio + (i ? 0.5 : 0) });
      });
    }else{
      const size = fitSingleLineFontSize(ctx, r.text, r.size, family, r.weight || '', textW, Math.max(8, r.size*0.55));
      lines.push({ text:r.text, size, weight:r.weight, color:r.color, family, prio:r.prio });
    }
  });

  const lineH = l => Math.round(l.size * 1.30);
  let textH = 0;
  const recalcText = () => { textH = 0; lines.forEach(l => { textH += lineH(l); }); return textH; };
  recalcText();

  /* Kotak peta tidak boleh lagi MEMAKSA panel jadi tinggi: ukurannya
     mengikuti tinggi teks (itu penyebab utama panel "kepanjangan" pada
     stempel Ringkas-isi tapi berpeta). */
  const fitMap = () => { if(showMap) mapSize = Math.max(Math.round(base*0.09), Math.min(mapSize, textH)); };
  fitMap();
  const panelHFor = () => Math.max(showMap ? mapSize + pad*2 : 0, textH + pad*2);
  let panelH = panelHFor();

  // Buang baris berdasarkan PRIORITAS (kredit → catatan → baris ke-2 alamat →
  // alamat → baris ke-2 judul → judul). Koordinat & tanggal selalu selamat —
  // dulu kode membuang baris paling bawah, jadi tanggal bisa ikut hilang.
  while(panelH > maxPanelH){
    let victim = -1, worst = 0;
    lines.forEach((l, i) => { if(l.prio > worst){ worst = l.prio; victim = i; } });
    if(victim < 0) break;
    lines.splice(victim, 1);
    recalcText(); fitMap(); panelH = panelHFor();
  }
  if(panelH > maxPanelH){
    const k = Math.max(0.55, maxPanelH / panelH);
    lines.forEach(l => { l.size = Math.max(8, Math.round(l.size * k)); });
    recalcText();
    if(showMap) mapSize = Math.round(mapSize * k);
    fitMap(); panelH = panelHFor();
  }

  /* Lebar panel sekarang MENGIKUTI ISI, tidak lagi selalu selebar frame.
     Kalau teksnya pendek, panelnya juga pendek — tidak ada lagi kotak
     panjang melintang dengan separuh ruang kosong. */
  let maxTextLineW = 0;
  lines.forEach(l => {
    ctx.font = `${l.weight ? l.weight + ' ' : ''}${l.size}px ${l.family}`;
    maxTextLineW = Math.max(maxTextLineW, ctx.measureText(l.text).width);
  });
  let panelW;
  if(compact){
    panelW = Math.min(fullPanelW, Math.round(maxTextLineW + pad*2));
  }else{
    const isiW = Math.round(maxTextLineW + pad*2 + (showMap ? mapSize + gap : 0)
                 + (template === 'elegan' ? Math.round(base*0.008) : 0));
    const minW = Math.round(fullPanelW * (isLandscape ? 0.46 : 0.58));
    panelW = Math.max(minW, Math.min(fullPanelW, isiW));
  }

  const panelX = margin;
  const panelY = H - margin - panelH;

  ctx.save();
  roundRectPath(ctx, panelX, panelY, panelW, panelH, Math.max(8, Math.round(base*0.018)));
  ctx.fillStyle = C.panel; ctx.fill();
  ctx.lineWidth = Math.max(1, base*0.002); ctx.strokeStyle = C.border; ctx.stroke();
  ctx.restore();

  if(template === 'elegan'){
    ctx.fillStyle = 'rgba(200,149,44,0.92)';
    ctx.fillRect(panelX, panelY + pad*0.6, Math.max(2, Math.round(base*0.005)), panelH - pad*1.2);
  }

  let textX = panelX + pad;
  if(showMap){
    const mapX = panelX + pad + (template === 'elegan' ? Math.round(base*0.008) : 0);
    const mapY = panelY + (panelH - mapSize)/2;
    ctx.save();
    roundRectPath(ctx, mapX, mapY, mapSize, mapSize, template === 'elegan' ? mapSize/2 : Math.max(6, Math.round(base*0.012)));
    ctx.clip();
    if(data.mapCrop){
      ctx.drawImage(data.mapCrop.canvas, data.mapCrop.sx, data.mapCrop.sy, data.mapCrop.sw, data.mapCrop.sh, mapX, mapY, mapSize, mapSize);
    }else{
      const g = ctx.createLinearGradient(mapX, mapY, mapX+mapSize, mapY+mapSize);
      g.addColorStop(0,'#697b5e'); g.addColorStop(.5,'#98a57e'); g.addColorStop(1,'#40563e');
      ctx.fillStyle = g; ctx.fillRect(mapX, mapY, mapSize, mapSize);
    }
    // lingkaran akurasi biru khas tampilan GPS
    ctx.beginPath();
    ctx.ellipse(mapX + mapSize*0.5, mapY + mapSize*0.66, mapSize*0.28, mapSize*0.13, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(66,133,244,0.35)'; ctx.fill();
    if(data.mapCrop){
      ctx.font = `${Math.max(6, Math.round(mapSize*0.11))}px Arial`;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText('Esri', mapX + mapSize*0.07, mapY + mapSize*0.96);
    }
    ctx.restore();
    drawMapPin(ctx, mapX + mapSize*0.5, mapY + mapSize*0.62, mapSize*0.5, '#ff3b30');
    textX = mapX + mapSize + gap;
  }

  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const textRight = panelX + panelW - pad;
  let y = panelY + Math.max(pad, (panelH - textH)/2);
  lines.forEach(l => {
    ctx.font = `${l.weight ? l.weight + ' ' : ''}${l.size}px ${l.family}`;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, textX, y, Math.max(20, textRight - textX));
    y += lineH(l);
  });

  if(!compact && options.badge !== false){
    const bt = data.badge || 'Geo Foto Lapangan';
    const bs = Math.max(8, Math.round(base*0.014));
    ctx.font = `700 ${bs}px Arial`;
    const bw = ctx.measureText(bt).width + bs*1.7, bh = Math.round(bs*2);
    const bx = panelX + panelW - bw - Math.round(pad*0.4);
    const by = Math.max(2, panelY - bh - Math.max(4, Math.round(base*0.008)));
    roundRectPath(ctx, bx, by, bw, bh, bh/2);
    ctx.fillStyle = C.badgeBg; ctx.fill();
    ctx.fillStyle = C.badgeText; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(bt, bx + bw/2, by + bh/2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  }
  return style;
}

function setStampMode(mode){
  stampMode = (STAMP_MODES.indexOf(mode) >= 0) ? mode : 'auto';
  try{ localStorage.setItem('geoFotoStampMode', stampMode); }catch(e){}
  document.querySelectorAll('.stamp-mode-toggle button[data-stamp]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stamp === stampMode);
  });
  const info = document.getElementById('liveStampInfo');
  if(info) info.textContent = stampStatusText();
}

function setStampScale(scale){
  stampScale = STAMP_SCALES[scale] ? scale : 'besar';
  try{ localStorage.setItem('geoFotoStampScale', stampScale); }catch(e){}
  document.querySelectorAll('.stamp-size-toggle button[data-stampsize]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.stampsize === stampScale);
  });
  const info = document.getElementById('liveStampInfo');
  if(info) info.textContent = stampStatusText();
}

function setLiveGpsStatus(text){
  const el = document.getElementById('liveGpsStatus'); if(el) el.textContent = text;
}

function getLiveRotation(video){
  const want = effectiveLiveOrient();
  const sourceW = video.videoWidth || (want === 'landscape' ? 1280 : 720);
  const sourceH = video.videoHeight || (want === 'landscape' ? 720 : 1280);
  const sourceIsLandscape = sourceW >= sourceH;
  const wantLandscape = want === 'landscape';
  if(wantLandscape && !sourceIsLandscape) return 90;
  if(!wantLandscape && sourceIsLandscape) return -90;
  return 0;
}
function syncLiveOutputCanvas(video, canvas){
  const want = effectiveLiveOrient();
  const sourceW = video.videoWidth || (want === 'landscape' ? 1280 : 720);
  const sourceH = video.videoHeight || (want === 'landscape' ? 720 : 1280);
  const rotation = getLiveRotation(video);
  const outW = rotation ? sourceH : sourceW;
  const outH = rotation ? sourceW : sourceH;
  if(canvas.width !== outW || canvas.height !== outH){
    canvas.width = outW; canvas.height = outH;
  }
  return rotation;
}
function setLiveOrientMode(mode){
  liveOrientMode = (mode === 'landscape' || mode === 'portrait') ? mode : 'auto';
  ['btnOrientAuto','btnOrientPortrait','btnOrientLandscape'].forEach(id => {
    const b = document.getElementById(id);
    if(b) b.classList.toggle('active', b.dataset.orient === liveOrientMode);
  });
  const video = document.getElementById('liveCameraPreview'), canvas = document.getElementById('liveStampCanvas');
  if(video && canvas) syncLiveOutputCanvas(video, canvas);
}
// Loop penggambaran berjalan SEJAK modal dibuka (bukan cuma saat merekam),
// supaya pengguna langsung melihat pratinjau stempel + orientasi sebelum
// menekan "Mulai Rekam". Karena syncLiveOutputCanvas() dipanggil tiap frame
// dan memakai effectiveLiveOrient(), mode OTOMATIS langsung ikut berputar
// begitu HP diputar — tanpa menekan tombol apa pun.
function startLivePreviewLoop(){
  const video = document.getElementById('liveCameraPreview'), canvas = document.getElementById('liveStampCanvas');
  const ctx = canvas.getContext('2d');
  const loop = () => {
    if(!liveStream){ liveDrawFrame = null; return; }
    const rotation = syncLiveOutputCanvas(video, canvas);
    drawLiveStamp(ctx, canvas, video, rotation);
    if((liveStampInfoTick++ % 15) === 0){
      const info = document.getElementById('liveStampInfo');
      if(info){
        const bingkai = effectiveLiveOrient() === 'landscape' ? 'Lanskap' : 'Potret';
        const sumber = liveOrientLocked ? 'terkunci' : (liveOrientMode === 'auto' ? lastOrientSource : 'manual');
        info.textContent = `${stampStatusText()} · Bingkai: ${bingkai} (${sumber})`;
      }
    }
    liveDrawFrame = requestAnimationFrame(loop);
  };
  loop();
}
function closeLiveRecordModal(){
  bfClose('liveRecordModal');
}
function _viewCloseLiveRecordModal(){
  if(liveRecorder && liveRecorder.state !== 'inactive') liveRecorder.stop();
  if(liveWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(liveWatchId);
  liveWatchId = null;
  if(liveGpsPollTimer != null) clearInterval(liveGpsPollTimer);
  liveGpsPollTimer = null;
  liveMapCrop = null; liveMapKey = ''; liveAddress = '';
  liveOrientLocked = null;
  liveStampLock = null;
  stopTiltWatch();
  if(liveDrawFrame) cancelAnimationFrame(liveDrawFrame);
  liveDrawFrame = null;
  if(liveStream) liveStream.getTracks().forEach(t => t.stop());
  liveStream = null;
  const video = document.getElementById('liveCameraPreview'); if(video) video.srcObject = null;
  const modal = document.getElementById('liveRecordModal'); if(modal) modal.classList.remove('show');
  document.getElementById('btnStartLiveRecord').style.display = '';
  document.getElementById('btnStopLiveRecord').style.display = 'none';
  const toggle = document.getElementById('liveOrientToggle'); if(toggle) toggle.classList.remove('disabled');
}
async function openLiveRecordModal(){
  const fallbackToDeviceCamera = () => {
    closeLiveRecordModal();
    showToast('Mode kamera live tidak tersedia — membuka kamera HP.');
    setTimeout(() => document.getElementById('inputVideo').click(), 120);
  };
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
    fallbackToDeviceCamera();
    return;
  }
  const modal = document.getElementById('liveRecordModal');
  const video = document.getElementById('liveCameraPreview');
  modal.classList.add('show');
  bfPush('liveRecordModal');
  liveOrientLocked = null;
  liveStampLock = null;
  stopTiltWatch();
  resetStampAutoState();   // mode OTOMATIS mulai dari nol tiap sesi kamera
  startTiltWatch();        // supaya lanskap tetap terdeteksi walau rotasi HP dikunci
  setLiveOrientMode(liveOrientMode);
  setStampMode(stampMode);
  setStampScale(stampScale);
  setLiveGpsStatus('Meminta izin kamera dan GPS...');
  try{
    liveStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:true });
    video.srcObject = liveStream;
    await video.play();
    startLivePreviewLoop();
    if(navigator.geolocation){
      const updateLiveGps = () => {
        navigator.geolocation.getCurrentPosition(pos => {
          liveGps = { lat:pos.coords.latitude, lng:pos.coords.longitude, accuracy:pos.coords.accuracy, updatedAt:Date.now() };
          const mapKey = `${liveGps.lat.toFixed(4)},${liveGps.lng.toFixed(4)}`;
          if(mapKey !== liveMapKey){
            liveMapKey = mapKey;
            loadSatelliteMapCrop(liveGps.lat, liveGps.lng, 17, 220).then(crop => { if(crop) liveMapCrop = crop; }).catch(() => {});
            reverseGeocode(liveGps.lat, liveGps.lng).then(address => { if(address) liveAddress = address; }).catch(() => {});
          }
          setLiveGpsStatus(`GPS diperbarui: ${liveGps.lat.toFixed(6)}, ${liveGps.lng.toFixed(6)} ±${Math.round(liveGps.accuracy)}m`);
        }, () => {
          if(!liveGps) setLiveGpsStatus('GPS belum tersedia — aktifkan izin lokasi sebelum merekam.');
        }, { enableHighAccuracy:true, maximumAge:0, timeout:8000 });
      };
      updateLiveGps();
      liveGpsPollTimer = setInterval(updateLiveGps, 1000);
    }
    setLiveGpsStatus('Kamera siap. GPS akan diperbarui setiap detik setelah tersedia.');
  }catch(e){
    console.warn('Mode kamera live gagal, gunakan kamera perangkat:', e);
    fallbackToDeviceCamera();
  }
}
// Pratinjau/rekaman live: gambar frame kamera (diputar bila perlu), lalu
// pasang stempel dengan MESIN YANG SAMA seperti foto & video tersimpan.
function drawLiveStamp(ctx, canvas, video, rotation=0){
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if(rotation === 90 || rotation === -90){
    // Putar video di sekitar TITIK TENGAH kanvas memakai ukuran asli video
    // (bukan ukuran kanvas yang sudah ditukar) — aman dari salah hitung.
    const vw = video.videoWidth || H;
    const vh = video.videoHeight || W;
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rotation === 90 ? Math.PI / 2 : -Math.PI / 2);
    ctx.drawImage(video, -vw / 2, -vh / 2, vw, vh);
  }else{
    ctx.drawImage(video, 0, 0, W, H);
  }
  ctx.restore();

  drawGeoStamp(ctx, W, H, {
    title: deriveRegionTitle(liveAddress) || 'Geo Foto Lapangan',
    address: liveAddress || 'Lokasi sedang dicari...',
    lat: liveGps ? liveGps.lat : null,
    lng: liveGps ? liveGps.lng : null,
    coordFallback: 'GPS mencari lokasi...',
    timestamp: Date.now(),
    mapCrop: liveMapCrop,
    badge: liveGps ? '● GPS LIVE' : '○ GPS mencari'
  }, liveStampLock
       ? { mode: liveStampLock.template, theme: liveStampLock.theme }
       : { mode: stampMode });
}
async function startLiveRecording(){
  if(!liveStream){
    showToast('Kamera live belum siap — gunakan kamera HP.');
    closeLiveRecordModal();
    setTimeout(() => document.getElementById('inputVideo').click(), 120);
    return;
  }
  // Orientasi dibekukan pada nilai yang sedang aktif (termasuk hasil deteksi
  // OTOMATIS) begitu rekaman dimulai — ukuran kanvas tidak boleh berubah di
  // tengah rekaman karena akan merusak file videonya.
  liveOrientLocked = effectiveLiveOrient();
  // Gaya stempel (template + warna) dibekukan pada hasil OTOMATIS terakhir
  // dari pratinjau. Dulu penilaian otomatis tetap jalan tiap frame saat
  // merekam, sehingga panel bisa berganti gaya/warna di tengah video.
  liveStampLock = { template: lastStampResolution.template, theme: lastStampResolution.theme };
  const info0 = document.getElementById('liveStampInfo');
  if(info0) info0.textContent = stampStatusText();
  const canvas=document.getElementById('liveStampCanvas');
  // Kanvas ini sudah aktif digambar oleh startLivePreviewLoop() sejak modal
  // dibuka, jadi rekaman tinggal menangkap stream dari kanvas yang sama —
  // apa yang terlihat di pratinjau itulah yang terekam.
  const composite=canvas.captureStream(30);
  liveStream.getAudioTracks().forEach(t=>composite.addTrack(t));
  // Utamakan MP4 kalau perangkat/browser mendukungnya. WhatsApp (dan
  // banyak aplikasi lain) sering GAGAL menampilkan/menerima lampiran
  // video berformat WebM sebagai video yang bisa diputar — video jadi
  // "tidak muncul" saat dibagikan. MP4 jauh lebih kompatibel untuk
  // dibagikan, jadi kita coba dulu sebelum jatuh ke WebM.
  const types=['video/mp4;codecs=h264,aac','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mime=types.find(t=>MediaRecorder.isTypeSupported(t))||'';
  liveChunks=[]; liveRecorder=new MediaRecorder(composite,mime?{mimeType:mime,videoBitsPerSecond:5000000}:undefined);
  liveRecorder.ondataavailable=e=>{if(e.data.size)liveChunks.push(e.data);};
  liveRecorder.onstop=()=>{
    composite.getTracks().forEach(t=>t.stop());
    const blob=new Blob(liveChunks,{type:mime||'video/webm'}); blob.geoStamped=true;
    closeLiveRecordModal(); startQueue([blob],'camera');
  };
  liveRecordingStartedAt=Date.now(); liveRecorder.start(250);
  document.getElementById('btnStartLiveRecord').style.display='none'; document.getElementById('btnStopLiveRecord').style.display='';
  // Kunci pilihan orientasi begitu rekaman dimulai, supaya tidak berubah
  // di tengah rekaman (tombol dinonaktifkan sampai rekaman berhenti).
  const toggle = document.getElementById('liveOrientToggle');
  if(toggle) toggle.classList.add('disabled');
}
function stopLiveRecording(){
  if(liveRecorder && liveRecorder.state==='recording') liveRecorder.stop();
  liveStampLock = null;
}

async function generateStampedVideo(entry){
  const blob = entry.videoBlob;
  if(!blob) return null;
  if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
    throw new Error('Browser ini belum mendukung stempel video otomatis.');
  }
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true;
  video.src = URL.createObjectURL(blob);
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error('Video tidak dapat diproses.'));
  });
  const width = video.videoWidth || 1280, height = video.videoHeight || 720;
  const scale = Math.min(1, 1920 / width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const ctx = canvas.getContext('2d');
  // Citra satelit diunduh SEKALI sebelum perekaman, lalu dipakai ulang tiap
  // frame — dulu video cuma dapat kotak hijau gradien, sekarang peta asli
  // seperti pada foto.
  let mapCrop = null;
  try { mapCrop = await loadSatelliteMapCrop(entry.lat, entry.lng, 17, 256); } catch(e) {}
  resetStampAutoState();   // penilaian otomatis untuk video ini mulai bersih
  const stream = canvas.captureStream(30);
  let sourceStream = null;
  try { sourceStream = video.captureStream ? video.captureStream() : null; } catch(e) {}
  if(sourceStream) sourceStream.getAudioTracks().forEach(track => stream.addTrack(track));
  // Sama seperti rekaman live: utamakan MP4 agar hasil video kompatibel
  // saat dibagikan lewat WhatsApp (WebM sering tidak tampil sebagai video).
  const preferred = ['video/mp4;codecs=h264,aac','video/mp4;codecs=avc1,mp4a.40.2','video/mp4','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'];
  const mimeType = preferred.find(type => MediaRecorder.isTypeSupported(type)) || '';
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : undefined);
  const chunks = [];
  recorder.ondataavailable = e => { if(e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((resolve, reject) => { recorder.onstop = resolve; recorder.onerror = e => reject(e.error || e); });
  const stampData = {
    title: entry.businessName || deriveRegionTitle(entry.addressManual || entry.addressAuto || '') || catLabel(entry.category),
    address: entry.addressManual || entry.addressAuto || '',
    note: entry.note || '',
    lat: entry.lat, lng: entry.lng,
    timestamp: entry.timestamp,
    mapCrop,
    badge: 'Geo Foto Lapangan'
  };
  // Mode stempel dikunci di frame pertama supaya template/warnanya tidak
  // berkedip-ganti di tengah video (mode OTOMATIS dievaluasi sekali saja).
  // Dulu gaya dikunci pada frame PERTAMA. Masalahnya frame pertama video
  // sering masih hitam/belum ter-render, jadi mode OTOMATIS menilai gambar
  // kosong lalu mengunci warna yang salah untuk seluruh video. Sekarang
  // beberapa frame awal dinilai ulang (tanpa cache), baru dikunci pada
  // keputusan yang paling sering muncul.
  const PROBE_FRAMES = 8;
  let probe = 0;
  const suara = { gelap:0, terang:0 };
  let locked = null;
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if(!locked){
      const hasil = drawGeoStamp(ctx, canvas.width, canvas.height, stampData, { mode: stampMode, fresh: true });
      suara[hasil.theme] = (suara[hasil.theme] || 0) + 1;
      probe++;
      if(probe >= PROBE_FRAMES){
        locked = { template: hasil.template, theme: suara.terang > suara.gelap ? 'terang' : 'gelap' };
      }
    }else{
      drawGeoStamp(ctx, canvas.width, canvas.height, stampData, { mode: locked.template, theme: locked.theme });
    }
    if(!video.paused && !video.ended) requestAnimationFrame(draw);
  };
  video.currentTime = 0; await video.play(); recorder.start(250); draw();
  await stoppedAfterVideo(video, recorder, Date.now()); await stopped;
  stream.getTracks().forEach(track => track.stop()); if(sourceStream) sourceStream.getTracks().forEach(track => track.stop());
  URL.revokeObjectURL(video.src);
  return new Blob(chunks, { type: mimeType || 'video/webm' });
}

function stoppedAfterVideo(video, recorder, startedAt){
  return new Promise((resolve) => {
    const finish = () => {
      if(recorder.state !== 'inactive') recorder.stop();
      resolve();
    };
    video.onended = finish;
    video.onerror = finish;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const waitMs = duration > 0 ? Math.ceil(duration * 1000) + 1200 : 120000;
    setTimeout(finish, waitMs);
  });
}

// Jaring pengaman kedua: sekali proses simpan sedang berjalan, panggilan
// berikutnya diabaikan. Proses simpan bisa makan beberapa detik (stempel
// foto/video), dan selama itu tombol masih bisa tersentuh dua kali —
// dulu itu menghasilkan dua entri dengan jam yang sama persis.
let savingDraft = false;
async function saveDraftAndAdvance(data){
  if(savingDraft) return;
  if(!currentDraft || currentDraft.lat == null || currentDraft.lng == null){
    showToast('Tandai lokasi terlebih dahulu di peta.');
    return;
  }
  savingDraft = true;
  const btnSave = document.getElementById('btnSaveQ');
  const btnSaveAll = document.getElementById('btnSaveAllQ');
  if(btnSave) btnSave.disabled = true;
  if(btnSaveAll) btnSaveAll.disabled = true;
  try{
    await doSaveDraftAndAdvance(data);
  } finally {
    savingDraft = false;
    if(btnSave) btnSave.disabled = false;
    if(btnSaveAll) btnSaveAll.disabled = false;
  }
}

async function doSaveDraftAndAdvance(data){
  if(!currentDraft || currentDraft.lat == null || currentDraft.lng == null){
    showToast('Tandai lokasi terlebih dahulu di peta.');
    return;
  }
  data = data || readDraftLocationData();
  if(currentDraft.mediaType === 'photo' && !currentDraft.stampedPhotoBlob){
    try { currentDraft.stampedPhotoBlob = await generateStampedPhoto({ ...currentDraft, ...data, timestamp: Date.now() }); }
    catch(e) { console.warn('Stempel foto dengan peta gagal, foto asli tetap disimpan:', e); }
  }
  if(currentDraft.mediaType === 'video' && !currentDraft.stampedVideoBlob){
    showToast('Membuat stempel GPS di dalam video, mohon tunggu...');
    try { currentDraft.stampedVideoBlob = await generateStampedVideo({ ...currentDraft, ...data, timestamp: Date.now() }); }
    catch(e) { console.warn('Stempel video gagal:', e); showToast('Stempel video tidak didukung browser ini; video asli tetap disimpan.'); }
  }
  const entry = {
    category: currentCategory,
    businessName: data.businessName,
    lat: data.lat, lng: data.lng,
    coordSource: data.coordSource,
    addressAuto: data.addressAuto,
    addressManual: data.addressManual,
    note: data.note,
    timestamp: Date.now(),
    mediaType: currentDraft.mediaType || 'photo',
    photoBlob: currentDraft.photoBlob,
    stampedPhotoBlob: currentDraft.stampedPhotoBlob || null,
    videoBlob: currentDraft.stampedVideoBlob || currentDraft.videoBlob,
    thumbBlob: currentDraft.thumbBlob,
    fileName: (currentDraft.file && currentDraft.file.name) || `media_${Date.now()}.${currentDraft.mediaType === 'video' ? 'webm' : 'jpg'}`,
    mimeType: currentDraft.stampedVideoBlob ? (currentDraft.stampedVideoBlob.type || 'video/webm') : (currentDraft.file && currentDraft.file.type || ''),
    // Kalau alamat otomatis belum berhasil didapat (mis. sedang offline),
    // tandai entri ini supaya dicoba ulang otomatis begitu koneksi kembali ada.
    geocodePending: !currentDraft.addressAuto
  };
  const localId = await addEntry(entry);
  // PENTING: nomor dokumen cloud diklaim dan ditulis ke entri lokal SEBELUM
  // diunggah. Dulu urutannya: simpan lokal → unggah → baru catat cloudDocId.
  // Di sela itu, listener sinkron real-time sudah menerima dokumen baru dari
  // Firestore, mencari entri lokal ber-cloudDocId sama, TIDAK ketemu (karena
  // belum sempat dicatat), lalu menyimpulkan "ini entri baru dari HP lain"
  // dan membuat SALINAN KEDUA. Itulah asal foto/video yang tersimpan dobel.
  const cloudDocId = makeCloudDocId(localId);
  await updateEntry(localId, { cloudDocId });
  showToast(`${entry.mediaType === 'video' ? 'Video' : 'Foto'} tersimpan ✅`);
  lastSavedEntryId = localId;
  document.getElementById('lastSavedBar').style.display = 'flex';
  const synced = await syncEntryToCloud(cloudDocId, entry);
  const changes = { cloudSynced: synced, cloudDocId };
  await updateEntry(localId, changes);
  qIndex++;
  processQueueItem();
  refreshMenuBadge(currentCategory);
}

async function onSaveDraft(){
  await saveDraftAndAdvance();
}

async function onSaveAllDrafts(){
  if(!currentDraft || currentDraft.lat == null || currentDraft.lng == null){
    showToast('Tandai lokasi terlebih dahulu di peta.');
    return;
  }
  if(queue.length - qIndex <= 1){
    showToast('Antrean hanya berisi satu foto.');
    await saveDraftAndAdvance();
    return;
  }
  sharedLocationData = readDraftLocationData();
  showToast(`Lokasi dipakai untuk ${queue.length - qIndex} foto...`);
  await saveDraftAndAdvance(sharedLocationData);
}

function onSkipDraft(){
  qIndex++;
  processQueueItem();
}

function onCancelQueue(){
  queue = []; qIndex = 0; currentDraft = null; sharedLocationData = null;
  document.getElementById('reviewPanel').style.display = 'none';
  if(reviewMap){ reviewMap.remove(); reviewMap = null; }
}

function endQueue(){
  document.getElementById('reviewPanel').style.display = 'none';
  if(reviewMap){ reviewMap.remove(); reviewMap = null; }
  showToast('Selesai memproses semua foto.');
  queue = []; qIndex = 0; currentDraft = null; sharedLocationData = null;
  if(currentTab === 'list') renderList();
}

/* ==========================================================================
   RETRY ALAMAT OTOMATIS SAAT KONEKSI KEMBALI ADA
   ========================================================================== */
let retryRunning = false;
async function retryPendingGeocodes(){
  if(retryRunning || !navigator.onLine) return;
  retryRunning = true;
  try{
    const all = await getAllEntries();
    const pending = all.filter(en => en.geocodePending && en.lat != null && en.lng != null);
    if(pending.length === 0) return;

    let updated = 0;
    for(const en of pending){
      if(!navigator.onLine) break; // koneksi putus lagi di tengah proses, hentikan
      const addr = await reverseGeocode(en.lat, en.lng);
      if(addr){
        const changes = { addressAuto: addr, geocodePending: false };
        // isi alamat final otomatis HANYA kalau petugas belum sempat mengetik apa pun,
        // supaya tidak menimpa alamat manual yang sudah diedit.
        if(!en.addressManual || !en.addressManual.trim()){
          changes.addressManual = addr;
        }
        await updateEntry(en.id, changes);
        updated++;
      }
    }

    if(updated > 0){
      showToast(`📶 ${updated} alamat otomatis berhasil diperbarui setelah online.`);
      if(currentCategory){
        if(currentTab === 'list') renderList();
        refreshMenuBadge(currentCategory);
      }
    }
  } finally {
    retryRunning = false;
  }
}

/* ==========================================================================
   FIREBASE / CLOUD SYNC (untuk Peta Pantau publik)
   ========================================================================== */
let firestoreDB = null;
let firebaseReady = false;

function initFirebase(){
  try{
    if(typeof FIREBASE_CONFIG === 'undefined') return;
    if(!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.indexOf('PASTE_') === 0) return; // belum diisi
    if(typeof firebase === 'undefined') return; // SDK gagal dimuat (mis. offline)
    firebase.initializeApp(FIREBASE_CONFIG);
    firestoreDB = firebase.firestore();
    firebaseReady = true;
  }catch(e){
    console.warn('Firebase belum aktif:', e);
    firebaseReady = false;
  }
}
initFirebase();

function blobToDataURL(blob){
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Mengirim satu entri ke Firestore supaya muncul di Peta Pantau publik.
// docId = ID dokumen Firestore yang harus dipakai/dipertahankan (BUKAN selalu id lokal —
// untuk data hasil "Pulihkan dari Cloud", id lokal dan id dokumen cloud itu BEDA).
// Mengembalikan true HANYA kalau benar-benar berhasil terkirim ke cloud.
async function syncEntryToCloud(docId, entry){
  if(!firebaseReady) return false;
  try{
    const thumbDataUrl = await blobToDataURL(entry.thumbBlob);
    await firestoreDB.collection(FIRESTORE_COLLECTION).doc(String(docId)).set({
      category: entry.category,
      businessName: entry.businessName || '',
      lat: entry.lat,
      lng: entry.lng,
      address: entry.addressManual || entry.addressAuto || '',
      note: entry.note || '',
      timestamp: entry.timestamp,
      thumbDataUrl: thumbDataUrl,
      // PENTING: sertakan mediaType supaya "Pulihkan dari Cloud"/"Sinkron
      // Ulang" di HP lain tahu ini video, bukan foto. Sebelumnya field ini
      // tidak pernah dikirim, sehingga entri video yang dipulihkan dari
      // cloud selalu dikira foto — thumbnail placeholder "VIDEO" ikut
      // tampil seolah itu fotonya, dan tombol Bagikan jadi rusak karena
      // tidak ada video sungguhan yang bisa dibagikan.
      mediaType: entry.mediaType || 'photo'
    });
    return true;
  }catch(e){
    console.warn('Gagal sinkron ke cloud:', e);
    return false;
  }
}

async function deleteEntryFromCloud(docId){
  if(!firebaseReady) return;
  try{ await firestoreDB.collection(FIRESTORE_COLLECTION).doc(String(docId)).delete(); }
  catch(e){ console.warn('Gagal hapus dari cloud:', e); }
}

let cloudRetryRunning = false;
async function retryPendingCloudSync(){
  if(!firebaseReady || !navigator.onLine || cloudRetryRunning) return;
  cloudRetryRunning = true;
  try{
    const all = await getAllEntries();
    // cloudSynced !== true mencakup entri lama yang dibuat SEBELUM Firebase
    // diaktifkan sekalipun (field-nya belum pernah ada sama sekali).
    // en.deleted !== true supaya foto yang sudah dipindah ke Sampah TIDAK
    // ikut terkirim ke Peta Pantau publik.
    const pending = all.filter(en => en.cloudSynced !== true && en.deleted !== true);
    if(pending.length === 0) return;
    let ok = 0;
    for(const en of pending){
      if(!navigator.onLine) break;
      const docId = getStableCloudDocId(en);
      // Catat dulu nomor dokumennya di entri lokal, baru diunggah — supaya
      // listener sinkron tidak keburu menganggapnya data asing lalu menyalin.
      if(en.cloudDocId !== docId) await updateEntry(en.id, { cloudDocId: docId });
      const success = await syncEntryToCloud(docId, en);
      if(success){ await updateEntry(en.id, { cloudSynced:true, cloudDocId:docId }); ok++; }
    }
    if(ok > 0){
      showToast(`☁️ ${ok} data berhasil disinkron ke Peta Pantau.`);
      if(currentCategory){
        if(currentTab === 'list') renderList();
      }
    }
  } finally {
    cloudRetryRunning = false;
  }
}

/* ==========================================================================
   SINKRON ULANG SEMUA DATA (perbaikan data lama yang hilang/tertimpa di
   Peta Pantau akibat bug ID dokumen cloud sebelum diperbaiki). Menekan
   ulang SEMUA entri lokal (bukan cuma yang belum sinkron), tetapi tetap
   memakai ID dokumen cloud yang sudah ada agar tidak membuat salinan baru.
   Entri baru memakai ID aman lintas HP. Dipicu manual lewat tombol
   "Sinkron Ulang".
   ========================================================================== */
let forceSyncRunning = false;
async function forceResyncAll(){
  if(!firebaseReady){ showToast('Fitur cloud belum aktif (cek firebase-config.js).'); return; }
  if(!navigator.onLine){ showToast('Perlu koneksi internet untuk sinkron ulang.'); return; }
  if(forceSyncRunning) return;
  forceSyncRunning = true;
  const btn = document.getElementById('btnForceSync');
  const originalText = btn ? btn.textContent : '';
  if(btn){ btn.disabled = true; btn.textContent = '🔁 Menyinkron ulang...'; }
  try{
    const all = await getAllEntries();
    const toSync = all.filter(en => en.deleted !== true);
    let ok = 0, fail = 0;
    for(const en of toSync){
      if(!navigator.onLine) break;
      // Jangan pernah mengganti ID dokumen yang sudah ada. Mengganti ID di
      // sini membuat Firestore menyimpan dokumen lama dan dokumen baru,
      // sehingga satu foto tampak dua kali setelah sinkron ulang.
      const docId = getStableCloudDocId(en);
      // Catat dulu nomor dokumennya di entri lokal, baru diunggah — supaya
      // listener sinkron tidak keburu menganggapnya data asing lalu menyalin.
      if(en.cloudDocId !== docId) await updateEntry(en.id, { cloudDocId: docId });
      const success = await syncEntryToCloud(docId, en);
      if(success){ await updateEntry(en.id, { cloudSynced:true, cloudDocId:docId }); ok++; }
      else fail++;
    }
    showToast(fail === 0
      ? `🔁 ${ok} data berhasil disinkron ulang ke Peta Pantau.`
      : `🔁 ${ok} berhasil, ${fail} gagal (cek koneksi lalu coba lagi).`);
    if(currentTab === 'list') renderList();
  }catch(e){
    console.error('Gagal sinkron ulang semua data:', e);
    showToast('Gagal sinkron ulang. Coba lagi nanti.');
  } finally {
    forceSyncRunning = false;
    if(btn){ btn.disabled = false; btn.textContent = originalText; }
  }
}

async function onBatchShare(){
  if(selectedIds.size === 0){ showToast('Pilih minimal 1 foto dulu.'); return; }
  if(selectedIds.size > 10){ showToast('Maksimal 10 foto sekaligus untuk satu kali bagikan.'); return; }

  showToast(`Menyiapkan ${selectedIds.size} foto berkoordinat...`);
  const btn = document.getElementById('btnBatchShare');
  btn.disabled = true;

  try{
    const files = [];
    for(const id of selectedIds){
      const entry = await getEntry(id);
      if(!entry) continue;
      const stampedBlob = await generateStampedPhoto(entry);
      const safeName = (entry.businessName || catLabel(entry.category)).replace(/[^a-z0-9]+/gi, '_');
      const fileName = `GeoFoto_${safeName}_${new Date(entry.timestamp).toISOString().slice(0,10)}_${id}.jpg`;
      files.push(new File([stampedBlob], fileName, { type:'image/jpeg' }));
      const newCount = (entry.shareCount || 0) + 1;
      await updateEntry(id, { shareCount: newCount, lastSharedAt: Date.now() });
    }

    if(files.length === 0){ showToast('Tidak ada foto valid untuk dibagikan.'); return; }

    if(navigator.canShare && navigator.canShare({ files })){
      await navigator.share({ files });
    } else {
      for(const f of files){
        const url = URL.createObjectURL(f);
        const a = document.createElement('a');
        a.href = url; a.download = f.name;
        document.body.appendChild(a); a.click(); a.remove();
        await new Promise(r => setTimeout(r, 300));
        URL.revokeObjectURL(url);
      }
      showToast(`${files.length} foto sudah diunduh — lampirkan manual ke WhatsApp.`);
    }

    toggleBatchMode();
  }catch(e){
    if(e && e.name === 'AbortError'){ /* dibatalkan user */ }
    else { console.error('Gagal bagikan banyak foto:', e); showToast('Gagal menyiapkan foto untuk dibagikan.'); }
  } finally {
    btn.disabled = false;
  }
}

/* ==========================================================================
   PULIHKAN DATA DARI CLOUD (kalau data lokal hilang / diambil HP lain)
   ========================================================================== */
function dataURLToBlob(dataUrl){
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/data:(.*?);base64/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const binary = atob(parts[1]);
  const arr = new Uint8Array(binary.length);
  for(let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/* ==========================================================================
   SINKRON REAL-TIME PER KATEGORI (supaya Daftar Data otomatis update
   begitu rekan kerja lain mengambil foto — tanpa perlu klik "Pulihkan dari
   Cloud" manual). Berjalan mirip Peta Pantau: listen ke Firestore selama
   user berada di dalam satu kategori, tarik entri baru dari rekan kerja
   ke IndexedDB lokal, lalu render ulang daftar kalau sedang di tab List.
   ========================================================================== */
let categoryCloudUnsub = null;

// Mencari entri LOKAL yang sebenarnya adalah data yang sama dengan dokumen
// cloud ini, tapi kebetulan belum punya cloudDocId (mis. karena unggahannya
// sempat gagal, atau tersimpan oleh versi aplikasi lama). Dipakai supaya
// dokumen cloud "diakui" oleh entri yang sudah ada — bukan malah ditambahkan
// sebagai entri baru yang jadi kembaran.
function findLocalTwinForCloudDoc(localList, d, skipIds){
  const ts = d.timestamp || 0;
  const tipe = d.mediaType === 'video' ? 'video' : 'photo';
  return localList.find(e =>
    !e.cloudDocId &&
    e.deleted !== true &&
    !skipIds.has(e.id) &&
    ((e.mediaType || 'photo') === tipe) &&
    Math.abs((e.timestamp || 0) - ts) < 120000 &&
    e.lat != null && e.lng != null && d.lat != null && d.lng != null &&
    Math.abs(e.lat - d.lat) < 0.0003 && Math.abs(e.lng - d.lng) < 0.0003
  ) || null;
}

function startCategoryCloudSync(catId){
  stopCategoryCloudSync();
  if(!firebaseReady){
    console.warn('Sinkronisasi kategori dilewati: Firebase belum siap.');
    return;
  }
  categoryCloudUnsub = firestoreDB.collection(FIRESTORE_COLLECTION)
    .where('category', '==', catId)
    .onSnapshot(async (snapshot) => {
      try{
        const allLocal = await getAllEntries();
        const localByCloudId = new Map(
          allLocal.filter(e => e.category === catId)
            .map(e => [e.cloudDocId || (e.cloudSynced === true ? String(e.id) : ''), e])
            .filter(([cloudId]) => cloudId)
        );
        const cloudIds = new Set(snapshot.docs.map(doc => doc.id));
        const localList = allLocal.filter(e => e.category === catId);
        const adopted = new Set();
        let added = 0, updated = 0, removed = 0;
        for(const doc of snapshot.docs){
          const d = doc.data();
          let blob;
          try{ blob = dataURLToBlob(d.thumbDataUrl); }catch(e){ continue; }
          const mediaType = d.mediaType === 'video' ? 'video' : 'photo';
          const local = localByCloudId.get(doc.id);
          if(!local){
            // Sebelum memutuskan "ini entri baru dari HP lain", cek dulu apakah
            // datanya sebenarnya sudah ada di HP ini. Kalau ya, cukup tautkan
            // nomor dokumen cloudnya — JANGAN buat entri kedua. Foto/video asli
            // resolusi penuh milik entri lokal tetap dipertahankan.
            const twin = findLocalTwinForCloudDoc(localList, d, adopted);
            if(twin){
              adopted.add(twin.id);
              await updateEntry(twin.id, { cloudSynced:true, cloudDocId: doc.id });
              updated++;
              continue;
            }
          }
          if(local){
            // Data yang sedang berada di Sampah jangan dihidupkan kembali oleh
            // listener; cukup pertahankan status sampah lokalnya.
            if(local.deleted === true) continue;
            await updateEntry(local.id, {
              category: d.category || catId,
              businessName: d.businessName || '', lat: d.lat, lng: d.lng,
              addressAuto: d.address || '', addressManual: d.address || '',
              note: d.note || '', timestamp: d.timestamp || Date.now(),
              thumbBlob: blob, cloudSynced: true, cloudDocId: doc.id
            });
            updated++;
          } else {
            // Entri BARU dari rekan kerja lain: cloud cuma menyimpan
            // thumbnail, bukan video aslinya. Tandai mediaType dan kosongkan
            // videoBlob secara eksplisit supaya daftar & tombol Bagikan tahu
            // ini video tanpa file asli — bukan malah dikira foto biasa
            // (dulu ini yang bikin placeholder "VIDEO" tampil seolah foto).
            await addEntry({
              category: d.category || catId, businessName: d.businessName || '',
              lat: d.lat, lng: d.lng, coordSource: 'Disinkron otomatis dari cloud',
              addressAuto: d.address || '', addressManual: d.address || '',
              note: d.note || '', timestamp: d.timestamp || Date.now(),
              mediaType,
              photoBlob: mediaType === 'video' ? null : blob, thumbBlob: blob,
              videoBlob: null, cloudThumbOnly: true,
              fileName: `cloud_${doc.id}.jpg`,
              cloudSynced: true, cloudDocId: doc.id
            });
            added++;
          }
        }
        // Dokumen yang dihapus permanen dari cloud juga dihapus dari daftar
        // lokal. Data yang sudah ada di Sampah sengaja dipertahankan sebagai
        // riwayat lokal dan tidak ditarik kembali.
        for(const [cloudId, local] of localByCloudId){
          if(!cloudIds.has(cloudId) && local.deleted !== true){
            await deleteEntry(local.id);
            removed++;
          }
        }
        if(added > 0 || updated > 0 || removed > 0){
          refreshMenuBadge(catId);
          if(currentTab === 'list' && currentCategory === catId) renderList();
          if(currentTab === 'map' && currentCategory === catId && typeof renderOverviewMap === 'function') renderOverviewMap();
        }
      }catch(e){
        console.warn('Gagal sinkron real-time kategori:', e);
      }
    }, (err) => {
      console.warn('Listener cloud kategori error:', err);
      showToast('Sinkronisasi cloud terputus. Cek internet lalu tekan Pulihkan dari Cloud.');
    });
}

/* ==========================================================================
   BERSIHKAN DATA DOBEL YANG SUDAH TERLANJUR ADA
   Perbaikan di atas mencegah kembaran BARU. Yang sudah terlanjur tersimpan
   dobel di HP dibereskan lewat tombol ini: dari tiap pasangan kembar, yang
   DISIMPAN adalah yang memegang file asli (foto/video resolusi penuh), dan
   yang tinggal thumbnail dari cloud dipindahkan ke Sampah — masih bisa
   dipulihkan 30 hari kalau ternyata salah. Nomor dokumen cloud dipindahkan
   ke entri yang disimpan supaya tidak ditarik ulang jadi dobel lagi.
   ========================================================================== */
function nilaiKelengkapan(en){
  let n = 0;
  if(en.mediaType === 'video' ? en.videoBlob : en.photoBlob) n += 4; // punya file asli
  if(!en.cloudThumbOnly) n += 2;
  if(en.businessName) n += 1;
  return n;
}
async function cleanupDuplicates(){
  const all = await getAllEntries();
  const aktif = all.filter(e => e.category === currentCategory && e.deleted !== true);
  const grup = new Map();
  aktif.forEach(en => {
    const kunci = [
      en.mediaType || 'photo',
      en.lat != null ? en.lat.toFixed(4) : '-',
      en.lng != null ? en.lng.toFixed(4) : '-',
      Math.round((en.timestamp || 0) / 120000)   // dibulatkan per 2 menit
    ].join('|');
    if(!grup.has(kunci)) grup.set(kunci, []);
    grup.get(kunci).push(en);
  });

  const kembar = [...grup.values()].filter(g => g.length > 1);
  const totalBuang = kembar.reduce((n, g) => n + g.length - 1, 0);
  if(totalBuang === 0){ showToast('Tidak ada data dobel di kategori ini. 👍'); return; }
  if(!confirm(`Ditemukan ${totalBuang} data dobel di kategori ini.\n\nYang dipertahankan adalah yang menyimpan foto/video ASLI; salinannya dipindahkan ke Sampah (masih bisa dipulihkan 30 hari). Lanjutkan?`)) return;

  let dibuang = 0;
  for(const g of kembar){
    g.sort((a, b) => nilaiKelengkapan(b) - nilaiKelengkapan(a) || a.id - b.id);
    const simpan = g[0];
    let cloudIdUntukDisimpan = simpan.cloudDocId || null;
    for(const dup of g.slice(1)){
      if(!cloudIdUntukDisimpan && dup.cloudDocId) cloudIdUntukDisimpan = dup.cloudDocId;
      // cloudDocId dilepas dari salinan supaya dokumen cloudnya tidak dianggap
      // "hilang" lalu ditarik ulang sebagai entri baru.
      await updateEntry(dup.id, { deleted:true, deletedAt: Date.now(), cloudDocId:null, cloudSynced:false });
      dibuang++;
    }
    if(cloudIdUntukDisimpan && cloudIdUntukDisimpan !== simpan.cloudDocId){
      await updateEntry(simpan.id, { cloudDocId: cloudIdUntukDisimpan, cloudSynced:true });
    }
  }
  showToast(`🧹 ${dibuang} data dobel dipindahkan ke Sampah.`);
  renderList();
  refreshMenuBadge(currentCategory);
}

function stopCategoryCloudSync(){
  if(categoryCloudUnsub){ categoryCloudUnsub(); categoryCloudUnsub = null; }
}

async function restoreFromCloud(){
  if(!firebaseReady){ showToast('Fitur cloud belum aktif (cek firebase-config.js).'); return; }
  if(!navigator.onLine){ showToast('Perlu koneksi internet untuk memulihkan data.'); return; }

  const btn = document.getElementById('btnRestoreCloud');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = '🔄 Memeriksa cloud...';

  try{
    const snapshot = await firestoreDB.collection(FIRESTORE_COLLECTION)
      .where('category', '==', currentCategory).get();

    const allLocal = await getAllEntries();
    // Cek termasuk yang ada di Sampah juga, supaya data yang baru dihapus (belum lewat 30 hari)
    // tidak ditarik ulang jadi dobel oleh "Pulihkan dari Cloud".
    const localEntries = allLocal.filter(e => e.category === currentCategory);
    const existingCloudIds = new Set(localEntries.map(e => e.cloudDocId || (e.cloudSynced === true ? String(e.id) : '')).filter(Boolean));

    let restored = 0, ditautkan = 0;
    const adopted = new Set();
    for(const doc of snapshot.docs){
      if(existingCloudIds.has(doc.id)) continue; // sudah ada di HP ini
      const d = doc.data();
      const twin = findLocalTwinForCloudDoc(localEntries, d, adopted);
      if(twin){
        // Data ini sebenarnya sudah ada di HP, cuma belum bertaut ke cloud.
        // Tautkan saja — jangan tambah entri kedua.
        adopted.add(twin.id);
        await updateEntry(twin.id, { cloudSynced:true, cloudDocId: doc.id });
        ditautkan++;
        continue;
      }
      let blob;
      try{ blob = dataURLToBlob(d.thumbDataUrl); }catch(e){ continue; }

      const mediaType = d.mediaType === 'video' ? 'video' : 'photo';
      const entry = {
        category: d.category || currentCategory,
        businessName: d.businessName || '',
        lat: d.lat, lng: d.lng,
        coordSource: 'Dipulihkan dari cloud',
        addressAuto: d.address || '',
        addressManual: d.address || '',
        note: d.note || '',
        timestamp: d.timestamp || Date.now(),
        mediaType,
        // Yang tersimpan di cloud CUMA thumbnail (video asli tidak pernah
        // diunggah — ukurannya kebesaran untuk Firestore). Untuk entri
        // video, tandai videoBlob KOSONG secara eksplisit (bukan diisi
        // gambar placeholder) supaya tombol Bagikan tahu video sungguhan
        // tidak tersedia di HP ini, alih-alih diam-diam membagikan gambar
        // placeholder "VIDEO" seolah itu videonya.
        photoBlob: mediaType === 'video' ? null : blob,
        thumbBlob: blob,
        videoBlob: null,
        cloudThumbOnly: true,
        fileName: `cloud_${doc.id}.${mediaType === 'video' ? 'jpg' : 'jpg'}`,
        cloudSynced: true,
        cloudDocId: doc.id
      };
      await addEntry(entry);
      restored++;
    }

    if(restored > 0 || ditautkan > 0){
      const pesan = [];
      if(restored > 0) pesan.push(`${restored} data dipulihkan dari cloud`);
      if(ditautkan > 0) pesan.push(`${ditautkan} data yang sudah ada ditautkan ulang (tidak digandakan)`);
      showToast('🔄 ' + pesan.join(', ') + '.');
      renderList();
      refreshMenuBadge(currentCategory);
    } else {
      showToast('Data di HP ini sudah lengkap, tidak ada yang perlu dipulihkan.');
    }
  }catch(e){
    console.error('Gagal memulihkan dari cloud:', e);
    showToast('Gagal memulihkan data. Cek koneksi internet & Firestore Rules.');
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

/* ==========================================================================
   STEMPEL KOORDINAT PADA FOTO & BAGIKAN (WA/Grup)
   ========================================================================== */
function wrapText(ctx, text, maxWidth){
  const words = String(text).split(' ');
  const lines = [];
  let current = '';
  for(const w of words){
    const test = current ? current + ' ' + w : w;
    if(ctx.measureText(test).width > maxWidth && current){
      lines.push(current);
      current = w;
    } else {
      current = test;
    }
  }
  if(current) lines.push(current);
  return lines;
}

function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.lineTo(x+w-rr, y);
  ctx.arcTo(x+w, y, x+w, y+rr, rr);
  ctx.lineTo(x+w, y+h-rr);
  ctx.arcTo(x+w, y+h, x+w-rr, y+h, rr);
  ctx.lineTo(x+rr, y+h);
  ctx.arcTo(x, y+h, x, y+h-rr, rr);
  ctx.lineTo(x, y+rr);
  ctx.arcTo(x, y, x+rr, y, rr);
  ctx.closePath();
}

const PIN_SVG_PATH = 'M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z';
function drawMapPin(ctx, tipX, tipY, desiredHeight, color){
  const scale = desiredHeight / 42;
  const path = new Path2D(PIN_SVG_PATH);
  ctx.save();
  ctx.translate(tipX - 15*scale, tipY - 42*scale);
  ctx.scale(scale, scale);
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 3/scale;
  ctx.fillStyle = color;
  ctx.fill(path);
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(15, 15, 6.4, 0, Math.PI*2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function deriveRegionTitle(addressStr){
  if(!addressStr) return '';
  const parts = addressStr.split(',').map(s => s.trim()).filter(Boolean);
  return parts.slice(-3).join(', ');
}

// Format: "Jumat, 11/09/2026 10:32 AM GMT+08.00"
function formatStampDate(ts){
  const d = new Date(ts);
  const days = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const dayName = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yyyy = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2,'0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12; if(hours === 0) hours = 12;
  const hh = String(hours).padStart(2,'0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const offH = Math.floor(Math.abs(offsetMin)/60);
  const offM = Math.abs(offsetMin)%60;
  const gmtStr = `GMT${sign}${String(offH).padStart(2,'0')}.${String(offM).padStart(2,'0')}`;
  return `${dayName}, ${dd}/${mm}/${yyyy} ${hh}:${minutes} ${ampm} ${gmtStr}`;
}

function fitSingleLineFontSize(ctx, text, size, family, weight, maxWidth, minSize){
  let s = size;
  while(s > minSize){
    ctx.font = `${weight ? weight + ' ' : ''}${s}px ${family}`;
    if(ctx.measureText(text).width <= maxWidth) break;
    s -= 1;
  }
  return s;
}

async function loadSatelliteMapCrop(lat, lng, zoom, size){
  if(lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return null;
  const n = Math.pow(2, zoom);
  const worldX = (lng + 180) / 360 * n;
  const latRad = lat * Math.PI / 180;
  const worldY = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * n;
  const tileX = Math.floor(worldX);
  const tileY = Math.floor(worldY);
  const fracX = worldX - tileX;
  const fracY = worldY - tileY;
  const tileSize = 256;
  const mosaic = document.createElement('canvas');
  mosaic.width = tileSize * 3; mosaic.height = tileSize * 3;
  const mctx = mosaic.getContext('2d');
  const loadTile = (x, y) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${((x % n) + n) % n}`;
  });
  try{
    for(let dy = -1; dy <= 1; dy++){
      for(let dx = -1; dx <= 1; dx++){
        const tile = await loadTile(tileX + dx, tileY + dy);
        mctx.drawImage(tile, (dx+1)*tileSize, (dy+1)*tileSize, tileSize, tileSize);
      }
    }
    const cropX = tileSize + fracX*tileSize - size/2;
    const cropY = tileSize + fracY*tileSize - size/2;
    return { canvas:mosaic, sx:cropX, sy:cropY, sw:size, sh:size };
  }catch(e){
    console.warn('Citra satelit untuk stempel tidak tersedia:', e);
    return null;
  }
}

async function generateStampedPhoto(entry){
  const img = await new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(entry.photoBlob);
    image.onload = () => { resolve(image); };
    image.onerror = reject;
    image.src = url;
  });

  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(img.src);

  const address = entry.addressManual || entry.addressAuto || '';
  const businessName = entry.businessName || '';
  const catText = catLabel(entry.category);

  // Citra satelit untuk kotak peta kecil di kiri panel.
  let mapCrop = null;
  try { mapCrop = await loadSatelliteMapCrop(entry.lat, entry.lng, 17, 256); } catch(e) {}

  // Stempel digambar oleh mesin yang SAMA dengan video, jadi foto dan video
  // dari satu lokasi kelihatan satu gaya.
  resetStampAutoState();
  drawGeoStamp(ctx, W, H, {
    title: businessName || deriveRegionTitle(address) || catText,
    address: address || catText,
    note: entry.note || '',
    lat: entry.lat, lng: entry.lng,
    timestamp: entry.timestamp,
    mapCrop,
    badge: 'Geo Foto Lapangan'
  }, { fresh:true });

  // Satu kali encoding JPEG kualitas tinggi agar detail wajah, tulisan, dan
  // tekstur bangunan tetap tajam saat dibagikan.
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.98));
}

async function shareEntry(id, withStamp){
  if(withStamp === undefined) withStamp = true;
  const entry = await getEntry(id);
  if(!entry){ showToast('Data tidak ditemukan.'); return; }
  // Entri video hasil "Pulihkan dari Cloud"/"Sinkron Ulang" dari HP lain
  // cuma membawa THUMBNAIL, bukan file video aslinya (video tidak pernah
  // diunggah ke cloud — ukurannya kebesaran). Kalau dipaksa dibagikan,
  // hasilnya rusak/kosong. Beri tahu dengan jelas alih-alih diam-diam gagal.
  if(entry.mediaType === 'video' && !entry.videoBlob){
    showToast('Video asli tidak tersedia di HP ini (data ini dipulihkan dari cloud, hanya berisi thumbnail). Video lengkap hanya ada di HP yang pertama kali merekamnya.');
    return;
  }
  showToast(entry.mediaType === 'video' ? 'Menyiapkan video...' : (withStamp ? 'Menyiapkan foto berkoordinat...' : 'Menyiapkan foto asli...'));
  try{
    const mediaBlob = entry.mediaType === 'video' ? entry.videoBlob : (withStamp ? (entry.stampedPhotoBlob || await generateStampedPhoto(entry)) : entry.photoBlob);
    const mime = entry.mediaType === 'video' ? (entry.mimeType || 'video/webm') : 'image/jpeg';
    const ext = entry.mediaType === 'video' ? (mime.includes('mp4') ? 'mp4' : 'webm') : 'jpg';
    const safeName = (entry.businessName || catLabel(entry.category)).replace(/[^a-z0-9]+/gi, '_');
    const fileName = `GeoFoto_${safeName}_${new Date(entry.timestamp).toISOString().slice(0,10)}.${ext}`;
    const file = new File([mediaBlob], fileName, { type:mime });
    let shared = false;

    const downloadMedia = () => {
      const url = URL.createObjectURL(mediaBlob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      showToast(entry.mediaType === 'video'
        ? 'Video sudah diunduh — lampirkan manual ke WhatsApp.'
        : 'Foto sudah diunduh — lampirkan manual ke WhatsApp.');
      return true;
    };
    let shareSupported = false;
    try { shareSupported = !!(navigator.canShare && navigator.canShare({ files:[file] })); } catch(e) {}
    if(shareSupported){
      try {
        await navigator.share({ files:[file], title:'Geo Foto Lapangan' });
        shared = true;
      } catch(e) {
        if(e && e.name === 'AbortError') throw e;
        console.warn('Web Share file gagal, beralih ke unduhan:', e);
        shared = downloadMedia();
      }
    } else {
      shared = downloadMedia();
    }

    if(shared){
      const newCount = (entry.shareCount || 0) + 1;
      await updateEntry(id, { shareCount: newCount, lastSharedAt: Date.now() });
      if(currentTab === 'list') renderList();
    }
  }catch(e){
    if(e && e.name === 'AbortError') return; // dibatalkan user, tidak perlu tampilkan error
    console.error('Gagal membagikan foto:', e);
    showToast('Gagal menyiapkan foto untuk dibagikan.');
  }
}

/* ==========================================================================
   DAFTAR DATA (LIST) + MODE PILIH BANYAK (BAGIKAN SEKALIGUS)
   ========================================================================== */
let listObjectUrls = [];
let batchMode = false;
let selectedIds = new Set();
let viewingTrash = false;
let trashSelectMode = false;

function toggleBatchMode(){
  batchMode = !batchMode;
  selectedIds.clear();
  trashSelectMode = false;
  document.getElementById('btnBatchMode').textContent = batchMode ? '✕ Batal Pilih' : '☑️ Pilih Banyak';
  document.getElementById('btnBatchShare').textContent = '📤 Bagikan Terpilih';
  document.getElementById('batchBar').style.display = batchMode ? 'flex' : 'none';
  document.getElementById('entryList').style.paddingBottom = batchMode ? '80px' : '0';
  updateBatchBar();
  renderList();
}

function toggleTrashView(){
  viewingTrash = !viewingTrash;
  trashSelectMode = false;
  selectedIds.clear();
  document.getElementById('btnViewTrash').textContent = viewingTrash ? '⬅ Kembali ke Daftar' : '🗑️ Sampah';
  document.getElementById('btnBatchMode').style.display = viewingTrash ? 'none' : 'inline-block';
  document.getElementById('btnTrashSelect').style.display = viewingTrash ? 'inline-block' : 'none';
  document.getElementById('btnTrashSelect').textContent = '☑️ Tandai Data';
  document.getElementById('btnEmptyTrash').style.display = viewingTrash ? 'inline-block' : 'none';
  document.getElementById('btnRestoreCloud').style.display = viewingTrash ? 'none' : 'inline-block';
  const btnClean = document.getElementById('btnCleanDupes');
  if(btnClean) btnClean.style.display = viewingTrash ? 'none' : 'inline-block';
  const btnForceSyncEl = document.getElementById('btnForceSync');
  if(btnForceSyncEl) btnForceSyncEl.style.display = viewingTrash ? 'none' : 'inline-block';
  document.getElementById('btnExportExcel').style.display = viewingTrash ? 'none' : 'inline-block';
  document.getElementById('btnExportZip').style.display = viewingTrash ? 'none' : 'inline-block';
  renderList();
}

function updateBatchBar(){
  document.getElementById('batchCount').textContent = `${selectedIds.size} dipilih`;
}

function toggleTrashSelectMode(){
  trashSelectMode = !trashSelectMode;
  selectedIds.clear();
  document.getElementById('btnTrashSelect').textContent = trashSelectMode ? '✕ Batal Tandai' : '☑️ Tandai Data';
  document.getElementById('batchBar').style.display = trashSelectMode ? 'flex' : 'none';
  document.getElementById('btnBatchShare').style.display = trashSelectMode ? 'inline-block' : '';
  document.getElementById('btnBatchShare').textContent = '❌ Hapus Permanen Terpilih';
  updateBatchBar();
  renderList();
}

async function renderList(){
  listObjectUrls.forEach(u => URL.revokeObjectURL(u));
  listObjectUrls = [];

  const container = document.getElementById('entryList');
  const entries = viewingTrash
    ? await getTrashByCategory(currentCategory)
    : await getEntriesByCategory(currentCategory);

  if(entries.length === 0){
    container.innerHTML = viewingTrash
      ? `<div class="empty-state"><div class="ic">🗑️</div><p>Sampah kosong untuk kategori ini.</p></div>`
      : `<div class="empty-state"><div class="ic">📭</div><p>Belum ada foto tersimpan untuk kategori ini.<br>Silakan ambil atau impor foto pada tab "Ambil/Impor".</p></div>`;
    return;
  }

  container.innerHTML = '';
  entries.forEach(en => {
    const thumbUrl = URL.createObjectURL(en.thumbBlob);
    listObjectUrls.push(thumbUrl);
    const addr = en.addressManual || en.addressAuto || '(alamat belum diisi)';
    const isSelected = selectedIds.has(en.id);
    const card = document.createElement('div');
    card.className = 'entry-card' + (isSelected ? ' selected' : '');

    let actionsHtml;
    if(viewingTrash){
      const sisaHari = en.deletedAt ? Math.max(0, 30 - Math.floor((Date.now()-en.deletedAt)/86400000)) : 30;
      actionsHtml = `
        <div class="entry-pending">🗑️ Terhapus ${fmtDate(en.deletedAt)} &middot; sisa ${sisaHari} hari sebelum hilang permanen</div>
        <div class="entry-actions">
          <button class="mini-act" data-act="restore" data-id="${en.id}">↩️ Pulihkan</button>
          <button class="mini-act danger" data-act="purge" data-id="${en.id}">❌ Hapus Permanen</button>
        </div>`;
    } else {
      actionsHtml = `
        ${en.shareCount > 1 ? `<div class="entry-share-warn">⚠️ Sudah dikirim ${en.shareCount}x ke WA — cek jangan dobel</div>` : (en.shareCount === 1 ? `<div class="entry-share-ok">✅ Sudah dikirim ke WA</div>` : '')}
        ${en.geocodePending ? `<div class="entry-pending">⏳ Alamat otomatis menunggu koneksi internet</div>` : ''}
        ${en.cloudSynced === false ? `<div class="entry-pending">☁️ Menunggu disinkron ke Peta Pantau</div>` : ''}
        ${en.note ? `<div class="entry-note">"${escapeHtml(en.note)}"</div>` : ''}
        ${!batchMode ? `
        <div class="entry-actions">
          <button class="mini-act" data-act="share" data-id="${en.id}">📤 Bagikan</button>
          <button class="mini-act" data-act="share-raw" data-id="${en.id}">🚫 Tanpa Stempel</button>
          <button class="mini-act" data-act="edit" data-id="${en.id}">✏️ Edit</button>
          <button class="mini-act" data-act="maps" data-id="${en.id}">🗺️ Google Maps</button>
          <button class="mini-act danger" data-act="delete" data-id="${en.id}">🗑️ Hapus</button>
        </div>` : ''}`;
    }

    card.innerHTML = `
      ${((batchMode && !viewingTrash) || (trashSelectMode && viewingTrash)) ? `<input type="checkbox" class="entry-checkbox" data-id="${en.id}" ${isSelected ? 'checked' : ''}>` : ''}
      ${en.mediaType === 'video'
        ? `<div class="entry-thumb" data-id="${en.id}" style="display:flex;align-items:center;justify-content:center;font-size:1.8rem;background:#0f2647;color:#e0b354">🎥</div>`
        : `<img class="entry-thumb" src="${thumbUrl}" data-id="${en.id}" alt="Foto objek">`}
      <div class="entry-body">
        ${en.businessName ? `<div class="entry-business">${escapeHtml(en.businessName)}</div>` : ''}
        <div class="entry-addr">${escapeHtml(addr)}</div>
        <div class="entry-meta">📍 ${en.lat.toFixed(5)}, ${en.lng.toFixed(5)} &middot; ${fmtDate(en.timestamp)}</div>
        ${actionsHtml}
      </div>
    `;
    container.appendChild(card);
  });

  if(viewingTrash){
    container.querySelectorAll('[data-act="restore"]').forEach(btn => {
      btn.addEventListener('click', () => restoreFromTrash(parseInt(btn.dataset.id, 10)));
    });
    container.querySelectorAll('[data-act="purge"]').forEach(btn => {
      btn.addEventListener('click', () => permanentlyDeleteEntry(parseInt(btn.dataset.id, 10)));
    });
    if(trashSelectMode){
      const toggleSelect = (id) => {
        if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
        updateBatchBar();
        renderList();
      };
      container.querySelectorAll('.entry-checkbox').forEach(cb => {
        cb.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(parseInt(cb.dataset.id, 10)); });
      });
      container.querySelectorAll('.entry-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if(e.target.closest('.entry-checkbox') || e.target.closest('[data-act]')) return;
          toggleSelect(parseInt(card.querySelector('.entry-checkbox').dataset.id, 10));
        });
      });
    }
    return;
  }

  if(batchMode){
    const toggleSelect = (id) => {
      if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
      updateBatchBar();
      renderList();
    };
    container.querySelectorAll('.entry-checkbox').forEach(cb => {
      cb.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(parseInt(cb.dataset.id, 10)); });
    });
    container.querySelectorAll('.entry-thumb').forEach(img => {
      img.addEventListener('click', () => toggleSelect(parseInt(img.dataset.id, 10)));
    });
    container.querySelectorAll('.entry-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if(e.target.closest('.entry-thumb') || e.target.closest('.entry-checkbox')) return;
        const id = parseInt(card.querySelector('.entry-checkbox').dataset.id, 10);
        toggleSelect(id);
      });
    });
    return;
  }

  container.querySelectorAll('.entry-thumb').forEach(img => {
    img.addEventListener('click', () => openPhotoOverlay(parseInt(img.dataset.id, 10)));
  });
  container.querySelectorAll('[data-act="share"]').forEach(btn => {
    btn.addEventListener('click', () => shareEntry(parseInt(btn.dataset.id, 10), true));
  });
  container.querySelectorAll('[data-act="share-raw"]').forEach(btn => {
    btn.addEventListener('click', () => shareEntry(parseInt(btn.dataset.id, 10), false));
  });
  container.querySelectorAll('[data-act="edit"]').forEach(btn => {
    btn.addEventListener('click', () => openEditOverlay(parseInt(btn.dataset.id, 10)));
  });
  container.querySelectorAll('[data-act="delete"]').forEach(btn => {
    btn.addEventListener('click', () => onDeleteEntry(parseInt(btn.dataset.id, 10)));
  });
  container.querySelectorAll('[data-act="maps"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const en = await getEntry(parseInt(btn.dataset.id, 10));
      window.open(`https://www.google.com/maps?q=${en.lat},${en.lng}`, '_blank');
    });
  });
}

async function onDeleteEntry(id){
  if(!confirm('Pindahkan foto ini ke Sampah? Masih bisa dipulihkan kapan saja selama 30 hari lewat menu "Sampah".')) return;
  const entry = await getEntry(id);
  await updateEntry(id, { deleted:true, deletedAt: Date.now(), cloudSynced:false });
  if(entry) await deleteEntryFromCloud(getStableCloudDocId(entry));
  showToast('Foto dipindahkan ke Sampah.');
  renderList();
  refreshMenuBadge(currentCategory);
}

async function restoreFromTrash(id){
  const entry = await getEntry(id);
  await updateEntry(id, { deleted:false, deletedAt:null });
  if(entry && firebaseReady && navigator.onLine){
    const fresh = await getEntry(id);
    const cloudId = getStableCloudDocId(fresh);
    const synced = await syncEntryToCloud(cloudId, fresh);
    await updateEntry(id, { cloudSynced:synced, cloudDocId:cloudId });
  }
  showToast('Foto dipulihkan dari Sampah.');
  renderList();
  refreshMenuBadge(currentCategory);
}

async function permanentlyDeleteEntry(id){
  if(!confirm('Hapus PERMANEN foto ini? Tindakan ini tidak bisa dibatalkan lagi (tidak bisa dipulihkan).')) return;
  const entry = await getEntry(id);
  await deleteEntry(id);
  // Penting: hapus dari cloud pakai cloudDocId (bukan id lokal), karena untuk data
  // hasil "Pulihkan dari Cloud", id lokal berbeda dengan id dokumen di Firestore.
  const cloudId = entry ? getStableCloudDocId(entry) : makeCloudDocId(id);
  await deleteEntryFromCloud(cloudId);
  showToast('Foto dihapus permanen.');
  renderList();
  refreshMenuBadge(currentCategory);
}

async function permanentlyDeleteSelectedTrash(){
  if(selectedIds.size === 0){ showToast('Tandai minimal 1 data di Sampah.'); return; }
  if(!confirm(`Hapus permanen ${selectedIds.size} data yang ditandai? Tindakan ini tidak bisa dibatalkan.`)) return;
  const ids = Array.from(selectedIds);
  for(const id of ids){
    const entry = await getEntry(id);
    if(entry) await deleteEntry(id);
    if(entry) await deleteEntryFromCloud(getStableCloudDocId(entry));
  }
  selectedIds.clear();
  showToast(`${ids.length} data dihapus permanen.`);
  renderList();
  refreshMenuBadge(currentCategory);
}

async function permanentlyDeleteAllTrash(){
  const entries = await getTrashByCategory(currentCategory);
  if(entries.length === 0){ showToast('Sampah sudah kosong.'); return; }
  if(!confirm(`Hapus permanen SEMUA ${entries.length} data di Sampah kategori ini? Tindakan ini tidak bisa dibatalkan.`)) return;
  for(const entry of entries){
    await deleteEntry(entry.id);
    await deleteEntryFromCloud(getStableCloudDocId(entry));
  }
  selectedIds.clear();
  showToast(`${entries.length} data di Sampah dihapus permanen.`);
  renderList();
  refreshMenuBadge(currentCategory);
}

/* ---- Photo viewer ---- */
let photoOverlayUrl = null;
async function openPhotoOverlay(id){
  const en = await getEntry(id);
  if(photoOverlayUrl) URL.revokeObjectURL(photoOverlayUrl);
  const isVideo = en.mediaType === 'video';
  const img = document.getElementById('photoOverlayImg');
  const video = document.getElementById('photoOverlayVideo');
  photoOverlayUrl = URL.createObjectURL(isVideo ? en.videoBlob : en.photoBlob);
  img.style.display = isVideo ? 'none' : 'block'; video.style.display = isVideo ? 'block' : 'none';
  if(isVideo) video.src = photoOverlayUrl; else img.src = photoOverlayUrl;
  document.getElementById('photoOverlay').classList.add('show');
  bfPush('photoOverlay');
}
function closePhotoOverlay(){
  bfClose('photoOverlay');
}
function _viewClosePhotoOverlay(){
  document.getElementById('photoOverlay').classList.remove('show');
  const video = document.getElementById('photoOverlayVideo'); if(video){ video.pause(); video.removeAttribute('src'); video.load(); }
}

/* ---- Edit entry ---- */
async function openEditOverlay(id){
  const en = await getEntry(id);
  editingId = id;
  document.getElementById('editBusinessName').value = en.businessName || '';
  document.getElementById('editAddrAuto').value = en.addressAuto || '';
  document.getElementById('editAddrManual').value = en.addressManual || en.addressAuto || '';
  document.getElementById('editNote').value = en.note || '';
  initEditMap(en.lat, en.lng, en.businessName);
  document.getElementById('editOverlay').classList.add('show');
  bfPush('editOverlay');
}
function closeEditOverlay(){
  bfClose('editOverlay');
}
function _viewCloseEditOverlay(){
  document.getElementById('editOverlay').classList.remove('show');
  if(editMap){ editMap.remove(); editMap = null; }
  editingId = null;
}
async function saveEditOverlay(){
  if(editingId == null) return;
  const p = editMarker.getLatLng();
  await updateEntry(editingId, {
    lat: p.lat, lng: p.lng,
    businessName: document.getElementById('editBusinessName').value.trim(),
    addressManual: document.getElementById('editAddrManual').value.trim(),
    note: document.getElementById('editNote').value.trim()
  });
  const fresh = await getEntry(editingId);
  // Pakai cloudDocId yang SUDAH ADA kalau ini data hasil pulihan dari cloud —
  // supaya update menimpa dokumen yang sama, bukan bikin dokumen baru di cloud.
  const docId = getStableCloudDocId(fresh);
  const synced = await syncEntryToCloud(docId, fresh);
  const changes = { cloudSynced: synced };
  if(synced) changes.cloudDocId = docId;
  await updateEntry(editingId, changes);
  showToast('Perubahan disimpan.');
  closeEditOverlay();
  renderList();
}

/* ==========================================================================
   EKSPOR EXCEL & ZIP
   ========================================================================== */
function exportPhotoFileName(en, index){
  const dt = new Date(en.timestamp);
  const stamp = dt.toISOString().replace(/[:.]/g,'-');
  const ext = en.mediaType === 'video' ? ((en.mimeType || '').includes('mp4') ? 'mp4' : 'webm') : 'jpg';
  return `${String(index + 1).padStart(3,'0')}_${currentCategory}_${stamp}.${ext}`;
}

function buildExportWorkbook(entries, photoFolder){
  const headers = [
    'No','Kategori','Nama Usaha / Objek Pajak','Tanggal & Jam','Latitude','Longitude',
    'Koordinat','Sumber Koordinat','Alamat Otomatis','Alamat Final','Catatan Lapangan',
    'Nama File Foto','Buka Foto','Buka Peta'
  ];
  const rows = [headers];
  entries.forEach((en, i) => {
    const lat = Number(en.lat);
    const lng = Number(en.lng);
    const coord = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    const photoName = exportPhotoFileName(en, i);
    rows.push([
      i + 1, catLabel(en.category), en.businessName || '', fmtDate(en.timestamp), lat, lng,
      coord, en.coordSource || '', en.addressAuto || '', en.addressManual || en.addressAuto || '',
      en.note || '', photoName, 'Buka Foto', 'Buka Peta'
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    {wch:4},{wch:20},{wch:26},{wch:20},{wch:13},{wch:13},{wch:23},{wch:24},
    {wch:40},{wch:40},{wch:32},{wch:34},{wch:14},{wch:14}
  ];
  for(let r = 2; r <= rows.length; r++){
    const entry = entries[r - 2];
    const photoName = exportPhotoFileName(entry, r - 2);
    const lat = Number(entry.lat), lng = Number(entry.lng);
    const photoTarget = `./${photoFolder}/${photoName}`;
    const mapTarget = `https://www.google.com/maps?q=${encodeURIComponent(`${lat},${lng}`)}`;
    // Gunakan rumus HYPERLINK, bukan hanya metadata hyperlink. SheetJS
    // Community dan Microsoft Excel sama-sama membaca rumus ini secara
    // konsisten, termasuk tautan file lokal di dalam folder ZIP.
    ws[`M${r}`] = {
      t: 'str',
      f: `HYPERLINK("${photoTarget}","Buka Foto")`,
      v: 'Buka Foto'
    };
    ws[`N${r}`] = {
      t: 'str',
      f: `HYPERLINK("${mapTarget}","Buka Peta")`,
      v: 'Buka Peta'
    };
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Foto Lapangan');
  const info = XLSX.utils.aoa_to_sheet([
    ['Petunjuk Ekspor Geo Foto Lapangan'],
    ['Koordinat', 'Latitude dan longitude otomatis dari setiap data.'],
    ['Buka Peta', 'Klik tautan untuk membuka lokasi di Google Maps.'],
    ['Buka Foto', 'Tautan foto bekerja jika file Excel berada bersama folder foto hasil ekspor ZIP. Foto sudah diberi stempel koordinat.']
  ]);
  info['!cols'] = [{wch:18},{wch:95}];
  XLSX.utils.book_append_sheet(wb, info, 'Petunjuk');
  return wb;
}

async function exportExcel(){
  const entries = (await getEntriesByCategory(currentCategory)).sort((a,b) => a.timestamp - b.timestamp);
  if(entries.length === 0){ showToast('Belum ada data untuk diekspor.'); return; }
  const wb = buildExportWorkbook(entries, 'foto');
  const catSlug = currentCategory;
  const dateSlug = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `GeoFoto_${catSlug}_${dateSlug}.xlsx`);
  showToast('Excel berhasil diunduh. Tautan peta aktif; tautan foto tersedia dalam paket ZIP.');
}

async function exportZip(){
  const entries = (await getEntriesByCategory(currentCategory)).sort((a,b) => a.timestamp - b.timestamp);
  if(entries.length === 0){ showToast('Belum ada data untuk diekspor.'); return; }
  showToast('Menyiapkan paket ZIP lengkap, mohon tunggu...');

  const zip = new JSZip();
  const root = zip.folder(currentCategory);
  const photoFolderName = 'foto';
  const photoFolder = root.folder(photoFolderName);
  for(let i = 0; i < entries.length; i++){
    const en = entries[i];
    let exportBlob = en.mediaType === 'video' ? (en.videoBlob || en.thumbBlob) : (en.stampedPhotoBlob || en.photoBlob || en.thumbBlob);
    try{
      if(en.mediaType !== 'video' && !en.stampedPhotoBlob && en.lat != null && en.lng != null && exportBlob){
        exportBlob = await generateStampedPhoto({ ...en, photoBlob: exportBlob });
      }
    }catch(err){
      console.warn('Gagal memberi stempel koordinat saat ekspor:', err);
    }
    photoFolder.file(exportPhotoFileName(en, i), exportBlob);
  }

  const wb = buildExportWorkbook(entries, photoFolderName);
  const workbookBytes = XLSX.write(wb, { bookType:'xlsx', type:'array' });
  root.file(`GeoFoto_${currentCategory}.xlsx`, workbookBytes);
  root.file('README.txt',
    'Buka file Excel untuk melihat koordinat, membuka Google Maps, dan membuka foto.\n' +
    'Jangan memindahkan file Excel tanpa folder foto agar tautan foto tetap bekerja.\n' +
    'Foto dalam folder foto sudah diproses dengan stempel koordinat.\n'
  );

  const content = await zip.generateAsync({ type:'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GeoFoto_${currentCategory}_${new Date().toISOString().slice(0,10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('ZIP lengkap berhasil diunduh: Excel + foto + koordinat + tautan peta.');
}

/* ==========================================================================
   NAVIGASI MENU / TAB
   ========================================================================== */
function renderMenu(){
  const grid = document.getElementById('menuGrid');
  grid.innerHTML = '';
  CATEGORIES.forEach(cat => {
    const card = document.createElement('div');
    card.className = 'menu-card';
    card.innerHTML = `
      <span class="count-badge" id="badge-${cat.id}" style="display:none;">0</span>
      <div class="ic">${cat.icon}</div>
      <div class="lbl">${cat.label}</div>
      <div class="sub">${cat.sub}</div>
    `;
    card.addEventListener('click', () => goToCategory(cat.id));
    grid.appendChild(card);
  });

  const pantauCard = document.createElement('div');
  pantauCard.className = 'menu-card menu-card-pantau';
  pantauCard.innerHTML = `
    <div class="ic">🛰️</div>
    <div class="lbl">Peta Pantau</div>
    <div class="sub"><span class="live-dot"></span>Lihat semua titik (publik, real-time)</div>
  `;
  pantauCard.addEventListener('click', () => { window.location.href = 'peta-pantau.html'; });
  grid.appendChild(pantauCard);

  CATEGORIES.forEach(cat => refreshMenuBadge(cat.id));
}

async function refreshMenuBadge(catId){
  const entries = await getEntriesByCategory(catId);
  const badge = document.getElementById(`badge-${catId}`);
  if(!badge) return;
  if(entries.length > 0){
    badge.style.display = 'flex';
    badge.textContent = entries.length;
  } else {
    badge.style.display = 'none';
  }
}

function goToCategory(catId){
  currentCategory = catId;
  document.getElementById('catTitle').textContent = catLabel(catId);
  document.getElementById('viewMenu').style.display = 'none';
  document.getElementById('viewCategory').style.display = 'block';
  document.getElementById('lastSavedBar').style.display = 'none';
  lastSavedEntryId = null;
  batchMode = false;
  selectedIds.clear();
  viewingTrash = false;
  trashSelectMode = false;
  document.getElementById('batchBar').style.display = 'none';
  document.getElementById('btnBatchMode').textContent = '☑️ Pilih Banyak';
  document.getElementById('btnViewTrash').textContent = '🗑️ Sampah';
  document.getElementById('btnTrashSelect').style.display = 'none';
  document.getElementById('btnEmptyTrash').style.display = 'none';
  document.getElementById('btnBatchMode').style.display = 'inline-block';
  document.getElementById('btnRestoreCloud').style.display = 'inline-block';
  { const b = document.getElementById('btnCleanDupes'); if(b) b.style.display = 'inline-block'; }
  const btnForceSyncEl2 = document.getElementById('btnForceSync');
  if(btnForceSyncEl2) btnForceSyncEl2.style.display = 'inline-block';
  document.getElementById('btnExportExcel').style.display = 'inline-block';
  document.getElementById('btnExportZip').style.display = 'inline-block';
  onCancelQueue();
  switchTab('capture');
  window.scrollTo({ top:0, behavior:'smooth' });
  startCategoryCloudSync(catId);
  bfPush('category');
}

// Dipanggil dari tombol "⬅ Menu" di UI. Diarahkan lewat riwayat browser
// supaya tombol back Android tetap sinkron (lihat blok TOMBOL BACK ANDROID).
function goToMenu(){
  bfClose('category');
}
function _viewGoToMenu(){
  onCancelQueue();
  document.getElementById('viewCategory').style.display = 'none';
  document.getElementById('viewMenu').style.display = 'block';
  currentCategory = null;
  if(overviewMap){ overviewMap.remove(); overviewMap = null; }
  stopCategoryCloudSync();
  renderMenu();
}

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  if(currentCategory && navigator.onLine){
    retryPendingCloudSync();
    if(tab === 'list') startCategoryCloudSync(currentCategory);
  }
  document.getElementById('tabCapture').classList.toggle('active', tab === 'capture');
  document.getElementById('tabList').classList.toggle('active', tab === 'list');
  document.getElementById('tabMap').classList.toggle('active', tab === 'map');
  if(tab === 'list') renderList();
  if(tab === 'map') renderOverviewMap();
}

/* ==========================================================================
   TOMBOL BACK ANDROID
   Supaya tombol back HP tidak langsung menutup aplikasi begitu saja:
   - Kalau ada overlay/modal terbuka (foto, edit, kamera live) -> tutup itu dulu.
   - Kalau sedang di dalam kategori -> kembali ke Menu dulu.
   - Kalau sudah di Menu utama -> back pertama munculkan pesan konfirmasi,
     back kedua (dalam 2 detik) baru benar-benar keluar aplikasi.
   ========================================================================== */
let activeBfLayer = null; // 'category' | 'liveRecordModal' | 'editOverlay' | 'photoOverlay' | null

function bfPush(layerName){
  activeBfLayer = layerName;
  history.pushState({ bfLayer: layerName }, '');
}

// Dipanggil dari tombol tutup/X di UI (bukan dari tombol back HP) supaya
// riwayat browser tetap sinkron dengan apa yang sedang tampil di layar.
function bfClose(layerName){
  if(activeBfLayer === layerName){
    history.back(); // akan memicu 'popstate' di bawah -> _closeBfLayerView()
  } else {
    _closeBfLayerView(layerName); // fallback kalau riwayat sudah tidak sinkron
  }
}

function _closeBfLayerView(layerName){
  if(layerName === 'photoOverlay') _viewClosePhotoOverlay();
  else if(layerName === 'editOverlay') _viewCloseEditOverlay();
  else if(layerName === 'liveRecordModal') _viewCloseLiveRecordModal();
  else if(layerName === 'category') _viewGoToMenu();
}

let bfExitArm = false, bfExitTimer = null;

window.addEventListener('popstate', (e) => {
  const closingLayer = activeBfLayer;
  activeBfLayer = e.state ? e.state.bfLayer : null;
  if(closingLayer){
    _closeBfLayerView(closingLayer);
    return;
  }
  // Tidak ada lapisan yang ditutup -> ini di Menu utama, tombol back
  // berikutnya akan benar-benar keluar dari aplikasi kalau tidak ditahan.
  if(bfExitArm) return; // biarkan keluar
  bfExitArm = true;
  showToast('Tekan sekali lagi untuk keluar aplikasi');
  history.pushState({ bfLayer: null }, ''); // jaga supaya back berikutnya masih tertangkap
  clearTimeout(bfExitTimer);
  bfExitTimer = setTimeout(() => { bfExitArm = false; }, 2000);
});

/* ==========================================================================
   INIT & EVENT BINDING
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
 try{
  // Pasang "penjaga" riwayat browser di layar Menu, supaya tombol back
  // Android tetap bisa ditangkap (lihat blok TOMBOL BACK ANDROID) walau
  // belum pernah membuka kategori/overlay apa pun.
  history.replaceState({ bfLayer: null }, '');
  history.pushState({ bfLayer: null }, '');
  renderMenu();
  retryPendingGeocodes();
  retryPendingCloudSync();
  purgeOldTrash();

  document.getElementById('btnCamera').addEventListener('click', () => document.getElementById('inputCamera').click());
  document.getElementById('btnVideo').addEventListener('click', openLiveRecordModal);
  document.getElementById('btnCloseLiveRecord').addEventListener('click', closeLiveRecordModal);
  document.getElementById('btnStartLiveRecord').addEventListener('click', startLiveRecording);
  document.getElementById('btnStopLiveRecord').addEventListener('click', stopLiveRecording);
  document.querySelectorAll('.live-orient-toggle button[data-orient]').forEach(btn => {
    btn.addEventListener('click', () => setLiveOrientMode(btn.dataset.orient));
  });
  document.querySelectorAll('.stamp-mode-toggle button[data-stamp]').forEach(btn => {
    btn.addEventListener('click', () => setStampMode(btn.dataset.stamp));
  });
  document.querySelectorAll('.stamp-size-toggle button[data-stampsize]').forEach(btn => {
    btn.addEventListener('click', () => setStampScale(btn.dataset.stampsize));
  });
  setStampMode(stampMode);
  setStampScale(stampScale);
  setLiveOrientMode(liveOrientMode);
  // Saat HP diputar, bingkai pratinjau langsung disesuaikan (kalau sedang
  // mode Otomatis dan tidak sedang merekam).
  const onOrientChange = () => {
    if(liveOrientLocked) return;
    const v = document.getElementById('liveCameraPreview'), c = document.getElementById('liveStampCanvas');
    if(v && c && liveStream) syncLiveOutputCanvas(v, c);
  };
  window.addEventListener('orientationchange', onOrientChange);
  window.addEventListener('resize', onOrientChange);
  if(screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', onOrientChange);
  document.getElementById('btnImportVideo').addEventListener('click', () => document.getElementById('inputImportVideo').click());
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('inputImport').click());

  document.getElementById('inputCamera').addEventListener('change', (e) => {
    if(e.target.files.length) startQueue(e.target.files, 'camera');
    e.target.value = '';
  });
  document.getElementById('inputImport').addEventListener('change', (e) => {
    if(e.target.files.length) startQueue(e.target.files, 'import');
    e.target.value = '';
  });
  document.getElementById('inputVideo').addEventListener('change', (e) => { if(e.target.files.length) startQueue(e.target.files, 'camera'); e.target.value=''; });
  document.getElementById('inputImportVideo').addEventListener('change', (e) => { if(e.target.files.length) startQueue(e.target.files, 'import'); e.target.value=''; });

  document.getElementById('btnLocateNow').addEventListener('click', onLocateNowClick);
  document.getElementById('btnCleanDupes').addEventListener('click', cleanupDuplicates);
  document.getElementById('btnSaveQ').addEventListener('click', onSaveDraft);
  document.getElementById('btnSaveAllQ').addEventListener('click', onSaveAllDrafts);
  document.getElementById('btnSkipQ').addEventListener('click', onSkipDraft);
  document.getElementById('btnCancelQ').addEventListener('click', onCancelQueue);

  document.getElementById('latInput').addEventListener('input', onLatInputPasted);
  document.getElementById('btnApplyCoord').addEventListener('click', onApplyManualCoord);
  ['latInput','lngInput'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); onApplyManualCoord(); }
    });
  });

  document.getElementById('editLatInput').addEventListener('input', onEditLatInputPasted);
  document.getElementById('btnApplyEditCoord').addEventListener('click', onApplyEditCoord);
  ['editLatInput','editLngInput'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){ e.preventDefault(); onApplyEditCoord(); }
    });
  });

  document.getElementById('btnExportExcel').addEventListener('click', exportExcel);
  document.getElementById('btnExportZip').addEventListener('click', exportZip);
  document.getElementById('btnRestoreCloud').addEventListener('click', restoreFromCloud);
  const btnForceSync = document.getElementById('btnForceSync');
  if(btnForceSync) btnForceSync.addEventListener('click', forceResyncAll);
  document.getElementById('btnBatchMode').addEventListener('click', toggleBatchMode);
  document.getElementById('btnBatchCancel').addEventListener('click', () => {
    if(trashSelectMode) toggleTrashSelectMode(); else toggleBatchMode();
  });
  document.getElementById('btnTrashSelect').addEventListener('click', toggleTrashSelectMode);
  document.getElementById('btnEmptyTrash').addEventListener('click', permanentlyDeleteAllTrash);
  document.getElementById('btnBatchShare').addEventListener('click', () => {
    if(trashSelectMode) permanentlyDeleteSelectedTrash(); else onBatchShare();
  });
  document.getElementById('btnViewTrash').addEventListener('click', toggleTrashView);
  document.getElementById('btnShareLastSaved').addEventListener('click', () => {
    if(lastSavedEntryId != null) shareEntry(lastSavedEntryId);
  });

  document.getElementById('businessNameInput').addEventListener('input', (e) => {
    if(reviewMarker) reviewMarker.setIcon(pinDivIcon('#c8952c', e.target.value));
  });
  document.getElementById('editBusinessName').addEventListener('input', (e) => {
    if(editMarker) editMarker.setIcon(pinDivIcon('#c8952c', e.target.value));
  });

  document.getElementById('photoOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'photoOverlay') closePhotoOverlay();
  });
  document.getElementById('editOverlay').addEventListener('click', (e) => {
    if(e.target.id === 'editOverlay') closeEditOverlay();
  });
 }catch(err){
  console.error('Gagal inisialisasi aplikasi:', err);
  if(typeof showFatalError === 'function') showFatalError(err.message || String(err));
 }
});

/* Coba lagi otomatis begitu HP kembali online, plus cek berkala tiap 45 detik
   selama aplikasi terbuka (jaga-jaga di browser yang event 'online'-nya kurang responsif). */
window.addEventListener('online', retryPendingGeocodes);
setInterval(retryPendingGeocodes, 45000);
window.addEventListener('online', retryPendingCloudSync);
setInterval(retryPendingCloudSync, 45000);

/* ============ SERVICE WORKER ============ */
/* Auto-update paksa: begitu ada versi baru terpasang, langsung muat ulang
   halaman satu kali secara otomatis. Tanpa ini, HP yang cuma "dibuka
   lagi dari recent apps" (bukan ditutup total) bisa tetap menjalankan
   JavaScript LAMA yang masih ada di memori walau file di server sudah
   baru dan service worker baru sudah aktif — inilah yang selama ini
   bikin perbaikan terasa "tidak kepakai" di HP. */
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW gagal:', err));
  });
  let swReloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(swReloaded) return;
    swReloaded = true;
    window.location.reload();
  });
}

/* ============ INSTAL KE HP / KOMPUTER (PWA) ============ */
let deferredInstallPrompt = null;
function isIOSDevice(){
  return /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase()) && !window.MSStream;
}
function isRunningStandalone(){
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function showInstallUI(){
  if(isRunningStandalone()) return;
  document.getElementById('installBanner').classList.add('show');
}
function hideInstallUI(){
  document.getElementById('installBanner').classList.remove('show');
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showInstallUI();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  hideInstallUI();
});
async function handleInstallClick(){
  if(deferredInstallPrompt){
    hideInstallUI();
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    return;
  }
  if(isIOSDevice()){
    alert(
      "Cara instal di iPhone/iPad (Safari):\n\n" +
      "1. Tap ikon Share (kotak dengan panah ke atas)\n" +
      "2. Pilih 'Add to Home Screen' / 'Tambah ke Layar Utama'\n" +
      "3. Tap 'Add' / 'Tambah'\n\n" +
      "Catatan: harus dibuka lewat Safari, bukan Chrome."
    );
    return;
  }
  alert("Buka menu browser (⋮ atau ikon Share) lalu pilih 'Instal aplikasi' atau 'Tambahkan ke layar utama'.");
}
window.addEventListener('DOMContentLoaded', () => {
  if(isIOSDevice() && !isRunningStandalone()) showInstallUI();
});
