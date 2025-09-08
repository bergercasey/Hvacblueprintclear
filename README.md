# Blueprint Cleaner — build21 — 2025-09-08 02:04:13 (Local pdf.js LEGACY / No SW)

This build expects the **LEGACY** UMD build of pdf.js (v4 switched to ESM for the main build).  
For a non-module script tag that exposes `window.pdfjsLib`, you must use:
- `pdfjs-dist@4.7.76/legacy/build/pdf.min.js`
- `pdfjs-dist@4.7.76/legacy/build/pdf.worker.min.js`

## Put these files into `lib/legacy/` (exact names)

```
lib/legacy/pdf.min.js
lib/legacy/pdf.worker.min.js
```

If you already placed files in `lib/`, that's OK — this build will try `lib/legacy` **first**, then fall back to `lib/`.
But to avoid the "API missing" error, prefer the **legacy** folder/files above.

## Deploy
- Netlify publish dir: `.`; no build command; no service worker here.
- Open site → confirm banner shows **build21 — Local pdf.js LEGACY**.
- Use the **PDF Engine Diagnostics** box to probe paths — it shows ✅/❌ and file sizes.

## Why the previous error happened
`pdfjs-dist@4.x` main `build/pdf.min.js` is optimized for ESM imports and may not attach `window.pdfjsLib` in all contexts.  
The **legacy build** is the one that reliably exposes `pdfjsLib` as a global in a plain `<script>` tag environment.
