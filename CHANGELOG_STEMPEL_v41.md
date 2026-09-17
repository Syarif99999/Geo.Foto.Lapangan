# Geo Foto Lapangan — v41: Tampilan ala GPS Map Camera + Mode Stempel Otomatis

## 1. Satu mesin stempel untuk foto DAN video
Sebelumnya ada TIGA kode stempel yang berbeda dan hasilnya tidak seragam:
foto (panel kecil seperti kartu, peta satelit asli), pratinjau/rekaman video
live (panel lain), dan penstempelan ulang video (panel lain lagi, kotak
petanya cuma gradien hijau — bukan peta beneran).

Sekarang ketiganya memanggil fungsi yang sama: `drawGeoStamp()`. Jadi foto
dan video dari lokasi yang sama tampil satu gaya, meniru susunan GPS Map
Camera:

- kotak peta satelit di kiri + pin merah + lingkaran akurasi biru
- judul lokasi tebal (nama usaha, atau "Kecamatan …, Provinsi, Indonesia")
- alamat lengkap di bawahnya
- `Lat -1.913228°  Long 116.191006°` warna emas
- tanggal lengkap berzona waktu: `Jumat, 18/09/2026 00:35 AM GMT+08.00`
- lencana kecil di pojok kanan atas panel
- panel selebar frame dengan sudut membulat, garis tepi tipis

Bonus: **video hasil stempel ulang sekarang ikut dapat citra satelit asli**
(diunduh sekali sebelum perekaman, lalu dipakai ulang tiap frame).

## 2. Mode stempel yang bisa berubah OTOMATIS
Tombol "Mode Stempel" ada di dua tempat: tab Ambil/Impor (berlaku untuk
foto) dan di dalam jendela rekam video. Pilihannya diingat (localStorage).

| Mode | Isi |
|---|---|
| 🤖 Otomatis | dipilih sendiri oleh aplikasi (lihat di bawah) |
| 📋 Lengkap | judul + alamat 2 baris + koordinat + tanggal + catatan + kredit |
| 🗺️ Klasik | judul + alamat 1 baris + koordinat + tanggal (panel pendek) |
| ⚡ Ringkas | hanya koordinat + tanggal, tanpa kotak peta |
| ✨ Elegan | panel terang, kotak peta bulat, garis aksen emas |

Yang dikerjakan mode **Otomatis**:
1. **Bentuk frame** — potret → Lengkap; lanskap → Klasik (panel lebih pendek
   supaya objek lapangan tidak tertutup).
2. **Kelengkapan data** — kalau alamat/judul belum ketemu (GPS masih mencari),
   otomatis turun ke Ringkas, bukan memasang baris kosong.
3. **Ukuran frame** — video/foto kecil (sisi pendek < 420 px) otomatis Ringkas
   supaya tulisan tetap terbaca.
4. **Gelap/terang** — kecerahan bagian bawah gambar dibaca, lalu panel dipakai
   gelap (di atas gambar terang) atau terang (di atas gambar gelap). Ada
   histeresis + cache 0,7 detik supaya warnanya tidak berkedip bolak-balik dan
   tidak membebani pratinjau 30 fps.

Pada video, template dan warna dikunci di frame pertama — satu video tidak
akan ganti-ganti gaya di tengah jalan.

## 3. Orientasi video: tambah mode Otomatis
Tombol orientasi sekarang: **🔄 Otomatis / 📱 Potret / 📱 Lanskap**
(default Otomatis).

- Otomatis membaca `screen.orientation` (cadangan: `window.orientation`, lalu
  rasio jendela) dan dicek ulang tiap frame pratinjau — putar HP, bingkai
  langsung ikut, tanpa menekan tombol.
- Begitu "Mulai Rekam" ditekan, orientasi **dikunci** pada nilai saat itu.
  Ini disengaja: mengubah ukuran kanvas di tengah perekaman merusak file
  videonya.
- Potret/Lanskap manual tetap ada untuk HP yang rotasi otomatisnya dimatikan
  atau sensornya tidak akurat.

Di bawah tombol ada baris info langsung, mis.
`Mode stempel: Otomatis → Lengkap (gelap) · Bingkai: Potret`.

## Perubahan teknis
- Baru: `drawGeoStamp()`, `resolveStampStyle()`, `sampleFrameBrightness()`,
  `setStampMode()`, `stampStatusText()`, `detectDeviceOrientation()`,
  `effectiveLiveOrient()`, `STAMP_THEME`, `STAMP_MODES`.
- `drawLiveStamp()`, `generateStampedPhoto()`, `generateStampedVideo()`:
  kode panel lama dihapus, semuanya memanggil `drawGeoStamp()`.
- `liveOrientMode` default `'auto'` + `liveOrientLocked` saat merekam.
- `index.html`: tombol `🔄 Otomatis`, dua baris `.stamp-mode-toggle`,
  info `#liveStampInfo`, CSS terkait.
- Versi cache service worker: `v41`.

## Validasi
- `node --check app.js`, `node --check sw.js`, `node --check pantau.js` lolos.
- Perbaikan cloud/`mediaType` dari v40 tidak diubah, masih berlaku.

## Catatan
Kredit citra peta tertulis kecil "Esri" di sudut kotak peta (tile satelit
memang berasal dari Esri World Imagery, bukan Google) — sengaja tidak meniru
logo Google supaya tidak salah atribusi.
