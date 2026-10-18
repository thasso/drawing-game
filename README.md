# Little sketchbook

A static drawing game for fingers, a stylus, or a mouse. Plain HTML, CSS, and JavaScript, with no dependencies, build step, backend, accounts, or external assets.

## Try it locally

Serve this directory with any static web server. For example:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Draw and pick a color. Drawings save into **My Pictures** after each stroke; editing updates the same picture. Starting a new page or opening another picture saves the current one first, without a confirmation dialog. **New page** opens a visual chooser for a blank page, a flower, a butterfly, or a rocket.

The brush and color buttons at the bottom open their choices only when needed. Pinch with two fingers to zoom and move around the page (or use the mouse wheel); the frame button shows the whole page again. Zooming only changes the view, not the saved picture.

Use the trash button to delete the current picture or a picture in the gallery. The undo arrow restores the most recently deleted picture, even after a reload. Deleting another picture replaces that undo history. Untouched blank pages are not added to the gallery.

On coloring pages, each stroke stays in the region where it starts. Outlines stay above the paint. The eraser removes paint without removing the outline. Saved coloring pages retain separate paint and outline layers so they can be reopened and edited.

## Offline and storage

Host these files on an HTTPS static host for phone and iPad use. After the first online visit finishes caching the app, the service worker allows it to reopen offline at the same address. Localhost also supports service workers; a plain HTTP address on your local network does not. Opening `index.html` as a file is not supported.

Drawings are PNG data URLs in `localStorage`, scoped to this browser and origin. They are not uploaded or synced. Changing the hostname or port uses separate storage. Clearing site data removes drawings; private browsing and device storage limits can prevent saving. The app reports save failures. The app retains one deleted picture for undo. This PoC has no export yet.

The service worker uses Cache Storage for app files. Bump the cache version in `sw.js` when changing them, then close existing tabs and reopen to activate an update.

## Files

- `index.html`: canvas, controls, and gallery dialog.
- `style.css`: responsive drawing screen.
- `app.js`: brushes, pointer drawing, coloring layers, and local picture storage.
- `coloring.js`: local outline artwork and coloring-region clipping.
- `sw.js`: offline app cache.