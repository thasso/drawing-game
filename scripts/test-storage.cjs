// Run the actual app in separate VM globals with shared storage and a Web Locks double.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = ['coloring.js', 'app.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const key = 'little-sketchbook-v2';
const legacyKey = 'little-sketchbook-v1';

function environment(delay = 0) {
  const data = new Map();
  let tail = Promise.resolve();
  const env = {
    data, failRead: false, failWrite: false,
    storage: {
      getItem(k) { if (env.failRead) throw Error('blocked read'); return data.get(k) ?? null; },
      setItem(k, value) { if (env.failWrite) throw Error('quota'); data.set(k, String(value)); },
    },
    locks: {
      request(name, callback) {
        assert.equal(name, key);
        env.onRequest?.();
        const next = tail.then(async () => {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          return callback();
        });
        tail = next.catch(() => {});
        return next;
      },
    },
    pictures() { return JSON.parse(data.get(key) || data.get(legacyKey) || '{"pictures":[]}').pictures; },
    hold() {
      let release;
      tail = new Promise((resolve) => { release = resolve; });
      return release;
    },
  };
  return env;
}

function tab(env, name, { locks = true, deferImages = false, eventPaint = false } = {}) {
  const elements = new Map();
  const pendingImages = [];
  let paint = `data:${name}:blank`;
  function stub(label) {
    const own = {
      label, listeners: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} },
      dataset: {}, hidden: false, open: false, children: [], data: '', captures: 0,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      showModal() { this.open = true; }, close() { this.open = false; },
      setPointerCapture() { this.captures++; },
    };
    const proxy = new Proxy(own, {
      get(target, property) {
        if (property in target) return target[property];
        if (property === 'addEventListener') return (type, fn) => { (target.listeners[type] ||= []).push(fn); };
        if (property === 'getContext') return () => proxy;
        if (property === 'toDataURL') return () => eventPaint ? `data:image/mock,${target.data}` : paint;
        if (eventPaint && property === 'clearRect') return () => { target.data = ''; };
        if (eventPaint && property === 'drawImage') return (image) => { target.data += image.data || ''; };
        if (eventPaint && (property === 'fill' || property === 'fillRect')) return () => { target.data += 'mark;'; };
        if (property === 'getBoundingClientRect') return () => ({ left: 0, top: 0, width: 1200, height: 1200 });
        if (property === 'querySelectorAll') return () => [];
        if (property === 'isPointInPath' || property === 'contains') return () => false;
        if (property === 'content') return { cloneNode: () => stub('fragment') };
        if (['width', 'height', 'clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'].includes(property)) return 1200;
        if (property === 'offsetLeft' || property === 'offsetTop') return 0;
        if (typeof property === 'symbol') return undefined;
        return () => proxy;
      },
    });
    return proxy;
  }
  const document = {
    querySelector(selector) { if (!elements.has(selector)) elements.set(selector, stub(selector)); return elements.get(selector); },
    querySelectorAll() { return []; }, createElement: stub, addEventListener() {}, activeElement: null,
  };
  const sandbox = {
    document, localStorage: env.storage, navigator: locks ? { locks: env.locks } : {}, console,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
    Path2D: class { rect() {} addPath() {} }, ResizeObserver: class { observe() {} },
    Image: class {
      set src(value) {
        const load = () => { paint = value; this.data = value.replace('data:image/mock,', ''); this.onload(); };
        if (deferImages) pendingImages.push(load); else load();
      }
    },
    window: { addEventListener() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'runtime.js' });
  const run = (code) => vm.runInContext(code, sandbox);
  return {
    run, elements,
    async draw(label) { paint = `data:${name}:${label}`; return run('hasDrawing = true; saveCurrentPicture()'); },
    open(id) { sandbox.selectedId = id; run('loadPicture(state.pictures.find(p => p.id === selectedId))'); },
    flushImages() { pendingImages.splice(0).forEach((load) => load()); },
    send(type, id, pointerType = 'touch', isPrimary = true) {
      const stage = elements.get('.drawing-area');
      const event = { type, pointerId: id, pointerType, button: 0, isPrimary, clientX: 100, clientY: 100,
        target: elements.get('#canvas'), preventDefault() {} };
      (stage.listeners[type] || []).forEach((handler) => handler(event));
    },
    async idle() {
      // New queued work may have been appended while the previous tail ran.
      for (;;) {
        const tail = run('typeof persistenceTail === "undefined" ? Promise.resolve() : persistenceTail');
        await tail;
        if (run('typeof persistenceTail === "undefined"') || tail === run('persistenceTail')) return;
      }
    },
    click(element) { return Promise.all((element.listeners.click || []).map((handler) => handler())); },
    get id() { return run('currentId'); },
    get status() { return elements.get('#status').textContent; },
  };
}

async function test(name, body) {
  await body();
  console.log(`PASS ${name}`);
}

(async () => {
  await test('three rapid star taps all paint while delayed persistence catches up', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.run("brushType = 'stars'");
    a.send('pointerdown', 1); a.send('pointerup', 1);
    await new Promise(setImmediate);
    assert.equal(a.run('saving'), true);
    a.send('pointerdown', 2); a.send('pointerup', 2);
    a.send('pointerdown', 3); a.send('pointerup', 3);
    assert.equal(a.elements.get('#canvas').captures, 3);
    assert.equal(a.run('captureDraft().paint'), 'data:image/mock,mark;mark;mark;');
    await a.idle();
    assert.equal(env.pictures().length, 1);
    assert.equal(env.pictures()[0].paint, a.run('captureDraft().paint'));
  });
  await test('active next stroke is not captured provisionally or rebased by a pending save', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1);
    await new Promise(setImmediate);
    a.send('pointerdown', 2);
    await a.idle();
    assert.equal(env.pictures()[0].paint, 'data:image/mock,mark;');
    assert.equal(a.run('captureDraft().paint'), 'data:image/mock,mark;mark;');
    a.send('pointerup', 2);
    await a.idle();
    assert.equal(env.pictures()[0].paint, a.run('captureDraft().paint'));
    assert.equal(a.run('currentPicture.id'), a.id);
  });
  await test('pending-save pinch cancels provisional paint before queued saves capture it', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1);
    await new Promise(setImmediate);
    a.send('pointerdown', 2);
    a.send('pointerdown', 3, 'touch', false);
    a.send('pointerup', 3, 'touch', false); a.send('pointerup', 2);
    await a.idle();
    assert.equal(env.pictures()[0].paint, 'data:image/mock,mark;');
    assert.equal(a.run('captureDraft().paint'), env.pictures()[0].paint);
  });
  await test('queued local paint follows a conflict fork without replacing either base', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1); await a.idle();
    const b = tab(env, 'B', { eventPaint: true });
    a.send('pointerdown', 2); a.send('pointerup', 2); await a.idle();
    b.send('pointerdown', 3); b.send('pointerup', 3);
    await new Promise(setImmediate);
    b.send('pointerdown', 4); b.send('pointerup', 4);
    await b.idle();
    assert.notEqual(a.id, b.id);
    assert.equal(env.pictures().length, 2);
    assert.equal(env.pictures().find(p => p.id === b.id).paint, 'data:image/mock,mark;mark;mark;');
    assert.equal(env.pictures().find(p => p.id === a.id).paint, 'data:image/mock,mark;mark;');
    assert.equal(b.run('currentPicture.id'), b.id);
  });
  await test('queued delete cannot target another window picture after a pending conflict fork', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1); await a.idle();
    const b = tab(env, 'B', { eventPaint: true });
    a.send('pointerdown', 2); a.send('pointerup', 2); await a.idle();
    b.send('pointerdown', 3); b.send('pointerup', 3);
    await new Promise(setImmediate);
    await b.run('deletePicture(currentId)'); await b.idle();
    assert.equal(env.pictures().length, 2);
    assert.notEqual(a.id, b.id);
    assert.match(b.status, /changed while waiting/);
  });
  await test('new-page click waits for latest paint, including input during draft write', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1);
    await new Promise(setImmediate);
    const original = a.id;
    let requests = 0;
    env.onRequest = () => {
      if (++requests === 2) queueMicrotask(() => { a.send('pointerdown', 3); a.send('pointerup', 3); });
    };
    const navigation = a.click(a.elements.get('#page-choices').children[0]);
    a.send('pointerdown', 2); a.send('pointerup', 2);
    await navigation; await a.idle();
    assert.notEqual(a.id, original);
    assert.equal(a.run('hasDrawing'), false);
    assert.equal(env.pictures().find(p => p.id === original).paint, 'data:image/mock,mark;mark;mark;');
  });
  await test('gallery/open handlers wait for pending paint and preserve the outgoing canvas', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1); await a.idle();
    const target = a.id;
    a.run('blankPage()');
    a.send('pointerdown', 2); a.send('pointerup', 2); await a.idle();
    const outgoing = a.id;
    a.send('pointerdown', 3); a.send('pointerup', 3);
    const gallery = a.click(a.elements.get('#gallery-button'));
    await gallery;
    assert.equal(a.elements.get('#gallery').open, true);
    const openButton = a.elements.get('#pictures').children.at(-1).children[0];
    const opening = a.click(openButton);
    a.send('pointerdown', 4); a.send('pointerup', 4);
    await opening; await a.idle();
    assert.equal(a.id, target);
    assert.equal(a.run('captureDraft().paint'), 'data:image/mock,mark;');
    assert.equal(env.pictures().find(p => p.id === outgoing).paint, 'data:image/mock,mark;mark;mark;');
  });
  await test('failed queued new/open navigation never clears newer paint', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1); await a.idle();
    await a.click(a.elements.get('#gallery-button'));
    const openButton = a.elements.get('#pictures').children[1].children[0];
    const id = a.id;
    a.send('pointerdown', 2); a.send('pointerup', 2);
    env.failWrite = true;
    const newPage = a.click(a.elements.get('#page-choices').children[0]);
    const opening = a.click(openButton);
    a.send('pointerdown', 3); a.send('pointerup', 3);
    await Promise.all([newPage, opening]); await a.idle();
    assert.equal(a.id, id);
    assert.equal(a.run('captureDraft().paint'), 'data:image/mock,mark;mark;mark;');
    assert.match(a.status, /Could not save/);
    env.failWrite = false;
    await a.run('saveCurrentPicture()');
    assert.equal(env.pictures()[0].paint, a.run('captureDraft().paint'));
  });
  await test('delete and undo cannot clear new strokes arriving during their writes', async () => {
    const env = environment(5), a = tab(env, 'A', { eventPaint: true });
    a.send('pointerdown', 1); a.send('pointerup', 1); await a.idle();
    const original = a.id;
    env.onRequest = () => {
      env.onRequest = null;
      queueMicrotask(() => { a.send('pointerdown', 2); a.send('pointerup', 2); });
    };
    await a.run('deletePicture(currentId)'); await a.idle();
    assert.notEqual(a.id, original);
    assert.equal(a.run('hasDrawing'), true);
    assert.equal(env.pictures()[0].paint, 'data:image/mock,mark;mark;');
    a.run('blankPage()');
    env.onRequest = () => {
      env.onRequest = null;
      queueMicrotask(() => { a.send('pointerdown', 3); a.send('pointerup', 3); });
    };
    await a.run('undoDelete()'); await a.idle();
    assert.equal(a.run('captureDraft().paint'), 'data:image/mock,mark;');
    assert.notEqual(a.id, original);
    assert.equal(env.pictures().length, 3);
  });
  await test('stale blank gallery save preserves another tab drawing', async () => {
    const env = environment(), a = tab(env, 'A'), b = tab(env, 'B');
    await a.draw('one');
    await b.run('saveCurrentPicture()');
    assert.equal(env.pictures().length, 1);
    assert.equal(env.pictures()[0].id, a.id);
    assert.equal(b.run('state.pictures.length'), 1);
  });
  await test('overlapping independent saves serialize and keep both pictures', async () => {
    const env = environment(), a = tab(env, 'A'), b = tab(env, 'B');
    const release = env.hold();
    const saves = [a.draw('one'), b.draw('two')];
    assert.equal(env.pictures().length, 0);
    const queued = a.run('saveCurrentPicture()');
    release();
    assert.deepEqual(await Promise.all([...saves, queued]), [true, true, true]);
    assert.equal(env.pictures().length, 2);
    assert.equal(new Set(env.pictures().map(p => p.id)).size, 2);
  });
  await test('stale deletion and undo preserve unrelated pictures', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('one');
    const b = tab(env, 'B');
    a.run('blankPage()');
    await a.draw('two');
    await b.run('deletePicture(currentId)');
    assert.deepEqual(env.pictures().map(p => p.id), [a.id]);
    a.run('blankPage()');
    await a.draw('three');
    await b.run('undoDelete()');
    assert.equal(env.pictures().length, 3);
    await b.run('saveCurrentPicture()');
    assert.equal(env.pictures().length, 3);
  });
  await test('overlapping edits of a restored picture keep both versions', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const b = tab(env, 'B');
    const originalId = a.id;
    const release = env.hold();
    const saves = [a.draw('edit-a'), b.draw('edit-b')];
    release();
    await Promise.all(saves);
    assert.equal(env.pictures().length, 2);
    assert.equal(a.id, originalId);
    assert.notEqual(b.id, originalId);
    assert.deepEqual(env.pictures().map(p => p.paint).sort(), ['data:A:edit-a', 'data:B:edit-b']);
    assert.match(b.status, /separate copy/);
    await b.draw('next');
    assert.equal(env.pictures().length, 2);
  });
  await test('refreshing gallery does not rebase a stale canvas onto another edit', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const b = tab(env, 'B');
    await a.draw('newer');
    await b.run('saveCurrentPicture()'); // Unchanged old paint must not replace newer paint.
    assert.equal(env.pictures()[0].paint, 'data:A:newer');
    await b.draw('stale-edit');
    assert.equal(env.pictures().length, 2);
  });
  await test('stale current-picture delete is refused, including after gallery refresh', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const b = tab(env, 'B');
    await a.draw('newer');
    await b.run('saveCurrentPicture()');
    const id = b.id;
    await b.run('deletePicture(currentId)');
    assert.equal(b.id, id);
    assert.equal(b.run('hasDrawing'), true);
    assert.equal(env.pictures()[0].paint, 'data:A:newer');
    assert.match(b.status, /changed in another window/);
  });
  await test('editing a deleted picture saves a new copy; stale undo cannot overwrite it', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const b = tab(env, 'B');
    await a.run('deletePicture(currentId)');
    await b.draw('after-delete');
    assert.equal(env.pictures().length, 1);
    await a.run('undoDelete()');
    assert.equal(env.pictures().length, 2);
  });
  await test('stale undo-history replacement is refused without deleting its target', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('one');
    a.run('blankPage()'); await a.draw('two');
    const b = tab(env, 'B');
    await a.run('deletePicture(state.pictures[0].id)');
    await b.run('deletePicture(currentId)');
    assert.equal(env.pictures().length, 1);
    assert.match(b.status, /history changed/);
  });
  await test('write/read failures retain canvas, IDs and durable collection; retry succeeds', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const raw = env.data.get(key), id = a.id;
    env.failWrite = true;
    assert.equal(await a.draw('unsaved'), false);
    await a.run('deletePicture(currentId)');
    assert.equal(a.id, id);
    assert.equal(a.run('captureDraft().paint'), 'data:A:unsaved');
    assert.equal(env.data.get(key), raw);
    env.failWrite = false; env.failRead = true;
    assert.equal(await a.run('saveCurrentPicture()'), false);
    env.failRead = false;
    assert.equal(await a.run('saveCurrentPicture()'), true);
    assert.equal(env.pictures()[0].paint, 'data:A:unsaved');
  });
  await test('conflict-fork write failure does not change IDs or discard unsaved paint', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    const b = tab(env, 'B'), id = b.id;
    await a.draw('newer');
    env.failWrite = true;
    assert.equal(await b.draw('conflict'), false);
    assert.equal(b.id, id);
    assert.equal(b.run('captureDraft().paint'), 'data:B:conflict');
    assert.equal(env.pictures().length, 1);
    env.failWrite = false;
    assert.equal(await b.run('saveCurrentPicture()'), true);
    assert.equal(env.pictures().length, 2);
  });
  await test('failed undo preserves delete history for a later retry', async () => {
    const env = environment(), a = tab(env, 'A');
    await a.draw('original');
    await a.run('deletePicture(currentId)');
    env.failWrite = true;
    await a.run('undoDelete()');
    assert.equal(env.pictures().length, 0);
    assert.equal(a.run('!!state.deleted'), true);
    env.failWrite = false;
    await a.run('undoDelete()');
    assert.equal(env.pictures().length, 1);
  });
  await test('pinch rolls back paint without saving; next single finger can save', async () => {
    const env = environment(), a = tab(env, 'A');
    a.send('pointerdown', 1);
    a.send('pointermove', 1);
    a.send('pointerdown', 2, 'touch', false);
    a.send('pointermove', 1);
    a.send('pointerup', 2, 'touch', false);
    a.send('pointerup', 1);
    a.send('lostpointercapture', 1);
    assert.equal(env.data.size, 0);
    assert.equal(a.run('hasDrawing'), false);
    a.send('pointerdown', 3);
    a.send('pointerup', 3);
    await new Promise(setImmediate);
    assert.equal(env.pictures().length, 1);
  });
  await test('coloring layers reopen and eraser composites paint only', async () => {
    const env = environment(), a = tab(env, 'A');
    a.run("blankPage('flower')");
    await a.draw('flower-paint');
    assert.equal(env.pictures()[0].template, 'flower');
    const b = tab(env, 'B');
    assert.equal(b.run('activeTemplate.id'), 'flower');
    b.run("activeBrush = makeBrush('eraser', 20, '#000'); activeRegion = 0; renderStroke()");
    assert.equal(b.run('paintContext.globalCompositeOperation'), 'destination-out');
    assert.notEqual(b.run('outlineContext.globalCompositeOperation'), 'destination-out');
    assert.equal(b.run('captureDraft().paint'), 'data:A:flower-paint');
  });
  await test('unavailable Web Locks refuses unsafe writes and preserves paint', async () => {
    const env = environment(), a = tab(env, 'A', { locks: false });
    assert.equal(await a.draw('unsaved'), false);
    assert.equal(a.run('hasDrawing'), true);
    assert.equal(env.data.size, 0);
    assert.match(a.status, /updated browser/);
  });
  await test('legacy single-layer import is deterministic, readable and write-failure-safe', async () => {
    const env = environment();
    const legacy = JSON.stringify({ draft: 'data:legacy', pictures: [{ image: 'data:legacy', created: 1 }] });
    env.data.set(legacyKey, legacy);
    const a = tab(env, 'A', { deferImages: true }), b = tab(env, 'B');
    assert.equal(await a.run('saveCurrentPicture()'), false); // Loading guard.
    a.flushImages();
    assert.equal(a.id, b.id);
    assert.equal(a.id, a.run('state.pictures[0].id'));
    env.failWrite = true;
    assert.equal(await a.draw('failed-import'), false);
    assert.equal(env.data.get(legacyKey), legacy);
    assert.equal(env.data.has(key), false);
    env.failWrite = false;
    await a.run('saveCurrentPicture()');
    await b.draw('other-import');
    assert.equal(env.pictures().length, 2);
    assert.equal(env.data.get(legacyKey), legacy);
    env.data.set(legacyKey, '{"pictures":[]}'); // An old app cannot erase v2.
    assert.equal(env.pictures().length, 2);
  });
  await test('corrupt storage is never replaced by an empty collection', async () => {
    const env = environment(); env.data.set(key, '{broken');
    const a = tab(env, 'A');
    assert.equal(await a.draw('unsaved'), false);
    assert.equal(env.data.get(key), '{broken');
  });
})().catch((error) => { console.error(error); process.exitCode = 1; });
