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
  apiKey: "PASTE_API_KEY_DI_SINI",
  authDomain: "PASTE_AUTH_DOMAIN_DI_SINI",
  projectId: "PASTE_PROJECT_ID_DI_SINI",
  storageBucket: "PASTE_STORAGE_BUCKET_DI_SINI",
  messagingSenderId: "PASTE_SENDER_ID_DI_SINI",
  appId: "PASTE_APP_ID_DI_SINI"
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
         allow write: if request.resource.data.keys().hasAll(['category','lat','lng','timestamp']);
       }
     }
   }

   Catatan: rule di atas mengizinkan siapa saja MEMBACA (untuk Peta Pantau publik)
   dan menulis HANYA jika data yang dikirim punya field wajib. Ini cukup untuk
   aplikasi internal skala kecil. Kalau nanti butuh lebih ketat (misal hanya HP
   petugas yang boleh menulis), bisa ditambahkan App Check atau autentikasi.
   ========================================================================== */
