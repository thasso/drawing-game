# Little sketchbook

A static drawing game for fingers, a stylus, or a mouse. Plain HTML, CSS, and JavaScript, with no dependencies, build step, backend, accounts, or external assets.

## Try it locally

Serve this directory with any static web server. For example:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Draw and pick a color. Drawings save into **My Pictures** after each stroke; editing updates the same picture. Starting a new page or opening another picture saves the current one first, without a confirmation dialog. **New page** opens a visual chooser for a blank page, a flower, a butterfly, or a rocket.

The brush and color buttons at the bottom open their choices only when needed. Pinch with two fingers to zoom and move around the page (or use the mouse wheel); the frame button shows the whole page again. Zooming only changes the view, not the saved picture.

Open **My Pictures** and use a picture's trash button to delete it. The undo arrow restores the most recently deleted picture, even after a reload. Deleting another picture replaces that undo history. Untouched blank pages are not added to the gallery.

On coloring pages, each stroke stays in the region where it starts. Outlines stay above the paint. The eraser removes paint without removing the outline. Saved coloring pages retain separate paint and outline layers so they can be reopened and edited.

## Install on iPhone or iPad

1. Host this directory on any HTTPS static host. Keep every file and the `icons/` folder. No server-side application or build step is needed.
2. Open the HTTPS address in Safari while online.
3. Tap Share, then **Add to Home Screen**. Enable **Open as Web App** if iOS offers that option, then tap **Add**.
4. Open Sketchbook from the home screen while still online so the initial offline cache can finish installing.
5. Switch to airplane mode and reopen the home-screen app to check offline launch, drawing, coloring pages, saving, and reopening pictures on your device.

The app opens in standalone mode, without Safari's address bar. On Android or desktop, use the browser's Install app or Add to Home Screen command.

The current HTTP Tailscale preview cannot provide offline installation. Use an HTTPS static host or a private Tailscale Serve HTTPS address. HTTP and HTTPS addresses have separate storage: drawings from the HTTP preview do not automatically move to the HTTPS app. Install first, then create drawings in the home-screen app; do not assume Safari and an installed iOS web app share the same saved pictures.

## Offline and storage

After the first online visit finishes caching the app, its service worker serves the page, scripts, styles, manifest, and icons from Cache Storage. Brushes and outline artwork are bundled locally. Drawing and saving do not require a network connection. Localhost also supports service workers; a plain HTTP address on your local network does not. Opening `index.html` as a file is not supported.

Drawings are PNG data URLs in `localStorage`, scoped to this browser and origin. They are not uploaded or synced. Changing the hostname or port uses separate storage. Clearing site data removes drawings; private browsing and device storage limits can prevent saving. The app reports save failures. The app retains one deleted picture for undo. This PoC has no export yet, so drawings have no separate backup. iOS or the browser can remove site storage under storage pressure; home-screen installation is not a guarantee of permanent storage.

The service worker uses Cache Storage for app files. Bump the cache version in `sw.js` when changing them, then close existing tabs and reopen to activate an update.

## Files

- `index.html`: canvas, controls, and gallery dialog.
- `style.css`: responsive drawing screen.
- `app.js`: brushes, pointer drawing, coloring layers, and local picture storage.
- `coloring.js`: local outline artwork and coloring-region clipping.
- `sw.js`: versioned offline app cache.
- `manifest.webmanifest`: install identity, scope, standalone display, and app icons.
- `icons/`: local SVG icon source and generated PNG icons for install and iOS.