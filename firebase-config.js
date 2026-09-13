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

/* ==========================================================================
   CONTOH FIRESTORE RULES (tempel di Firebase Console > Firestore > Rules):

   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /geofoto_entries/{docId} {
         allow read: if true;
         allow create: if request.resource.data.keys().hasAll(['category','lat','lng','timestamp']);
         allow update: if request.resource.data.keys().hasAll(['category','lat','lng','timestamp']);
         allow delete: if true;
       }
     }
   }

   PENTING: create/update/delete dipisah sengaja — kalau digabung jadi satu
   "allow write" dengan syarat field wajib, perintah DELETE akan selalu
   ditolak Firestore (karena saat hapus, request.resource bernilai null,
   jadi pengecekan field pasti gagal). Ini pernah jadi penyebab data yang
   sudah dihapus di HP tetap muncul lagi lewat "Pulihkan dari Cloud".

   Catatan: rule di atas mengizinkan siapa saja MEMBACA (untuk Peta Pantau
   publik), MENULIS data baru/ubah data (asal field wajib lengkap), dan
   MENGHAPUS bebas. Ini cukup untuk aplikasi internal skala kecil. Kalau
   nanti butuh lebih ketat (misal hanya HP petugas yang boleh menulis),
   bisa ditambahkan App Check atau autentikasi.
   ========================================================================== */
