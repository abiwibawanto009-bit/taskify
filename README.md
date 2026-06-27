# Taskify // Smart Kanban Board PWA

Proyek **Taskify** adalah aplikasi Manajemen Tugas (Kanban Board) modern yang dirancang sebagai Progressive Web App (PWA) premium dengan fitur lengkap. Aplikasi ini memadukan backend Node.js/Express, database SQLite, pemrosesan Async JavaScript, Service Worker untuk mode offline, serta Push Notifications.

## Kriteria Penilaian Terpenuhi

1. **Integrasi Backend & Database (20 Poin):**
   - Express.js backend melayani REST API CRUD.
   - Database menggunakan **SQLite3** (`database.db`) yang terintegrasi secara otomatis, menyimpan data tugas (`tasks`) dan data langganan push (`subscriptions`).
2. **Async JavaScript (20 Poin):**
   - Di sisi backend: Query database dibungkus menggunakan Promise dan dijalankan dengan sintaksis `async/await` (`database.js`).
   - Di sisi frontend: Semua aksi CRUD (create, read, update, delete, update status) menggunakan `fetch()` API dengan arsitektur `async/await` untuk interaksi real-time tanpa reload halaman (`public/app.js`).
3. **Service Worker & Push Notifications (30 Poin):**
   - **Service Worker** (`public/sw.js`) diinstal untuk melakukan pre-caching seluruh aset statis (HTML, CSS, JS, Fonts, Icons) serta meng-cache respon API tugas secara dinamis.
   - Mendukung **Push Notifications** lengkap menggunakan pustaka `web-push`. Backend secara otomatis men-generate VAPID keys yang aman. User dapat meng-klik tombol **"Enable Push"** untuk meminta izin browser, lalu tombol **"Test Notify"** untuk mencoba mengirim notifikasi secara langsung ke browser.
4. **Implementasi PWA (20 Poin):**
   - Memiliki `manifest.json` yang valid dengan konfigurasi standalone, warna tema, scope, serta icon SVG & PNG lengkap (ukuran 192x192 & 512x512).
   - Mendukung fitur installable dengan tombol unduh aplikasi (**"Install App"**) yang muncul secara dinamis saat didukung oleh browser.
   - Kemampuan luring penuh (Offline Mode) dengan indikator visual koneksi (Online/Offline) dan sistem Toast Alert interaktif.
5. **Deploy ke Server (10 Poin):**
   - Konfigurasi siap deploy ke layanan cloud seperti **Render**, **Railway**, atau **Heroku** (Panduan lengkap di bawah).

---

## Struktur File Proyek

```text
RESPONSI UAS/
├── database.db          # File Database SQLite (dibuat otomatis saat dijalankan)
├── database.js          # Pengelolaan skema SQLite dengan Promise wrappers (Async)
├── package.json         # Modul & dependensi Node.js
├── server.js            # Node.js Express server + Konfigurasi VAPID Web Push
├── public/              # Direktori PWA Frontend
│   ├── app.js           # Kontroler Javascript Async, PWA Install, & Push Registrasi
│   ├── index.html       # Antarmuka Dashboard Glassmorphic
│   ├── manifest.json    # Konfigurasi Web Manifest PWA
│   ├── style.css        # Desain CSS Premium (Glassmorphism & Animasi)
│   ├── sw.js            # Service Worker untuk Cache offline & Listeners Push
│   └── icons/           # Aset Icon PWA
│       ├── icon-192.png
│       ├── icon-512.png
│       └── icon.svg
└── README.md            # Dokumentasi panduan
```

---

## Cara Menjalankan Proyek secara Lokal

### 1. Prasyarat
Pastikan Anda sudah menginstal [Node.js](https://nodejs.org/) (Versi 16 atau lebih tinggi).

### 2. Instalasi Dependensi
Buka terminal di folder proyek (`RESPONSI UAS`), lalu jalankan perintah:
```bash
npm install
```

### 3. Menjalankan Server
Jalankan server menggunakan perintah:
```bash
npm start
```
Server akan berjalan di **`http://localhost:5000`**. Anda juga akan melihat pemberitahuan bahwa kunci VAPID (`.env`) berhasil dibuat secara otomatis demi mempermudah konfigurasi.

---

## Cara Menguji Fitur Aplikasi

1. **CRUD & Async JS**:
   - Buka aplikasi di Google Chrome atau Microsoft Edge di alamat `http://localhost:5000`.
   - Tambahkan tugas baru melalui tombol **"New Task"**.
   - Coba pindahkan status tugas ke kanan/kiri menggunakan tombol panah (`<` dan `>`) pada kartu tugas.
   - Coba edit tugas dengan menekan tombol ikon pena, dan hapus tugas dengan ikon tempat sampah. Semua interaksi berjalan cepat secara asinkronus tanpa reload!
2. **Fungsionalitas PWA Offline**:
   - Buka Chrome DevTools (`F12`), masuk ke tab **Application** -> **Service Workers**. Pastikan `sw.js` terdaftar dan aktif.
   - Putuskan koneksi jaringan di DevTools dengan mengubah status **No throttling** menjadi **Offline** di tab Network atau Application.
   - Refresh halaman. Aplikasi dan tugas yang sudah ter-load sebelumnya akan tetap muncul dan dapat diakses dengan sempurna berkat Service Worker Caching. Indikator koneksi di pojok kanan atas akan berubah menjadi **Offline Mode** berwarna oranye.
3. **PWA Installation**:
   - Saat membuka aplikasi melalui browser pendukung PWA (seperti Chrome), Anda akan melihat tombol **"Install App"** muncul di bilah navigasi kanan atas. Klik tombol tersebut untuk menginstal Taskify langsung ke desktop/ponsel Anda.
4. **Push Notifications**:
   - Klik tombol **"Enable Push"** di pojok kanan atas aplikasi. Browser akan memunculkan pop-up izin notifikasi. Pilih **Allow (Izinkan)**.
   - Setelah notifikasi aktif, klik tombol **"Test Notify"** untuk memicu pengiriman notifikasi dari backend. Anda akan segera menerima notifikasi pop-up dari sistem operasi Anda, membuktikan integrasi Service Worker + Push API berjalan sukses!

---

## Panduan Deploy ke Server (Production)

Aplikasi ini sangat mudah dideploy secara gratis ke **Render** atau **Railway**:

### Opsi 1: Deploy ke Render (Sangat Direkomendasikan)
1. Commit semua kode Anda ke repositori **GitHub** (buat repo private atau public).
2. Buat akun di [Render.com](https://render.com/).
3. Di Dashboard Render, klik **New** -> **Web Service**.
4. Hubungkan dengan repositori GitHub Anda.
5. Masukkan konfigurasi berikut:
   - **Name**: `taskify-pwa` (atau nama lain)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Klik **Deploy Web Service**. Render akan mem-build dan menyajikan aplikasi Anda secara HTTPS (HTTPS wajib diperlukan agar Service Worker & Push Notification dapat berjalan di domain selain localhost).

### Opsi 2: Deploy ke Railway
1. Hubungkan akun GitHub Anda di [Railway.app](https://railway.app/).
2. Buat Project Baru dan pilih repositori GitHub proyek ini.
3. Railway akan secara otomatis membaca file `package.json` dan menyetel perintah build dan jalankan.
4. Railway akan men-deploy server secara instan dan memberikan domain HTTPS gratis.
