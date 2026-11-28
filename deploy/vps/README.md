# Deploy raqio ke VPS

Server: `37.60.232.191` (Contabo, Ubuntu 24.04), alias SSH `quarn-vps`. Domain: `raqio.id` (site), `app.raqio.id`
(dashboard), `api.raqio.id` (API publik), `raqio.xyz` dialihkan permanen ke `raqio.id`.

## Perintah (Git Bash, dari root repo)

| Perintah | Fungsi |
|---|---|
| `bash deploy/deploy.sh` | deploy semua (`all`) dari commit HEAD |
| `bash deploy/deploy.sh site` / `app` / `api` | deploy satu bagian saja |
| `bash deploy/deploy.sh rollback` | kembalikan semua bagian ke release sebelumnya yang pernah live |
| `bash deploy/deploy.sh rollback app 4a9dc7344ddd` | kembalikan satu bagian ke release tertentu |
| `bash deploy/deploy.sh status` | release yang live per bagian, status HTTP, release tersimpan |
| `bash deploy/deploy.sh setup` | sekali per server baru (paket, user `raqio`, firewall, rahasia baru) |

Hanya commit yang ikut dikirim. Perubahan yang belum di-commit tidak ikut, dan script akan memberi peringatan.

## Alur satu deploy

1. Laptop membuat `git archive` dari HEAD dan menghitung sha256-nya. Arsip dikirim lewat SSH dengan kunci host yang
   dipin (`deploy/vps/known_hosts`).
2. Server (`/opt/raqio/bin/raqio-gate`) mengecek ulang sha256, lalu membuka arsip ke `releases/<sha>`, milik root.
3. Next di-build sebagai user `raqio` di `builds/<sha>`: `pnpm install --frozen-lockfile`, `turbo build`, dan cek
   versi Next/React yang sudah ditambal.
4. API dan worker di-build sebagai image docker `raqio-api:<sha>` dan `raqio-worker:<sha>`.
5. Build baru diuji di port sementara (site :3130, app :3131). Kalau gagal, deploy berhenti dan produksi tidak
   berubah.
6. Pindah: api dulu, lalu app, lalu site. Setiap bagian dicek kesehatannya. Kalau tidak sehat, otomatis kembali ke
   release sebelumnya.
7. `raqio.caddy` dipasang bila berubah, lalu `caddy validate` dan `systemctl reload caddy` (reload, bukan restart).
8. Server menyimpan 5 release terbaru ditambah yang sedang live.

## Tata letak server

| Path | Isi |
|---|---|
| `/opt/raqio/releases/<sha>` | isi commit, milik root. Skrip deploy, compose, dan caddy dibaca dari sini |
| `/opt/raqio/builds/<sha>` | salinan milik user `raqio` tempat Next di-build dan dijalankan |
| `/opt/raqio/current-{site,app,api}` | symlink ke release yang live per bagian |
| `/opt/raqio/shared/{site,app,api}.env` | rahasia; dibuat `setup`, tidak pernah di-commit atau dicetak |
| `/etc/caddy/sites/raqio.caddy` | konfigurasi Caddy raqio; Caddyfile utama hanya `import /etc/caddy/sites/*.caddy` |

| Bagian | Jalan sebagai | Alamat |
|---|---|---|
| site | pm2 `raqio-site`, user `raqio` | 127.0.0.1:3120 |
| app | pm2 `raqio-app`, user `raqio` | 127.0.0.1:3121 |
| api | docker `raqio-api-1` | 127.0.0.1:8130 |
| worker, postgres, backup harian | docker project `raqio` | tanpa port keluar |

## Mengubah rahasia atau konfigurasi

Login dengan `ssh quarn-vps`, lalu edit `/opt/raqio/shared/api.env` (SMTP, OpenRouter, Xendit, dan lainnya). Setelah
itu jalankan `bash deploy/deploy.sh api`. Untuk `app.env` deploy ulang `app`, untuk `site.env` deploy ulang `site`.
`AUTH_SECRET` di `api.env` dan `app.env` harus sama.

Membuat kode undangan:

```
ssh quarn-vps 'docker exec raqio-api-1 /api invites create -n 3 -products scraping,wasuite'
```

## CI (GitHub Actions)

Workflow ada di `.github/workflows/deploy.yml`. Jalankan dari tab Actions > Deploy > Run workflow.

- Secret `VPS_SSH_KEY` (environment `Raqio`) berisi kunci privat `~/.ssh/raqio_ci`.
- Di server, kunci itu hanya boleh menjalankan `raqio-gate` (`restrict,command=...`).
- Deploy otomatis setelah CI hijau di `main` hanya aktif bila repository variable `AUTO_DEPLOY=1`.

## Kalau server diinstal ulang

1. Ambil fingerprint kunci host lewat jalur lain (VNC/console penyedia):
   `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`
2. Ganti baris di `deploy/vps/known_hosts` setelah fingerprint-nya cocok.
3. Jalankan `bash deploy/deploy.sh setup`, lalu `bash deploy/deploy.sh`.
