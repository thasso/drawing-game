// Run the actual app in VM globals with a pixel-buffer canvas double, shared storage and a Web Locks double.
// The double stores one color ID per pixel and fills each path's whole bounding box (Bezier control points
// included), so it over-approximates real shapes. It ignores alpha, antialiasing and clip paths; native
// browser rendering is not proven here.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');
const source = ['coloring.js', 'app.js'].map((file) => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const key = 'little-sketchbook-v2';
const images = new Map();
const colorIds = new Map();

function colorId(style) {
  if (!colorIds.has(style)) colorIds.set(style, colorIds.size + 1);
  return colorIds.get(style);
}

function multiply([a, b, c, d, e, f], [g, h, i, j, k, l]) {
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

class Surface {
  constructor(width = 300, height = 150) {
    // `dirty` bounds every nonzero pixel, so compositing skips untouched paper.
    this.w = width; this.h = height; this.px = new Uint32Array(width * height); this.dirty = null;
    this.canvas = this; this.state = { m: [1, 0, 0, 1, 0, 0], fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
      globalAlpha: 1, globalCompositeOperation: 'source-over' };
    this.stack = []; this.path = []; this.dataset = {}; this.style = {}; this.listeners = {};
    return new Proxy(this, {
      get(target, property) {
        if (property in target) return target[property];
        if (property in target.state) return target.state[property];
        if (typeof property === 'symbol') return undefined;
        return () => {};
      },
      set(target, property, value) {
        if (property in target.state) target.state[property] = value; else target[property] = value;
        return true;
      },
    });
  }
  get width() { return this.w; }
  set width(value) { this.w = value; this.px = new Uint32Array(this.w * this.h); this.dirty = null; }
  get height() { return this.h; }
  set height(value) { this.h = value; this.px = new Uint32Array(this.w * this.h); this.dirty = null; }
  getContext() { return this; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  getBoundingClientRect() { return { left: 0, top: 0, right: this.w, bottom: this.h, width: this.w, height: this.h }; }
  setAttribute() {}
  setPointerCapture() {}
  isPointInPath() { return false; }
  save() { this.stack.push({ ...this.state }); }
  restore() { if (this.stack.length) this.state = this.stack.pop(); }
  setTransform(...m) { this.state.m = m; }
  transform(...m) { this.state.m = multiply(this.state.m, m); }
  translate(x, y) { this.transform(1, 0, 0, 1, x, y); }
  scale(x, y) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(angle) { this.transform(Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0); }
  point(x, y) { const [a, b, c, d, e, f] = this.state.m; return [a * x + c * y + e, b * x + d * y + f]; }
  beginPath() { this.path = []; }
  moveTo(x, y) { this.path.push(this.point(x, y)); }
  lineTo(x, y) { this.path.push(this.point(x, y)); }
  bezierCurveTo(...points) { for (let i = 0; i < 6; i += 2) this.path.push(this.point(points[i], points[i + 1])); }
  arc(x, y, r) { for (const [dx, dy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) this.path.push(this.point(x + dx, y + dy)); }
  rect(x, y, w, h) { for (const [px, py] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) this.path.push(this.point(px, py)); }
  box(points, grow = 0) {
    const xs = points.map(([x]) => x), ys = points.map(([, y]) => y);
    return [Math.min(...xs) - grow, Math.min(...ys) - grow, Math.max(...xs) + grow, Math.max(...ys) + grow];
  }
  paint([left, top, right, bottom], value) {
    const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(this.w, Math.ceil(right));
    const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(this.h, Math.ceil(bottom));
    if (x1 <= x0 || y1 <= y0) return;
    for (let y = y0; y < y1; y++) this.px.fill(value, y * this.w + x0, y * this.w + x1);
    if (value) this.grow([x0, y0, x1, y1]);
    else if (this.dirty && x0 <= this.dirty[0] && y0 <= this.dirty[1] && x1 >= this.dirty[2] && y1 >= this.dirty[3]) this.dirty = null;
  }
  grow([x0, y0, x1, y1]) {
    const d = this.dirty;
    this.dirty = d ? [Math.min(d[0], x0), Math.min(d[1], y0), Math.max(d[2], x1), Math.max(d[3], y1)] : [x0, y0, x1, y1];
  }
  fill() { if (this.path.length) this.paint(this.box(this.path), colorId(this.state.fillStyle)); }
  stroke(path2d) {
    if (path2d) {
      // Outline paths become a fixed mark so the outline layer has checkable pixels.
      const y = 40 + parseInt(crypto.createHash('sha1').update(String(path2d.data)).digest('hex').slice(0, 6), 16) % (this.h - 80);
      this.paint([40, y, this.w - 40, y + 4], colorId(this.state.strokeStyle));
    } else if (this.path.length) {
      this.paint(this.box(this.path, this.state.lineWidth / 2), colorId(this.state.strokeStyle));
    }
  }
  fillRect(x, y, w, h) { this.rect(x, y, w, h); const box = this.box(this.path.splice(-4)); this.paint(box, colorId(this.state.fillStyle)); }
  clearRect(x, y, w, h) { this.rect(x, y, w, h); this.paint(this.box(this.path.splice(-4)), 0); }
  drawImage(image) {
    const from = image.px || image.pixels, to = this.px, op = this.state.globalCompositeOperation;
    assert.equal(from.length, to.length, 'drawImage sizes differ');
    if (op === 'destination-in') {
      for (let i = 0; i < to.length; i++) if (!from[i]) to[i] = 0;
      return;
    }
    const box = image.dirty === undefined ? [0, 0, this.w, this.h] : image.dirty;
    if (!box) return;
    for (let y = box[1]; y < box[3]; y++) {
      for (let i = y * this.w + box[0], end = y * this.w + box[2]; i < end; i++) {
        const value = from[i];
        if (op === 'destination-out') { if (value) to[i] = 0; } else if (value) to[i] = value;
      }
    }
    if (op !== 'destination-out') this.grow(box);
  }
  getImageData(x, y, w, h) {
    const data = new Uint8ClampedArray(w * h * 4), view = new Uint32Array(data.buffer);
    for (let row = 0; row < h; row++) view.set(this.px.subarray((y + row) * this.w + x, (y + row) * this.w + x + w), row * w);
    return { width: w, height: h, data };
  }
  putImageData(image, x, y) {
    const view = new Uint32Array(image.data.buffer);
    for (let row = 0; row < image.height; row++) this.px.set(view.subarray(row * image.width, (row + 1) * image.width), (y + row) * this.w + x);
    this.grow([x, y, x + image.width, y + image.height]);
  }
  toDataURL() {
    const url = `data:image/mock,${crypto.createHash('sha1').update(this.px).digest('hex')}`;
    images.set(url, this.px.slice());
    return url;
  }
}

function environment(delay = 0) {
  const data = new Map();
  let tail = Promise.resolve();
  const env = {
    data, failWrite: false,
    storage: {
      getItem(k) { return data.get(k) ?? null; },
      setItem(k, value) { if (env.failWrite) throw Error('quota'); data.set(k, String(value)); },
    },
    locks: {
      request(name, callback) {
        env.onRequest?.();
        const next = tail.then(async () => {
          if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
          return callback();
        });
        tail = next.catch(() => {});
        return next;
      },
    },
    pictures() { return JSON.parse(data.get(key) || '{"pictures":[]}').pictures; },
  };
  return env;
}

function tab(env, { deferImages = false } = {}) {
  const elements = new Map();
  const pendingImages = [];
  function stub(label) {
    if (label === 'canvas' || label === '#canvas') return new Surface(label === '#canvas' ? 1200 : 300, label === '#canvas' ? 1200 : 150);
    const own = {
      label, listeners: {}, style: { setProperty() {} }, classList: { add() {}, remove() {} },
      dataset: {}, hidden: false, open: false, children: [], disabled: false,
      append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; },
      showModal() { this.open = true; }, close() { this.open = false; },
    };
    const proxy = new Proxy(own, {
      get(target, property) {
        if (property in target) return target[property];
        if (property === 'addEventListener') return (type, fn) => { (target.listeners[type] ||= []).push(fn); };
        if (property === 'getContext') return () => proxy;
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
    document, localStorage: env.storage, navigator: { locks: env.locks }, console,
    Path2D: class { constructor(data) { this.data = data; } rect() {} addPath() {} },
    ResizeObserver: class { observe() {} },
    Image: class {
      set src(value) {
        const load = () => {
          if (!images.has(value)) { this.onerror(); return; }
          this.pixels = images.get(value); this.onload();
        };
        if (deferImages) pendingImages.push(load); else load();
      }
    },
    window: { addEventListener() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'runtime.js' });
  const run = (code) => vm.runInContext(code, sandbox);
  const send = (type, id, x = 100, y = 100, pointerType = 'touch', isPrimary = true) => {
    const event = { type, pointerId: id, pointerType, button: 0, isPrimary, clientX: x, clientY: y,
      target: elements.get('#canvas'), preventDefault() {} };
    (elements.get('.drawing-area').listeners[type] || []).forEach((handler) => handler(event));
  };
  let nextPointer = 1;
  return {
    run, elements, send,
    // One completed stroke through the given points, with optional brush settings.
    stroke(points, { brush = 'round', size = 16, color = '#499cde' } = {}) {
      sandbox.settings = { brush, size, color };
      run('brushType = settings.brush; brushSize.value = settings.size; color = settings.color');
      const id = nextPointer++;
      send('pointerdown', id, ...points[0]);
      for (const point of points.slice(1)) send('pointermove', id, ...point);
      send('pointerup', id, ...points.at(-1));
      send('lostpointercapture', id, ...points.at(-1));
    },
    undo() { return Promise.all((elements.get('#undo-stroke').listeners.click || []).map((handler) => handler())); },
    paint() { return run('paintCanvas').px.slice(); },
    outline() { return run('outlineCanvas').px.slice(); },
    flushImages() { pendingImages.splice(0).forEach((load) => load()); },
    async idle() {
      for (;;) {
        const tail = run('persistenceTail');
        await tail;
        if (tail === run('persistenceTail')) return;
      }
    },
    click(element) { return Promise.all((element.listeners.click || []).map((handler) => handler())); },
    get id() { return run('currentId'); },
    get steps() { return run('undoSteps.length'); },
    get disabled() { return elements.get('#undo-stroke').disabled; },
  };
}

function same(left, right, message) {
  assert.ok(left.length === right.length && Buffer.compare(Buffer.from(left.buffer), Buffer.from(right.buffer)) === 0, message);
}

function stored(env, id) {
  return images.get(env.pictures().find((picture) => picture.id === id).paint);
}

async function test(name, body) {
  await body();
  console.log(`PASS ${name}`);
}

(async () => {
  await test('each Undo removes exactly one completed stroke, back to the first', async () => {
    const env = environment(), a = tab(env);
    const blank = a.paint();
    assert.equal(a.disabled, true);
    const snapshots = [];
    a.stroke([[100, 100], [140, 120], [180, 200], [260, 210]], { color: '#ed575e' });
    snapshots.push(a.paint());
    a.stroke([[600, 600], [700, 640]], { color: '#57ad74', size: 40 });
    snapshots.push(a.paint());
    a.stroke([[620, 590], [300, 900], [1190, 1190]], { color: '#9d79cb', size: 4 });
    assert.equal(a.steps, 3);
    assert.equal(a.disabled, false);
    await a.undo();
    same(a.paint(), snapshots[1], 'third stroke undone');
    await a.undo();
    same(a.paint(), snapshots[0], 'second stroke undone');
    assert.equal(a.run('hasDrawing'), true);
    await a.undo();
    same(a.paint(), blank, 'first stroke undone');
    assert.equal(a.run('hasDrawing'), false);
    assert.equal(a.disabled, true);
    await a.undo();
    same(a.paint(), blank, 'extra Undo is harmless');
    await a.idle();
    same(stored(env, a.id), blank, 'undone pixels are saved');
    assert.equal(env.pictures()[0].hasDrawing, false);
  });

  await test('100 ordinary strokes are all undoable; the 101st drops only the oldest', async () => {
    const env = environment(), a = tab(env);
    const blank = a.paint();
    const drawMany = (count) => {
      const snapshots = [];
      for (let index = 0; index < count; index++) {
        const x = 60 + (index % 10) * 110, y = 60 + Math.floor(index / 10) * 105;
        a.stroke([[x, y], [x + 50, y + 20]], { color: index % 2 ? '#ed575e' : '#499cde' });
        snapshots.push(a.paint());
      }
      return snapshots;
    };
    let snapshots = drawMany(100);
    assert.equal(a.steps, 100);
    for (let step = 99; step > 0; step--) { await a.undo(); same(a.paint(), snapshots[step - 1], `step ${step}`); }
    await a.undo();
    same(a.paint(), blank, 'all 100 strokes undone');
    assert.equal(a.run('undoBytes'), 0);
    snapshots = drawMany(101);
    assert.equal(a.steps, 100);
    for (let step = 0; step < 100; step++) await a.undo();
    same(a.paint(), snapshots[0], 'only the oldest stroke is no longer undoable');
    assert.equal(a.disabled, true);
    assert.equal(a.run('undoBytes'), 0);
    await a.idle();
  });

  await test('large strokes stay within the 32 MiB pixel budget by dropping the oldest', async () => {
    const env = environment(), a = tab(env);
    assert.equal(a.run('undoByteBudget'), 32 * 1024 * 1024);
    const snapshots = [];
    for (let index = 0; index < 8; index++) {
      a.stroke([[0, 0], [1199, 1199], [0, 1199], [1199, 0]], { size: 100, color: ['#ed575e', '#f49b38'][index % 2] });
      snapshots.push(a.paint());
      const bytes = a.run('undoSteps.reduce((sum, step) => sum + step.before.data.length, 0)');
      assert.equal(a.run('undoBytes'), bytes);
      assert.ok(bytes <= 32 * 1024 * 1024);
    }
    // A full-page patch is 1200 x 1200 x 4 = 5.76 MB, so five fit.
    assert.equal(a.steps, 5);
    for (let step = 0; step < 5; step++) await a.undo();
    same(a.paint(), snapshots[2], 'returns to the oldest retained state');
    assert.equal(a.run('undoBytes'), 0);
    await a.idle();
  });

  await test('eraser and every brush, including stamp shapes, restore their exact pre-stroke pixels', async () => {
    const env = environment(), a = tab(env);
    a.stroke([[200, 200], [900, 900]], { size: 100, color: '#57ad74' });
    const painted = a.paint();
    a.stroke([[150, 300], [950, 700]], { brush: 'eraser', size: 60 });
    assert.notDeepEqual(a.paint(), painted);
    await a.undo();
    same(a.paint(), painted, 'eraser undone');
    const types = a.run('brushTypes.map(([type]) => type)');
    for (const brush of types) {
      for (const amount of [0, 1, 2]) {
        a.run(`brushAmounts.stars = brushAmounts.hearts = brushAmounts.flowers = brushAmounts.bubbles = brushAmounts.confetti = ${amount}`);
        for (const size of [4, 37, 100]) {
          const before = a.paint();
          a.stroke([[40, 1160], [600, 620], [610, 640], [1180, 20]], { brush, size, color: '#f3ce45' });
          await a.undo();
          same(a.paint(), before, `${brush} ${amount} ${size}`);
        }
      }
    }
    await a.idle();
  });

  await test('no-op eraser strokes and cancelled pinch paint add no history', async () => {
    const env = environment(), a = tab(env);
    a.stroke([[300, 300], [500, 500]], { brush: 'eraser', size: 50 });
    assert.equal(a.steps, 0);
    assert.equal(a.disabled, true);
    a.send('pointerdown', 50, 400, 400);
    a.send('pointermove', 50, 450, 450);
    a.send('pointerdown', 51, 600, 600, 'touch', false);
    a.send('pointerup', 51, 600, 600, 'touch', false);
    a.send('pointerup', 50, 450, 450);
    a.send('lostpointercapture', 50, 450, 450);
    assert.equal(a.steps, 0);
    assert.equal(a.disabled, true);
    a.stroke([[100, 100], [200, 200]]);
    const one = a.paint();
    a.send('pointerdown', 60, 700, 700);
    a.send('pointerdown', 61, 800, 800, 'touch', false);
    a.send('pointerup', 61, 800, 800, 'touch', false);
    a.send('pointerup', 60, 700, 700);
    assert.equal(a.steps, 1);
    same(a.paint(), one);
    await a.idle();
  });

  await test('coloring outlines are never changed by strokes or Undo', async () => {
    const env = environment(), a = tab(env);
    a.run("blankPage('owl')");
    const outline = a.outline();
    assert.ok(outline.some(Boolean));
    const blank = a.paint();
    a.stroke([[100, 100], [1100, 1100]], { size: 80, color: '#ed575e' });
    a.stroke([[100, 1100], [1100, 100]], { brush: 'eraser', size: 80 });
    await a.undo(); await a.undo();
    same(a.paint(), blank);
    same(a.outline(), outline);
    await a.idle();
    assert.equal(env.pictures()[0].template, 'owl');
  });

  await test('Undo is ignored during an active stroke and while a picture loads', async () => {
    const env = environment(), a = tab(env);
    a.stroke([[100, 100], [200, 200]]);
    a.send('pointerdown', 70, 500, 500);
    const active = a.paint();
    await a.undo();
    same(a.paint(), active, 'active stroke keeps its paint');
    a.send('pointerup', 70, 500, 500);
    assert.equal(a.steps, 2);
    await a.idle();
    const b = tab(env, { deferImages: true });
    assert.equal(b.disabled, true);
    b.flushImages();
    same(b.paint(), a.paint(), 'reload opens the saved draft');
    assert.equal(b.steps, 0, 'history is not persisted');
    const c = tab(environment(), { deferImages: true });
    c.stroke([[100, 100], [200, 200]]);
    await c.idle();
    c.run('blankPage()');
    c.stroke([[700, 700], [900, 900]]);
    const drawn = c.paint();
    c.run('loadPicture(state.pictures[0])');
    assert.equal(c.disabled, true);
    await c.undo();
    same(c.paint(), drawn, 'Undo waits while the next picture loads');
    assert.equal(c.steps, 1);
    c.flushImages();
    assert.equal(c.steps, 0);
    assert.equal(c.disabled, true);
  });

  await test('drawing after Undo keeps the remaining history in order', async () => {
    const env = environment(), a = tab(env);
    const blank = a.paint();
    a.stroke([[100, 100], [300, 100]], { color: '#ed575e' });
    const first = a.paint();
    a.stroke([[100, 300], [300, 300]], { color: '#57ad74' });
    await a.undo();
    a.stroke([[100, 500], [300, 500]], { color: '#499cde' });
    assert.equal(a.steps, 2);
    await a.undo();
    same(a.paint(), first);
    await a.undo();
    same(a.paint(), blank);
    await a.idle();
  });

  await test('rapid Undo taps and new strokes during delayed locks save the latest canvas', async () => {
    const env = environment(5), a = tab(env);
    a.stroke([[100, 100], [300, 100]], { color: '#ed575e' });
    await new Promise(setImmediate);
    assert.equal(a.run('saving'), true);
    const first = a.paint();
    a.stroke([[100, 300], [300, 300]], { color: '#57ad74' });
    a.stroke([[100, 500], [300, 500]], { color: '#499cde' });
    await a.undo(); await a.undo();
    same(a.paint(), first);
    await a.idle();
    same(stored(env, a.id), first, 'two quick Undos are saved');
    a.stroke([[600, 600], [700, 700]]);
    await new Promise(setImmediate);
    await a.undo();
    a.stroke([[900, 900], [1000, 1000]], { color: '#9d79cb' });
    await a.idle();
    same(stored(env, a.id), a.paint(), 'Undo then draw is saved as one canvas');
    assert.equal(a.steps, 2);
    assert.equal(env.pictures().length, 1);
  });

  await test('first-stroke Undo before its save runs never adds a gallery picture', async () => {
    const env = environment(5), a = tab(env);
    a.stroke([[100, 100], [300, 100]]);
    await a.undo();
    await a.idle();
    assert.equal(env.pictures().length, 0);
    assert.equal(a.run('hasDrawing'), false);
  });

  await test('new page and open reset history only after the canvas is replaced', async () => {
    const env = environment(5), a = tab(env);
    a.stroke([[100, 100], [300, 100]], { color: '#ed575e' });
    await a.idle();
    const firstId = a.id, first = a.paint();
    a.stroke([[100, 300], [300, 300]], { color: '#57ad74' });
    // Lock requests: the stroke save, the navigation flush, then its draft write. Undo during that write.
    let requests = 0, undone = null;
    env.onRequest = () => { if (++requests === 3) queueMicrotask(() => { undone = a.undo(); }); };
    await a.click(a.elements.get('#page-choices').children[0]); await undone; await a.idle();
    env.onRequest = null;
    assert.ok(requests > 3, 'navigation saved again after the Undo');
    assert.notEqual(a.id, firstId);
    assert.equal(a.steps, 0);
    assert.equal(a.disabled, true);
    same(stored(env, firstId), first, 'outgoing picture keeps the undone pixels');
    a.stroke([[500, 500], [600, 600]]);
    await a.idle();
    await a.click(a.elements.get('#gallery-button'));
    const firstCard = a.elements.get('#pictures').children.find((card) => card.children?.[0]?.children?.[0]?.src === env.pictures()[0].image);
    await a.click(firstCard.children[0]); await a.idle();
    assert.equal(a.id, firstId);
    assert.equal(a.steps, 0, 'opened picture has no history from the previous canvas');
    await a.undo();
    same(a.paint(), first, 'Undo cannot apply another picture history');
  });

  await test('failed navigation, delete or save keeps the history usable', async () => {
    const env = environment(5), a = tab(env);
    a.stroke([[100, 100], [300, 100]], { color: '#ed575e' });
    await a.idle();
    const id = a.id, first = a.paint();
    a.stroke([[100, 300], [300, 300]], { color: '#57ad74' });
    env.failWrite = true;
    await a.click(a.elements.get('#page-choices').children[0]); await a.idle();
    await a.run('deletePicture(currentId)'); await a.idle();
    assert.equal(a.id, id);
    assert.equal(a.steps, 2);
    await a.undo(); await a.idle();
    same(a.paint(), first);
    env.failWrite = false;
    await a.run('saveCurrentPicture()');
    same(stored(env, id), first, 'retry saves the undone canvas');
    await a.run('deletePicture(currentId)'); await a.idle();
    assert.equal(a.steps, 0, 'deleting the open picture clears its canvas and history');
  });

  await test('Undo after a pending conflict-copy save edits only this window copy', async () => {
    const env = environment(5), a = tab(env);
    a.stroke([[100, 100], [300, 100]], { color: '#ed575e' });
    await a.idle();
    const b = tab(env);
    const original = b.id, opened = b.paint();
    a.stroke([[100, 500], [300, 500]], { color: '#57ad74' });
    await a.idle();
    const otherWindow = stored(env, original);
    b.stroke([[600, 100], [800, 100]], { color: '#9d79cb' });
    await new Promise(setImmediate);
    const afterFirst = b.paint();
    b.stroke([[600, 300], [800, 300]], { color: '#499cde' });
    await b.undo(); // The queued save has not resolved the fork yet.
    await b.idle();
    assert.notEqual(b.id, original);
    same(stored(env, b.id), afterFirst, 'the copy holds the undone canvas');
    same(stored(env, original), otherWindow, 'the other window picture is untouched');
    await b.undo(); await b.idle();
    same(b.paint(), opened);
    same(stored(env, b.id), opened);
    same(stored(env, original), otherWindow);
    assert.equal(env.pictures().length, 2);
  });
})().catch((error) => { console.error(error); process.exitCode = 1; });
