# Blueprint Cleaner (build15)

**build15 — 2025-09-08 01:28:11 (Repo-ready / No Service Worker)**

Repo-ready debug build meant to be deployed at the **repo/site root** with **no service worker** to avoid caching during setup.

## Quick start (GitHub Pages)

1. Create a new repo (public is fine): `blueprint-cleaner`.
2. Put *all files from this folder* in the repo root (including `_headers`, which GitHub ignores).
3. Enable **GitHub Pages**: Settings → Pages → Deploy from branch → `main` → `/ (root)`.
4. Visit your site, e.g. `https://<user>.github.io/blueprint-cleaner/`.
5. Confirm the orange banner shows **build15**. Then upload a PDF and watch the log.

> GitHub Pages won’t use `_headers`, so while debugging caching, hard refresh if needed.
> If a CDN is blocked on your network, PDF loading will fail—ask me for a build that bundles pdf.js locally.

## Quick start (Netlify)

1. New site from Git → connect this repo.
2. **Publish directory**: *just the repo root* (no subfolder).
3. Netlify will honor the `_headers` file and set `Cache-Control: no-store` to avoid caches.
4. Open your Netlify URL and confirm **build15** banner.

## Notes

- This build **does not register a Service Worker**. No offline caching—on purpose.
- PDF rendering is loaded dynamically from CDNs (one-time fetch per session). If that’s blocked, tell me and I’ll ship a **fully offline** build with local pdf.js.
- The status log prints the file name, size, header bytes, SHA-256, path chosen (PDF/Image), and every PDF step.
