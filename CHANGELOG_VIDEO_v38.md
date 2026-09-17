# Geo Foto Lapangan — Perbaikan v38 (akar masalah stempel lanskap)

## Kenapa perbaikan v37 belum cukup
Di v37 saya sudah membetulkan logika rotasi kanvas di app.js. Tapi dari
screenshot yang dikirim, ternyata itu belum menyelesaikan masalah,
karena akar masalah sebenarnya ada satu level LEBIH TINGGI: di file
`manifest.json`.

File itu berisi:
    "orientation": "portrait-primary"

Baris ini memberi tahu Android/Chrome: "aplikasi ini WAJIB tetap potret,
kunci layar HP supaya tidak bisa ikut berputar ke lanskap" — ini berlaku
saat aplikasi dipasang ke layar utama (mode "standalone"). Efeknya:

- HP tidak pernah benar-benar masuk ke orientasi lanskap walau diputar
  secara fisik, karena OS mengunci rotasinya.
- Karena halaman/dokumen tidak pernah berputar, kamera (getUserMedia)
  ikut mengirim gambar dalam bentuk potret terus — video yang
  seharusnya lanskap tetap berbentuk potret dari sananya.
- Perbaikan rotasi kanvas di app.js (v37) jadi tidak berpengaruh, karena
  sumber videonya sendiri memang tidak pernah berubah ke lanskap.

## Perbaikan v38
`"orientation": "portrait-primary"` diganti menjadi `"orientation": "any"`
di manifest.json, supaya HP diizinkan berputar bebas mengikuti posisi
fisik perangkat saat aplikasi berjalan sebagai PWA terpasang. Dengan ini,
saat HP diputar ke lanskap, kamera akan benar-benar merekam dalam bentuk
lanskap, dan logika stempel bawah (yang sudah dibetulkan di v37) akan
bekerja sebagaimana mestinya.

## PENTING — langkah yang WAJIB dilakukan setelah update ini
Kunci orientasi di manifest.json ini biasanya "dicatat"/di-cache oleh
Android saat ikon aplikasi pertama kali ditambahkan ke layar utama.
Mengganti file manifest.json saja SERING TIDAK CUKUP untuk ikon yang
sudah lama terpasang — harus dipasang ulang:

1. Hapus/uninstall ikon "Geo Foto Lapangan" dari layar utama HP
   (tekan lama ikonnya → Hapus/Uninstall dari layar utama).
2. Buka lagi alamat web aplikasinya lewat Chrome (bukan dari ikon lama).
3. Lakukan hard refresh (buka menu titik tiga Chrome → riwayat →
   hapus data situs ini, atau tutup semua tab lalu buka ulang) supaya
   Chrome mengambil manifest.json dan sw.js versi baru, bukan dari cache.
4. Pasang ulang ke layar utama ("Tambahkan ke layar utama" / "Install
   aplikasi").
5. Coba rekam video sambil HP dalam posisi lanskap — stempel sekarang
   seharusnya ikut menyesuaikan.

Kalau langkah di atas dilewati (cuma update lewat ikon lama tanpa
copot-pasang ulang), kemungkinan besar kuncian orientasi lama masih
dipakai HP dan masalahnya akan terlihat sama seperti sebelumnya.

## Perubahan teknis
- `manifest.json`: `orientation` diubah dari `portrait-primary` ke `any`.
- Versi cache service worker dinaikkan ke `v38`.
