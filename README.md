# Blueprint Cleaner — build18 — 2025-09-08 01:47:48 (Local pdf.js / No SW)

This build is **100% offline** and **does not use a Service Worker** (no caching).
It expects **local copies** of pdf.js in `./lib/` so PDFs render without internet.

## 1) Drop in two files (exact names)

Put these **two files** into the `lib/` folder at the site root:

- `lib/pdf.min.js`
- `lib/pdf.worker.min.js`

You can get them from the official pdf.js npm/CDN mirrors:
- jsDelivr: `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.min.js`
- jsDelivr: `https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.min.js`
- unpkg (alternate): `https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.min.js`
- unpkg (alternate): `https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.js`

> If your iPad blocks those CDNs, download the files on your desktop and drag them into the repo’s `lib/` folder. Once committed, Netlify will serve them from **your** site (no external network needed).

## 2) Deploy

- **Netlify (recommended):** Build command: _blank_. Publish dir: `.` (repo root).
- **GitHub Pages:** Put all files at repo root. (Pages ignores `_headers`, which is fine.)

## 3) Verify

Open your site and confirm the orange banner shows **build18 — Local pdf.js / No SW**.
Pick a PDF — the log should read:

- `ensurePDFJS: start (local)`
- `pdf.js ready (local)`
- `Reading PDF file…` → `PDF loaded with N pages` → `Rendering with size WxH` → `Image ready.`

If you see: `Local pdf.js load failed: Failed to load ./lib/pdf.min.js`, it means the two files are not present at the expected paths/names.

