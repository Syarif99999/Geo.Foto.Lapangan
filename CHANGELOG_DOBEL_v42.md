# Geo Foto Lapangan — v42: Perbaikan foto/video tersimpan DOBEL

## Penyebabnya (bukan salah pencet)
Urutan proses simpan yang lama begini:

1. foto disimpan ke HP (IndexedDB) — **belum punya nomor dokumen cloud**
2. foto diunggah ke Firestore
3. baru nomor dokumen cloud dicatat ke entri lokal

Masalahnya, listener sinkronisasi real-time (yang membuat Daftar Data ikut
terisi otomatis kalau rekan kerja lain mengambil foto) langsung bangun di
langkah 2. Dia mencari entri lokal yang nomor dokumen cloudnya sama — dan
TIDAK ketemu, karena langkah 3 belum sempat jalan. Kesimpulannya: "ini foto
baru dari HP lain" → **dibuatkan salinan kedua**.

Ciri khasnya persis seperti di layar Bapak: dua entri, alamat sama, jam sama
persis sampai ke menitnya, yang satu sudah ditandai terkirim ke WA dan satunya
tidak. Salinan kedua itu isinya cuma thumbnail dari cloud, bukan foto asli.

## Yang diperbaiki
1. **Nomor dokumen cloud diklaim SEBELUM diunggah.** Celah waktu penyebab
   kembaran itu hilang. Berlaku juga untuk "Sinkron Ulang" dan sinkron
   otomatis yang tertunda — dua-duanya punya pola urutan yang sama.
2. **Jaring pengaman di sisi penerima.** Sebelum listener memutuskan sebuah
   dokumen cloud adalah "data baru dari HP lain", dia mengecek dulu apakah di
   HP ini sudah ada data yang sama (jenis media sama, koordinat selisih di
   bawah ±0,0003°, waktu selisih di bawah 2 menit). Kalau ada, dokumen cloud
   itu **ditautkan** ke entri yang sudah ada — tidak ditambah jadi entri baru.
   Foto/video asli resolusi penuh milik entri lokal tetap dipertahankan.
   Pengecekan yang sama dipakai "Pulihkan dari Cloud".
3. **Tombol Simpan dikunci selama proses simpan berjalan.** Proses stempel
   foto/video bisa makan beberapa detik; selama itu tombol masih bisa
   tersentuh dua kali. Sekarang panggilan kedua diabaikan dan tombolnya
   dinonaktifkan sampai selesai.

## Untuk data dobel yang SUDAH terlanjur ada
Tiga perbaikan di atas mencegah kembaran BARU; yang sudah terlanjur tersimpan
tetap perlu dibereskan. Ada tombol baru di Daftar Data: **🧹 Bersihkan Dobel**.

- Mencari entri yang jenis medianya sama, koordinatnya sama (4 desimal), dan
  waktunya dalam rentang 2 menit yang sama.
- Yang **dipertahankan** adalah yang memegang file asli (foto/video resolusi
  penuh, bukan thumbnail cloud).
- Salinannya dipindahkan ke **Sampah**, bukan dihapus permanen — masih bisa
  dipulihkan 30 hari kalau ternyata ada yang salah pilih.
- Nomor dokumen cloud dipindahkan ke entri yang dipertahankan, supaya
  dokumen di Peta Pantau tidak dianggap hilang lalu ditarik ulang jadi dobel
  lagi. Data di Peta Pantau tidak ada yang dihapus.

Jalankan sekali per kategori setelah update.

## Perubahan teknis
- `saveDraftAndAdvance()`: dipecah jadi pembungkus ber-guard (`savingDraft`)
  + `doSaveDraftAndAdvance()`; `updateEntry(localId,{cloudDocId})` dipindah ke
  sebelum `syncEntryToCloud()`.
- Baru: `findLocalTwinForCloudDoc()`, `cleanupDuplicates()`,
  `nilaiKelengkapan()`.
- `startCategoryCloudSync()` & `restoreFromCloud()`: adopsi entri kembar
  alih-alih `addEntry()`.
- `forceResyncAll()` & `retryPendingCloudSync()`: catat `cloudDocId` sebelum
  unggah.
- `index.html`: tombol `🧹 Bersihkan Dobel` + keterangannya.
- Versi cache service worker: `v42`.

## Validasi
- `node --check app.js`, `sw.js`, `pantau.js` lolos.
- Semua perubahan v41 (stempel ala GPS Map Camera + mode otomatis) dan
  perbaikan v40 (`mediaType` di cloud) tetap ada.
