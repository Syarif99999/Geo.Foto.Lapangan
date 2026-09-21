/* ==========================================================================
   KONFIGURASI FIREBASE - GEO FOTO LAPANGAN
   ==========================================================================
   Cara isi file ini:
   1. Buka https://console.firebase.google.com
   2. Buat project baru (nama bebas, misal "geo-foto-lapangan")
   3. Di dashboard project, klik ikon "</>" (Web) untuk daftarkan aplikasi web
   4. Salin nilai firebaseConfig yang muncul, tempel ke bawah ini
   5. Aktifkan Firestore Database (Build > Firestore Database > Create database)
   6. Atur Firestore Rules (lihat catatan di bawah)

   SELAMA belum diisi (masih ada tulisan "PASTE_"), fitur cloud/Peta Pantau
   otomatis nonaktif TANPA merusak fitur lain — ambil foto, simpan lokal,
   ekspor Excel/ZIP tetap jalan normal seperti biasa.
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCA2SNhPs3SvlqX9MxW8pnVVbLmLHSJM3Q",
  authDomain: "geo-foto-lapangan.firebaseapp.com",
  projectId: "geo-foto-lapangan",
  storageBucket: "geo-foto-lapangan.firebasestorage.app",
  messagingSenderId: "1044428924844",
  appId: "1:1044428924844:web:808a6a683e3d2f81563c09"
};

// Nama koleksi Firestore tempat semua data foto lapangan disimpan untuk Peta Pantau publik.
const FIRESTORE_COLLECTION = 'geofoto_entries';

// Koleksi kedua: foto "sedang" (±1280 px, tanpa stempel) per entri. Dipisah dari
// koleksi utama supaya Peta Pantau publik tidak ikut memuat foto besar. (v49)
const FIRESTORE_PHOTO_COLLECTION = 'geofoto_foto';

/* ==========================================================================
   FIRESTORE RULES: lihat berkas FIRESTORE_RULES.txt (TAHAP 1 lalu TAHAP 2).
   Aturan lama (semua orang bebas baca/tulis/HAPUS) tidak dianjurkan lagi —
   pemilik data kini ditandai dengan ownerUid (login anonim otomatis).
   ========================================================================== */
