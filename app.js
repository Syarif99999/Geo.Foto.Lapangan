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
  { id:'pbb_bphtb', label:'PBB & BPHTB', icon:'🏠', sub:'PBB & BPHTB' }
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
    req.onsuccess = () => resolve(req.result.sort((a,b) => b.timestamp - a.timestamp));
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

function startQueue(fileList, source){
  queue = Array.from(fileList).map(f => ({ file:f, source }));
  qIndex = 0;
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
  document.getElementById('reviewProgress').textContent = `Foto ${qIndex+1} dari ${queue.length} — ${item.source === 'camera' ? 'Kamera Langsung' : 'Impor Galeri/WA'}`;
  setReviewLoading(true, 'Membaca metadata & memproses foto...');

  const previewUrl = URL.createObjectURL(item.file);
  document.getElementById('reviewPhoto').src = previewUrl;

  let exif = null;
  try{
    const buf = await item.file.arrayBuffer();
    exif = parseExifGPS(buf);
  }catch(e){ exif = null; }

  const orientation = (exif && exif.orientation) || 1;
  const [photoBlob, thumbBlob] = await Promise.all([
    compressImage(item.file, orientation, 1600, 0.75),
    compressImage(item.file, orientation, 260, 0.6)
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
    file: item.file, source: item.source,
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

async function onSaveDraft(){
  if(!currentDraft || currentDraft.lat == null || currentDraft.lng == null){
    showToast('Tandai lokasi terlebih dahulu di peta.');
    return;
  }
  const addrManual = document.getElementById('addrManual').value.trim();
  const note = document.getElementById('noteInput').value.trim();
  const businessName = document.getElementById('businessNameInput').value.trim();
  const entry = {
    category: currentCategory,
    businessName: businessName,
    lat: currentDraft.lat, lng: currentDraft.lng,
    coordSource: currentDraft.coordSource || 'Manual',
    addressAuto: currentDraft.addressAuto || '',
    addressManual: addrManual || currentDraft.addressAuto || '',
    note: note,
    timestamp: Date.now(),
    photoBlob: currentDraft.photoBlob,
    thumbBlob: currentDraft.thumbBlob,
    fileName: (currentDraft.file && currentDraft.file.name) || `foto_${Date.now()}.jpg`,
    // Kalau alamat otomatis belum berhasil didapat (mis. sedang offline),
    // tandai entri ini supaya dicoba ulang otomatis begitu koneksi kembali ada.
    geocodePending: !currentDraft.addressAuto
  };
  const localId = await addEntry(entry);
  showToast('Foto tersimpan ✅');
  lastSavedEntryId = localId;
  document.getElementById('lastSavedBar').style.display = 'flex';
  const synced = await syncEntryToCloud(localId, entry);
  const changes = { cloudSynced: synced };
  if(synced) changes.cloudDocId = String(localId);
  await updateEntry(localId, changes);
  qIndex++;
  processQueueItem();
  refreshMenuBadge(currentCategory);
}

function onSkipDraft(){
  qIndex++;
  processQueueItem();
}

function onCancelQueue(){
  queue = []; qIndex = 0; currentDraft = null;
  document.getElementById('reviewPanel').style.display = 'none';
  if(reviewMap){ reviewMap.remove(); reviewMap = null; }
}

function endQueue(){
  document.getElementById('reviewPanel').style.display = 'none';
  if(reviewMap){ reviewMap.remove(); reviewMap = null; }
  showToast('Selesai memproses semua foto.');
  queue = []; qIndex = 0; currentDraft = null;
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
// Mengembalikan true HANYA kalau benar-benar berhasil terkirim ke cloud.
// Kalau fitur cloud belum aktif (config belum diisi) atau gagal karena offline,
// selalu kembalikan false supaya entri ini otomatis dicoba lagi nanti
// begitu Firebase aktif / koneksi kembali ada.
async function syncEntryToCloud(localId, entry){
  if(!firebaseReady) return false;
  try{
    const thumbDataUrl = await blobToDataURL(entry.thumbBlob);
    await firestoreDB.collection(FIRESTORE_COLLECTION).doc(String(localId)).set({
      category: entry.category,
      businessName: entry.businessName || '',
      lat: entry.lat,
      lng: entry.lng,
      address: entry.addressManual || entry.addressAuto || '',
      note: entry.note || '',
      timestamp: entry.timestamp,
      thumbDataUrl: thumbDataUrl
    });
    return true;
  }catch(e){
    console.warn('Gagal sinkron ke cloud:', e);
    return false;
  }
}

async function deleteEntryFromCloud(localId){
  if(!firebaseReady) return;
  try{ await firestoreDB.collection(FIRESTORE_COLLECTION).doc(String(localId)).delete(); }
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
    const pending = all.filter(en => en.cloudSynced !== true);
    if(pending.length === 0) return;
    let ok = 0;
    for(const en of pending){
      if(!navigator.onLine) break;
      const success = await syncEntryToCloud(en.id, en);
      if(success){ await updateEntry(en.id, { cloudSynced:true, cloudDocId:String(en.id) }); ok++; }
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

    const localEntries = await getEntriesByCategory(currentCategory);
    const existingCloudIds = new Set(localEntries.map(e => e.cloudDocId).filter(Boolean));

    let restored = 0;
    for(const doc of snapshot.docs){
      if(existingCloudIds.has(doc.id)) continue; // sudah ada di HP ini
      const d = doc.data();
      let blob;
      try{ blob = dataURLToBlob(d.thumbDataUrl); }catch(e){ continue; }

      const entry = {
        category: d.category || currentCategory,
        businessName: d.businessName || '',
        lat: d.lat, lng: d.lng,
        coordSource: 'Dipulihkan dari cloud',
        addressAuto: d.address || '',
        addressManual: d.address || '',
        note: d.note || '',
        timestamp: d.timestamp || Date.now(),
        photoBlob: blob,
        thumbBlob: blob,
        fileName: `cloud_${doc.id}.jpg`,
        cloudSynced: true,
        cloudDocId: doc.id
      };
      await addEntry(entry);
      restored++;
    }

    if(restored > 0){
      showToast(`🔄 ${restored} data berhasil dipulihkan dari cloud.`);
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
  const coordLine = `Lat ${entry.lat.toFixed(6)}, Long ${entry.lng.toFixed(6)}`;
  const dateLine = formatStampDate(entry.timestamp);
  const regionTitle = businessName || deriveRegionTitle(address) || catText;

  const outerMargin = Math.round(W * 0.028);
  const innerPad = Math.round(W * 0.03);
  const mapBoxGap = Math.round(W * 0.028);
  const mapBoxSize = Math.round(W * 0.24);

  const fsTitle = Math.max(17, Math.round(W * 0.040));
  const fsSub   = Math.max(12, Math.round(W * 0.026));
  const fsCoord = Math.max(15, Math.round(W * 0.030));
  const fsSmall = Math.max(11, Math.round(W * 0.021));
  const fsTiny  = Math.max(9,  Math.round(W * 0.017));
  const lineSpacing = 1.32;

  const panelWidth = W - outerMargin*2;
  const textColWidth = panelWidth - innerPad*2 - mapBoxGap - mapBoxSize;

  ctx.font = `${fsSub}px sans-serif`;
  const addrLines = address ? wrapText(ctx, address, textColWidth).slice(0,2) : [];

  const textLines = [];
  textLines.push({ text: regionTitle, font:`bold ${fsTitle}px sans-serif`, size:fsTitle, color:'#ffffff' });
  if(businessName) textLines.push({ text: catText, font:`${fsSub}px sans-serif`, size:fsSub, color:'#cfd6e0' });
  addrLines.forEach(l => textLines.push({ text:l, font:`${fsSub}px sans-serif`, size:fsSub, color:'#d8dde5' }));
  textLines.push({ text: coordLine, font:`bold ${fsCoord}px monospace`, size:fsCoord, color:'#e0b354' });
  textLines.push({ text: dateLine, font:`${fsSmall}px sans-serif`, size:fsSmall, color:'#b8c0cc' });
  textLines.push({ text:'Dicatat: GeoFoto Lapangan · BAPENDA Paser', font:`${fsTiny}px sans-serif`, size:fsTiny, color:'#93a0b0' });

  let textBlockHeight = 0;
  textLines.forEach(l => textBlockHeight += l.size * lineSpacing);

  const panelHeight = Math.max(mapBoxSize, textBlockHeight) + innerPad*2;
  const panelX = outerMargin;
  const panelY = H - outerMargin - panelHeight;
  const panelRadius = Math.round(W * 0.018);

  // panel gelap
  roundRectPath(ctx, panelX, panelY, panelWidth, panelHeight, panelRadius);
  ctx.fillStyle = 'rgba(15,25,40,0.85)';
  ctx.fill();

  // kotak mini-map di kiri
  const mapBoxX = panelX + innerPad;
  const mapBoxY = panelY + (panelHeight - mapBoxSize)/2;
  ctx.save();
  roundRectPath(ctx, mapBoxX, mapBoxY, mapBoxSize, mapBoxSize, Math.round(W*0.014));
  ctx.clip();
  const mgrad = ctx.createLinearGradient(mapBoxX, mapBoxY, mapBoxX+mapBoxSize, mapBoxY+mapBoxSize);
  mgrad.addColorStop(0, '#7c8f6e');
  mgrad.addColorStop(0.5, '#8f9c78');
  mgrad.addColorStop(1, '#6b7d5c');
  ctx.fillStyle = mgrad;
  ctx.fillRect(mapBoxX, mapBoxY, mapBoxSize, mapBoxSize);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = Math.max(1, mapBoxSize*0.012);
  ctx.beginPath();
  ctx.moveTo(mapBoxX, mapBoxY + mapBoxSize*0.32);
  ctx.lineTo(mapBoxX + mapBoxSize, mapBoxY + mapBoxSize*0.58);
  ctx.moveTo(mapBoxX + mapBoxSize*0.22, mapBoxY);
  ctx.lineTo(mapBoxX + mapBoxSize*0.62, mapBoxY + mapBoxSize);
  ctx.stroke();

  // efek "spread" biru khas GPS di bawah pin
  const pinTipX = mapBoxX + mapBoxSize*0.5;
  const pinTipY = mapBoxY + mapBoxSize*0.60;
  ctx.beginPath();
  ctx.ellipse(pinTipX, pinTipY + mapBoxSize*0.05, mapBoxSize*0.3, mapBoxSize*0.15, 0, 0, Math.PI*2);
  ctx.fillStyle = 'rgba(70,130,255,0.4)';
  ctx.fill();
  ctx.restore();

  // pin merah bergaya Google Maps
  drawMapPin(ctx, pinTipX, pinTipY, mapBoxSize*0.55, '#ff3b30');

  // kolom teks di kanan
  const textX = mapBoxX + mapBoxSize + mapBoxGap;
  let textY = panelY + innerPad + Math.max(0, (panelHeight - innerPad*2 - textBlockHeight)/2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  textLines.forEach(l => {
    ctx.font = l.font;
    ctx.fillStyle = l.color;
    ctx.fillText(l.text, textX, textY);
    textY += l.size * lineSpacing;
  });

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
}

async function shareEntry(id){
  const entry = await getEntry(id);
  if(!entry){ showToast('Data tidak ditemukan.'); return; }
  showToast('Menyiapkan foto berkoordinat...');
  try{
    const stampedBlob = await generateStampedPhoto(entry);
    const safeName = (entry.businessName || catLabel(entry.category)).replace(/[^a-z0-9]+/gi, '_');
    const fileName = `GeoFoto_${safeName}_${new Date(entry.timestamp).toISOString().slice(0,10)}.jpg`;
    const file = new File([stampedBlob], fileName, { type:'image/jpeg' });

    if(navigator.canShare && navigator.canShare({ files:[file] })){
      await navigator.share({ files:[file] });
    } else {
      const url = URL.createObjectURL(stampedBlob);
      const a = document.createElement('a');
      a.href = url; a.download = fileName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('Foto berkoordinat sudah diunduh — lampirkan manual ke WhatsApp.');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return; // dibatalkan user, tidak perlu tampilkan error
    console.error('Gagal membagikan foto:', e);
    showToast('Gagal menyiapkan foto untuk dibagikan.');
  }
}

/* ==========================================================================
   DAFTAR DATA (LIST)
   ========================================================================== */
let listObjectUrls = [];
async function renderList(){
  listObjectUrls.forEach(u => URL.revokeObjectURL(u));
  listObjectUrls = [];

  const container = document.getElementById('entryList');
  const entries = await getEntriesByCategory(currentCategory);

  if(entries.length === 0){
    container.innerHTML = `<div class="empty-state"><div class="ic">📭</div><p>Belum ada foto tersimpan untuk kategori ini.<br>Silakan ambil atau impor foto pada tab "Ambil/Impor".</p></div>`;
    return;
  }

  container.innerHTML = '';
  entries.forEach(en => {
    const thumbUrl = URL.createObjectURL(en.thumbBlob);
    listObjectUrls.push(thumbUrl);
    const addr = en.addressManual || en.addressAuto || '(alamat belum diisi)';
    const card = document.createElement('div');
    card.className = 'entry-card';
    card.innerHTML = `
      <img class="entry-thumb" src="${thumbUrl}" data-id="${en.id}" alt="Foto">
      <div class="entry-body">
        ${en.businessName ? `<div class="entry-business">${escapeHtml(en.businessName)}</div>` : ''}
        <div class="entry-addr">${escapeHtml(addr)}</div>
        <div class="entry-meta">📍 ${en.lat.toFixed(5)}, ${en.lng.toFixed(5)} &middot; ${fmtDate(en.timestamp)}</div>
        ${en.geocodePending ? `<div class="entry-pending">⏳ Alamat otomatis menunggu koneksi internet</div>` : ''}
        ${en.cloudSynced === false ? `<div class="entry-pending">☁️ Menunggu disinkron ke Peta Pantau</div>` : ''}
        ${en.note ? `<div class="entry-note">"${escapeHtml(en.note)}"</div>` : ''}
        <div class="entry-actions">
          <button class="mini-act" data-act="share" data-id="${en.id}">📤 Bagikan</button>
          <button class="mini-act" data-act="edit" data-id="${en.id}">✏️ Edit</button>
          <button class="mini-act" data-act="maps" data-id="${en.id}">🗺️ Google Maps</button>
          <button class="mini-act danger" data-act="delete" data-id="${en.id}">🗑️ Hapus</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  container.querySelectorAll('.entry-thumb').forEach(img => {
    img.addEventListener('click', () => openPhotoOverlay(parseInt(img.dataset.id, 10)));
  });
  container.querySelectorAll('[data-act="share"]').forEach(btn => {
    btn.addEventListener('click', () => shareEntry(parseInt(btn.dataset.id, 10)));
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
  if(!confirm('Hapus foto ini beserta datanya? Tindakan tidak bisa dibatalkan.')) return;
  await deleteEntry(id);
  deleteEntryFromCloud(id);
  showToast('Data dihapus.');
  renderList();
  refreshMenuBadge(currentCategory);
}

/* ---- Photo viewer ---- */
let photoOverlayUrl = null;
async function openPhotoOverlay(id){
  const en = await getEntry(id);
  if(photoOverlayUrl) URL.revokeObjectURL(photoOverlayUrl);
  photoOverlayUrl = URL.createObjectURL(en.photoBlob);
  document.getElementById('photoOverlayImg').src = photoOverlayUrl;
  document.getElementById('photoOverlay').classList.add('show');
}
function closePhotoOverlay(){
  document.getElementById('photoOverlay').classList.remove('show');
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
}
function closeEditOverlay(){
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
  const synced = await syncEntryToCloud(editingId, fresh);
  const changes = { cloudSynced: synced };
  if(synced) changes.cloudDocId = String(editingId);
  await updateEntry(editingId, changes);
  showToast('Perubahan disimpan.');
  closeEditOverlay();
  renderList();
}

/* ==========================================================================
   EKSPOR EXCEL & ZIP
   ========================================================================== */
async function exportExcel(){
  const entries = await getEntriesByCategory(currentCategory);
  if(entries.length === 0){ showToast('Belum ada data untuk diekspor.'); return; }

  const rows = entries
    .sort((a,b) => a.timestamp - b.timestamp)
    .map((en, i) => ({
      'No': i+1,
      'Kategori': catLabel(en.category),
      'Nama Usaha / Objek Pajak': en.businessName || '',
      'Tanggal & Jam': fmtDate(en.timestamp),
      'Latitude': en.lat,
      'Longitude': en.lng,
      'Sumber Koordinat': en.coordSource || '',
      'Alamat Otomatis': en.addressAuto || '',
      'Alamat Final': en.addressManual || en.addressAuto || '',
      'Catatan Lapangan': en.note || '',
      'Nama File Foto': en.fileName || '',
      'Link Google Maps': { f: `HYPERLINK("https://www.google.com/maps?q=${en.lat},${en.lng}","Buka Peta")` }
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    {wch:4},{wch:20},{wch:26},{wch:18},{wch:12},{wch:12},{wch:24},
    {wch:40},{wch:40},{wch:32},{wch:22},{wch:14}
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Foto Lapangan');
  const catSlug = currentCategory;
  const dateSlug = new Date().toISOString().slice(0,10);
  XLSX.writeFile(wb, `GeoFoto_${catSlug}_${dateSlug}.xlsx`);
  showToast('Excel berhasil diunduh.');
}

async function exportZip(){
  const entries = await getEntriesByCategory(currentCategory);
  if(entries.length === 0){ showToast('Belum ada data untuk diekspor.'); return; }
  showToast('Menyiapkan file ZIP, mohon tunggu...');

  const zip = new JSZip();
  const folder = zip.folder(currentCategory);
  entries
    .sort((a,b) => a.timestamp - b.timestamp)
    .forEach((en, i) => {
      const dt = new Date(en.timestamp);
      const stamp = dt.toISOString().replace(/[:.]/g,'-');
      const name = `${String(i+1).padStart(3,'0')}_${currentCategory}_${stamp}.jpg`;
      folder.file(name, en.photoBlob);
    });

  const content = await zip.generateAsync({ type:'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `GeoFoto_${currentCategory}_${new Date().toISOString().slice(0,10)}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  showToast('ZIP foto berhasil diunduh.');
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
  onCancelQueue();
  switchTab('capture');
  window.scrollTo({ top:0, behavior:'smooth' });
}

function goToMenu(){
  onCancelQueue();
  document.getElementById('viewCategory').style.display = 'none';
  document.getElementById('viewMenu').style.display = 'block';
  currentCategory = null;
  if(overviewMap){ overviewMap.remove(); overviewMap = null; }
  renderMenu();
}

function switchTab(tab){
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('tabCapture').classList.toggle('active', tab === 'capture');
  document.getElementById('tabList').classList.toggle('active', tab === 'list');
  document.getElementById('tabMap').classList.toggle('active', tab === 'map');
  if(tab === 'list') renderList();
  if(tab === 'map') renderOverviewMap();
}

/* ==========================================================================
   INIT & EVENT BINDING
   ========================================================================== */
window.addEventListener('DOMContentLoaded', () => {
 try{
  renderMenu();
  retryPendingGeocodes();
  retryPendingCloudSync();

  document.getElementById('btnCamera').addEventListener('click', () => document.getElementById('inputCamera').click());
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('inputImport').click());

  document.getElementById('inputCamera').addEventListener('change', (e) => {
    if(e.target.files.length) startQueue(e.target.files, 'camera');
    e.target.value = '';
  });
  document.getElementById('inputImport').addEventListener('change', (e) => {
    if(e.target.files.length) startQueue(e.target.files, 'import');
    e.target.value = '';
  });

  document.getElementById('btnLocateNow').addEventListener('click', onLocateNowClick);
  document.getElementById('btnSaveQ').addEventListener('click', onSaveDraft);
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
if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('SW gagal:', err));
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
