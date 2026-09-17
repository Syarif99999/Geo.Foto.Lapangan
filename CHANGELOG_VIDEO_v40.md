# Geo Foto Lapangan — Perbaikan v40

## Bug baru yang ketemu dari screenshot: "video gak muncul"
Ini BUKAN soal rotasi kamera — ini bug terpisah di fitur cloud sync.
Entri kedua yang tampil aneh (kotak navy bertuliskan "VIDEO" berwarna
emas, dan tidak bisa dibagikan) adalah SALINAN dari video yang sama,
yang masuk lewat "Pulihkan dari Cloud" / "Sinkron Ulang" / sinkronisasi
otomatis Peta Pantau.

Akar masalahnya: saat entri dikirim ke cloud (Firestore), field
`mediaType` (penanda "ini video" vs "ini foto") TIDAK PERNAH ikut
dikirim. Jadi saat entri itu ditarik balik ke HP (baik manual lewat
"Pulihkan dari Cloud", atau otomatis lewat sinkronisasi Peta Pantau),
aplikasi tidak tahu itu video — dianggap FOTO biasa. Karena thumbnail
video yang ikut terunggah ke cloud memang gambar placeholder bertuliskan
"VIDEO" (video aslinya sendiri TIDAK pernah diunggah — terlalu besar
untuk database cloud), hasilnya adalah "foto" yang isinya cuma gambar
placeholder itu. Makanya "video-nya" tidak pernah benar-benar ada untuk
dibagikan.

## Perbaikan v40
1. `mediaType` sekarang ikut dikirim ke cloud saat sinkron (baik lewat
   "Sinkron Ulang" maupun otomatis).
2. "Pulihkan dari Cloud" dan sinkronisasi otomatis Peta Pantau sekarang
   membaca `mediaType` itu, sehingga entri video hasil pulihan tetap
   ditandai video (tampil dengan ikon 🎥, bukan gambar rusak).
3. Karena video ASLI memang tidak pernah tersimpan di cloud (by design —
   terlalu besar), entri video hasil pulihan kini secara jujur ditandai
   "tidak ada file video asli". Kalau tombol Bagikan ditekan pada entri
   semacam ini, aplikasi sekarang kasih pesan jelas: "Video asli tidak
   tersedia di HP ini... Video lengkap hanya ada di HP yang pertama kali
   merekamnya." — bukan diam-diam gagal/rusak seperti sebelumnya.

## Soal stempel lanskap "masih di samping kanan"
Saya juga mengganti cara video diputar ke posisi lanskap di kanvas
(`drawLiveStamp`) dengan teknik "putar dari titik tengah" yang jauh
lebih aman secara matematis dibanding cara translate+rotate manual
sebelumnya — cara lama itu adalah kode ASLI/BAWAAN aplikasi ini (bukan
buatan saya) yang selama ini nyaris tidak pernah benar-benar teruji,
karena sebelum ada toggle manual Potret/Lanskap, rotasi 90°/-90° hampir
tidak pernah benar-benar terpicu. Begitu toggle manual mulai memicunya
di v39, potensi bug lama pada kode tersebut baru benar-benar ketahuan.

## PENTING: entri video yang SUDAH TERLANJUR rusak di HP Bapak
Perbaikan ini mencegah masalah untuk data BARU. Entri video kedua yang
sudah ada di screenshot (yang tampilannya rusak) tetap perlu dihapus
manual — tekan "Hapus" pada entri tersebut. Entri pertama (yang videonya
memang tersimpan asli di HP ini) aman, tidak perlu dihapus.

## Update otomatis
Mulai versi ini, kalau ada versi baru aplikasi terpasang di latar
belakang, halaman akan otomatis memuat ulang SATU KALI begitu update
selesai — supaya perubahan kode langsung kepakai tanpa perlu
tutup-paksa/hapus cache manual setiap kali. (Update KE versi v40 ini
sendiri tetap perlu proses seperti biasa satu kali terakhir; setelah
itu update berikutnya akan otomatis.)

## Perubahan teknis
- `syncEntryToCloud()`: kirim `mediaType`.
- `restoreFromCloud()` & `startCategoryCloudSync()`: baca `mediaType`
  dari cloud; entri video pulihan diberi `videoBlob:null,
  cloudThumbOnly:true`, `photoBlob:null`.
- `shareEntry()`: guard untuk entri video tanpa `videoBlob` (tampilkan
  pesan, jangan coba bagikan blob kosong).
- `drawLiveStamp()`: rotasi video 90°/-90° memakai teknik rotate-around-
  center (lebih aman) alih-alih translate+rotate manual.
- `app.js`: registrasi service worker sekarang auto-reload sekali saat
  controller baru aktif.
- Versi cache service worker: `v40`.

## Validasi
- `node --check app.js` berhasil.
