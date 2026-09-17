# Geo Foto Lapangan — Perbaikan v39 (fix final: pilih orientasi manual)

## Kenapa v37 & v38 belum berhasil
Foto bisa menyesuaikan lanskap karena diambil lewat aplikasi kamera
bawaan HP (OS) yang menulis info rotasi ke file, lalu Geo Foto Lapangan
membacanya. Tapi fitur "Rekam Video dengan Stempel GPS Langsung" pakai
kamera LANGSUNG DI DALAM halaman web (bukan aplikasi kamera bawaan).
Orientasi kamera dalam-halaman ini ternyata bergantung pada kombinasi:
kuncian orientasi PWA, pengaturan auto-rotate HP, dan perilaku browser
yang berbeda-beda tiap merek HP — semuanya di luar kendali aplikasi, dan
tidak bisa dideteksi otomatis dengan andal. Itu sebabnya perbaikan
otomatis (v37, v38) tidak konsisten berhasil di HP Bapak Syarif.

## Perbaikan v39: berhenti menebak, biarkan Anda yang pilih
Sekarang di layar "Rekam Video", ada dua tombol di atas pratinjau
kamera: **📱 Potret** dan **📱 Lanskap**. Pilih sesuai posisi HP saat
akan merekam. Aplikasi akan langsung menyusun ulang bingkai + stempel
sesuai pilihan itu — dan pratinjau di layar SUDAH sama persis dengan
hasil videonya nanti (tidak ada lagi tebak-tebakan otomatis).

Ini menjamin hasilnya benar apa pun pengaturan HP-nya, karena tidak lagi
bergantung pada deteksi rotasi otomatis yang selama ini bermasalah.

## Perubahan teknis
- Ditambahkan toggle manual `Potret`/`Lanskap` di modal rekam video
  (`index.html`), disimpan di variabel `liveOrientMode`.
- Rotasi kanvas komposit (`getLiveRotation`/`syncLiveOutputCanvas`)
  sekarang dihitung dari pilihan manual ini dibandingkan bentuk asli
  frame kamera — bukan dari `screen.orientation` yang tidak bisa
  diandalkan.
- Loop penggambaran pratinjau (stempel + peta) sekarang berjalan SEJAK
  modal dibuka (`startLivePreviewLoop`), bukan hanya saat merekam —
  jadi apa yang terlihat di layar = persis apa yang terekam.
- Toggle otomatis dikunci begitu rekaman dimulai, dan dibuka lagi
  setelah selesai/dibatalkan.
- Versi cache service worker dinaikkan ke `v39`.

## Validasi
- `node --check app.js` berhasil.

## Catatan penggunaan
Setelah upload versi baru: tutup aplikasi dari daftar aplikasi terakhir,
buka lagi (atau hapus cache/reinstall PWA seperti biasa bila masih
melihat tampilan lama). Manifest orientation di v38 tetap dipertahankan
("any") sebagai jaring pengaman tambahan, tapi perbaikan utama kini ada
di toggle manual ini.
