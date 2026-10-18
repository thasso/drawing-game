# Little sketchbook

A static drawing game for fingers, a stylus, or a mouse. Plain HTML, CSS, and JavaScript, with no dependencies, build step, backend, accounts, or external assets.

## Try it locally

Serve this directory with any static web server. For example:

```sh
python3 -m http.server 8080
```

Open http://localhost:8080. Draw and pick a color. Drawings save into **My Pictures** after each stroke; editing updates the same picture. Starting a new page or opening another picture saves the current one first, without a confirmation dialog. The first tile in **My Pictures** is **New page**, which opens a visual chooser for a blank page or a coloring page: a flower, butterfly, rocket, rabbit, kitten, puppy, fox, owl, or turtle.

The brush and color buttons at the bottom open their choices only when needed. Pinch with two fingers to zoom and move around the page (or use the mouse wheel); the frame button shows the whole page again. Zooming only changes the view, not the saved picture.

The sparkle tile at the end of the brush choices turns glitter on or off. It starts off. While it is on, new strokes with every brush except the eraser paint as glitter in the chosen color: small deeper and brighter flecks, white glints, and a few sparkles, only where the stroke paints. Earlier strokes keep their look, and the eraser removes glitter like any paint. While glitter is on, painted parts of the page also twinkle: fixed spots light up one after another with a soft glow and fade again. The twinkle is only on screen, never on the outlines, and is not saved; saved pictures keep the still glitter. It pauses while the app is in the background, and with reduced motion the glow stays still. Glitter pictures take more storage space: a page covered in glitter needs about ten times more than plain paint, so fewer of them fit before saving fails.

The orange undo arrow at the start of the bottom tools takes back the last finished stroke: everything painted from touching the page until lifting the finger, pen, or mouse, including a stamp or eraser stroke. Tap it again to go further back. Each open page keeps up to 100 strokes or 32 MiB of earlier pixels, whichever runs out first; a stroke uses the pixels of the rectangle around it, so long sweeping strokes use more, and at least five full-page strokes always fit. When either limit is reached, the oldest stroke can no longer be undone. Strokes that change nothing and paint dropped by a two-finger pinch are not counted. An undo saves like a stroke, including while earlier saves wait. Undoing the first stroke shows the page as it was before, but a picture already in **My Pictures** stays there. Stroke history is kept in memory only: reloading, starting a new page, opening a picture, or deleting the open picture clears it. There is no redo.

Open **My Pictures** and use a picture's trash button to delete it. The undo arrow restores the most recently deleted picture, even after a reload. Deleting another picture replaces that undo history. Untouched blank pages are not added to the gallery.

On coloring pages, each stroke stays in the region where it starts. Outlines stay above the paint. The eraser removes paint without removing the outline. Saved coloring pages retain separate paint and outline layers so they can be reopened and edited.

## GitHub Pages deployment

The expected public site URL is https://thasso.github.io/drawing-game/. Before the first deployment, make the repository public and set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. The workflow validates and packages the static app on pull requests to `main`; it deploys after each push to `main` and on a manually dispatched run from `main`. It stages only the runtime files and `icons/` folder—no repository root or development files are published.

GitHub Pages serves this project under `/drawing-game/`; app asset URLs are relative so the install and offline cache work below that path. Drawings created in an HTTP preview stay in that preview origin's browser storage and do not migrate to GitHub Pages.

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

Saving requires the browser's Web Locks API on HTTPS or localhost. Current Safari, Firefox, and Chromium support it. Without it the app keeps paint on the canvas and reports that it cannot save safely; starting or opening another page is blocked until saving works. Drawing continues while storage writes are pending. Saves queue the latest completed paint, and page switches wait until that paint is saved. Same-origin tabs serialize storage changes and merge only their own edits. If two windows edit the same picture, the later conflicting save creates a separate copy instead of overwriting either drawing. A stale delete or undo is refused if its target or delete history changed in another window. Reopen My Pictures, then open the latest picture before retrying.

The coordinated collection uses a new storage key. It reads the previous sketchbook format until the first successful save and leaves that legacy key unchanged as a fallback copy. Close and reload old app windows when updating: drawings made by an old version after this import remain in the legacy key and do not join the new collection automatically. Keeping the legacy copy uses additional local storage and can make a full-device save fail earlier.

The service worker uses Cache Storage for app files. Bump the cache version in `sw.js` when changing them, then close existing tabs and reopen to activate an update.

## Files

- `index.html`: canvas, controls, and gallery dialog.
- `style.css`: responsive drawing screen.
- `app.js`: brushes, pointer drawing, coloring layers, and local picture storage.
- `coloring.js`: local outline artwork and coloring-region clipping.
- `sw.js`: versioned offline app cache.
- `manifest.webmanifest`: install identity, scope, standalone display, and app icons.
- `icons/`: local SVG icon source and generated PNG icons for install and iOS.
- `scripts/`: release validator and Node tests for storage, stroke undo, and coloring-page data.