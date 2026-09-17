# Geo Foto Lapangan — Perbaikan v37

## Bug 1: Stempel tidak muncul saat merekam video mode lanskap
Penyebab: manifest.json PWA ini mengunci orientasi ke "portrait-primary",
sehingga `screen.orientation.type` tidak pernah berubah ke "landscape"
walau HP diputar secara fisik (saat aplikasi sudah terpasang/standalone).
Kode lama menebak kebutuhan rotasi kanvas dengan membandingkan
`screen.orientation.type` vs ukuran video — akibatnya video lanskap yang
sebenarnya SUDAH benar orientasinya malah dipaksa dirotasi 90°/-90°,
sehingga bingkai dan stempel jadi tidak tampil dengan benar (atau hilang)
saat merekam dalam mode lanskap.

Perbaikan: rotasi manual dihapus. Kanvas komposit kini langsung memakai
ukuran asli video dari kamera (videoWidth/videoHeight), yang pada browser
mobile modern memang sudah otomatis mengikuti orientasi fisik perangkat.
Stempel sekarang konsisten tampil di semua orientasi (potret & lanskap).

## Bug 2: Video tidak muncul saat dibagikan (mis. ke WhatsApp)
Penyebab: rekaman video selalu direkam sebagai WebM. Banyak aplikasi
(termasuk WhatsApp di sebagian perangkat/versi) gagal menampilkan atau
menerima lampiran video berformat WebM lewat Web Share API, sehingga
video "hilang"/tidak muncul saat proses bagikan.

Perbaikan: perekaman kini mengutamakan format MP4 (H.264/AAC) bila
didukung oleh browser/perangkat, baru jatuh ke WebM sebagai cadangan.
MP4 jauh lebih kompatibel untuk dibagikan ke WhatsApp dan aplikasi lain.
Ini berlaku untuk rekaman langsung maupun pemrosesan stempel video hasil
impor.

## Perubahan teknis
- `getRotation()`/`syncOutputCanvas()` pada `startLiveRecording()`
  disederhanakan — tidak lagi bergantung pada `screen.orientation`.
- Fungsi `syncLiveCanvasSize` (kode mati, tidak pernah dipanggil) dihapus.
- Daftar `mimeType` prioritas MediaRecorder pada rekaman live dan
  `generateStampedVideo()` kini mencoba MP4 dahulu sebelum WebM.
- Versi cache service worker dinaikkan ke `v37`.

## Validasi
- `node --check app.js` berhasil.
- `node --check pantau.js` berhasil.

## Catatan penggunaan
Setelah mengunggah versi baru, tutup aplikasi dari daftar aplikasi
terakhir lalu buka kembali. Jika masih melihat tampilan lama, buka menu
browser dan lakukan refresh penuh atau hapus cache aplikasi PWA.

Dukungan MP4 tetap bergantung pada browser/perangkat — jika perangkat
tidak mendukung perekaman MP4, aplikasi otomatis kembali memakai WebM
seperti sebelumnya.
