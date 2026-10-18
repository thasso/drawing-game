// Run the actual app in separate VM globals with shared storage and a Web Locks double.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = ['coloring.js', 'app.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const key = 'little-sketchbook-v2';
const legacyKey = 'little-sketchbook-v1';

function environment() {
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
        const next = tail.then(callback);
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

function tab(env, name, { locks = true, deferImages = false } = {}) {
  const elements = new Map();
  const pendingImages = [];
  let paint = `data:${name}:blank`;
  function stub(label) {
    const own = {
      label, listeners: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} },
      dataset: {}, hidden: false, open: false,
    };
    const proxy = new Proxy(own, {
      get(target, property) {
        if (property in target) return target[property];
        if (property === 'addEventListener') return (type, fn) => { (target.listeners[type] ||= []).push(fn); };
        if (property === 'getContext') return () => proxy;
        if (property === 'toDataURL') return () => paint;
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
    Path2D: class { rect() {} addPath() {} }, ResizeObserver: class { observe() {} },
    Image: class {
      set src(value) {
        const load = () => { paint = value; this.onload(); };
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
    get id() { return run('currentId'); },
    get status() { return elements.get('#status').textContent; },
  };
}

async function test(name, body) {
  await body();
  console.log(`PASS ${name}`);
}

(async () => {
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
    assert.equal(a.run('saving'), true);
    assert.equal(await a.run('saveCurrentPicture()'), false);
    release();
    assert.deepEqual(await Promise.all(saves), [true, true]);
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
