# Geo Foto Lapangan — Perbaikan Video

## Perubahan utama

- Stempel video live sekarang selalu berada di area bawah frame, bukan mengambang di tengah-kiri sehingga objek lapangan lebih terlihat.
- Layout stempel menyesuaikan rasio video lanskap dan potret berdasarkan ukuran frame kamera.
- Teks stempel dibungkus dan dibatasi lebar panel sehingga tidak keluar dari kotak atau terpotong di tepi video.
- Panel menggunakan ukuran proporsional terhadap sisi terpendek video agar tetap terbaca pada berbagai resolusi.
- Video impor yang diproses ulang menggunakan layout stempel bawah yang sama, termasuk koordinat, alamat, waktu, dan identitas BAPENDA.
- Canvas live memakai preview kamera sebagai sumber frame komposit, sehingga stempel mengikuti seluruh gerakan kamera secara langsung.
- Fallback berbagi/unduh diperbaiki agar memakai blob media yang benar untuk foto maupun video.
- Versi cache service worker dinaikkan ke `v34` agar perangkat yang sudah memasang PWA menerima perubahan terbaru.

## Validasi

- `node --check app.js` berhasil.
- `node --check pantau.js` berhasil.
- Halaman utama dan kategori berhasil dimuat melalui HTTP lokal.
- Tombol rekam video tetap merespons; bila browser tidak menyediakan kamera live, aplikasi mempertahankan fallback ke kamera perangkat.

## Catatan penggunaan

Untuk hasil terbaik, setelah mengunggah versi baru tutup aplikasi dari daftar aplikasi terakhir lalu buka kembali. Jika masih melihat tampilan lama, buka menu browser dan lakukan refresh penuh atau hapus cache aplikasi PWA.

Stempel video pada perangkat lama diproses saat video disimpan. Video yang sudah tersimpan sebelum pembaruan tidak otomatis di-render ulang kecuali diimpor/proses ulang kembali.

> Catatan teknis: browser mobile umumnya menyimpan hasil rekaman WebM. Dukungan MP4 bergantung pada browser dan perangkat.
