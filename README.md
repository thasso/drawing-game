# Little sketchbook

A static drawing game for fingers, a stylus, or a mouse. Plain HTML, CSS, and JavaScript, with no dependencies, build step, backend, accounts, or external assets.

## Try it locally

Serve this directory with any static web server. For example:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Draw, pick a color, and use **Keep picture** to add a drawing to **My pictures**. The current page also saves after each stroke. **New page** starts a blank drawing.

## Offline and storage

Host these files on an HTTPS static host for phone and iPad use. After the first online visit finishes caching the app, the service worker allows it to reopen offline at the same address. Localhost also supports service workers; a plain HTTP address on your local network does not. Opening `index.html` as a file is not supported.

Drawings are PNG data URLs in `localStorage`, scoped to this browser and origin. They are not uploaded or synced. Changing the hostname or port uses separate storage. Clearing site data removes drawings; private browsing and device storage limits can prevent saving. The app reports save failures. This PoC has no gallery deletion or export yet.

The service worker uses Cache Storage for app files. Bump the cache version in `sw.js` when changing them, then close existing tabs and reopen to activate an update.

## Files

- `index.html`: canvas, controls, and gallery dialog.
- `style.css`: responsive drawing screen.
- `app.js`: pointer drawing and local picture storage.
- `sw.js`: offline app cache.