const canvas = document.querySelector('#canvas');
const context = canvas.getContext('2d');
const strokeCanvas = document.createElement('canvas');
const baseCanvas = document.createElement('canvas');
strokeCanvas.width = baseCanvas.width = canvas.width;
strokeCanvas.height = baseCanvas.height = canvas.height;
const strokeContext = strokeCanvas.getContext('2d');
const baseContext = baseCanvas.getContext('2d');
const paintCanvas = document.createElement('canvas');
const outlineCanvas = document.createElement('canvas');
paintCanvas.width = outlineCanvas.width = canvas.width;
paintCanvas.height = outlineCanvas.height = canvas.height;
const paintContext = paintCanvas.getContext('2d');
const outlineContext = outlineCanvas.getContext('2d');
let activeTemplate = null;
let activeRegion = -1;
const brushSize = document.querySelector('#brush-size');
const brushOpacity = document.querySelector('#brush-opacity');
let strokeOpacity = 1;
const status = document.querySelector('#status');
const gallery = document.querySelector('#gallery');
const brushCursor = document.querySelector('#brush-cursor');
let cursorPosition = null;
let cursorTipKey = '';
// Older app instances only know v1 and cannot overwrite the coordinated collection.
const storageKey = 'little-sketchbook-v2';
const legacyStorageKey = 'little-sketchbook-v1';
// Rows of eight: bright, light, then earthy and dark. Light colors get a rim and a dark selection dot.
const colors = [
  ['Red', '#ed575e'],
  ['Orange', '#f49b38'],
  ['Yellow', '#f3ce45', true],
  ['Lime', '#a6cf4b'],
  ['Green', '#57ad74'],
  ['Teal', '#36b3a8'],
  ['Blue', '#499cde'],
  ['Purple', '#9d79cb'],
  ['Pink', '#ec8fba'],
  ['Rose', '#f8cde0', true],
  ['Peach', '#ffc9a8', true],
  ['Lemon', '#fff1a3', true],
  ['Mint', '#c4ecd2', true],
  ['Sky', '#c4e3f8', true],
  ['Lilac', '#ddcdf3', true],
  ['White', '#ffffff', true],
  ['Light skin', '#f6d1b1', true],
  ['Tan', '#d9a070'],
  ['Brown', '#95603a'],
  ['Dark brown', '#5a3824'],
  ['Forest', '#2f7d4f'],
  ['Ink', '#263f54'],
  ['Grey', '#9aa6af'],
  ['Black', '#222428'],
];
let color = '#499cde';
let brushType = 'round';
let activeBrush = null;
let pointer = null;
let pointerType = null;
let hadDrawing = false;
let lastPoint = null;
let loading = false;
let saving = false;
let persistenceTail = Promise.resolve();
let canvasVersion = 0;
const strokeWaiters = [];
let currentPicture = null;
let hasDrawing = false;
let currentId = newPictureId();
let state = { draft: null, pictures: [], deleted: null };

function newPictureId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function say(message) {
  status.textContent = message;
}

function readState() {
  const raw = localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);
  if (raw === null) return { draft: null, pictures: [], deleted: null };
  const saved = JSON.parse(raw);
  if (!saved || !Array.isArray(saved.pictures)) throw new Error('Invalid sketchbook');
  return {
    ...saved,
    // Deterministic IDs let independently opened legacy tabs agree before migration.
    pictures: saved.pictures.map((picture, index) => ({ ...picture, id: picture.id || `legacy-${index}` })),
  };
}

function samePicture(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function samePaint(left, right) {
  return !!left && !!right && (left.paint || left.image) === (right.paint || right.image) &&
    (left.template || null) === (right.template || null) &&
    (left.hasDrawing !== false) === (right.hasDrawing !== false);
}

async function store(nextState, message, picture = null) {
  if (saving) return false;
  if (!navigator.locks?.request) {
    say('Could not save safely. Use an updated browser on HTTPS or localhost.');
    return false;
  }
  saving = true;
  const before = state;
  try {
    return await navigator.locks.request(storageKey, () => {
      // No await inside this transaction: all current app instances use this lock.
      const fresh = readState();
      const removed = before.pictures.filter((entry) => !nextState.pictures.some((next) => next.id === entry.id));
      for (const entry of removed) {
        const expected = entry.id === currentId ? currentPicture : entry;
        if (!samePicture(expected, fresh.pictures.find((next) => next.id === entry.id))) {
          say('This picture changed in another window. Reopen My Pictures before deleting.');
          return false;
        }
      }
      const undoChanged = !samePicture(before.deleted, nextState.deleted);
      if (undoChanged && !samePicture(before.deleted, fresh.deleted)) {
        say('Delete history changed in another window. Reopen My Pictures and try again.');
        return false;
      }
      let pictures = fresh.pictures.filter((entry) => !removed.some((removedEntry) => removedEntry.id === entry.id));
      let draft = nextState.draft;
      let savedPicture = null;
      let forked = false;
      if (picture && !samePaint(picture, currentPicture)) {
        const existing = fresh.pictures.find((entry) => entry.id === picture.id);
        forked = !samePicture(existing || null, currentPicture);
        savedPicture = { ...picture, id: forked ? newPictureId() : picture.id };
        pictures = pictures.some((entry) => entry.id === savedPicture.id)
          ? pictures.map((entry) => entry.id === savedPicture.id ? savedPicture : entry)
          : [...pictures, savedPicture];
        draft = { ...draft, id: savedPicture.id };
      }
      // Undo only adds its own picture; never replace an entry another tab edited.
      for (const entry of nextState.pictures) {
        if (picture?.id === entry.id || before.pictures.some((previous) => previous.id === entry.id)) continue;
        if (pictures.some((existing) => existing.id === entry.id)) {
          say('This picture changed in another window. Reopen My Pictures and try again.');
          return false;
        }
        pictures.push(entry);
      }
      const merged = { ...fresh, draft, pictures, deleted: undoChanged ? nextState.deleted : fresh.deleted };
      localStorage.setItem(storageKey, JSON.stringify(merged));
      state = merged;
      if (savedPicture) {
        currentId = savedPicture.id;
        currentPicture = savedPicture;
      }
      updateUndoButtons();
      say(forked ? 'Saved a separate copy. This picture changed in another window.' : message);
      return true;
    });
  } catch {
    say('Could not save. Device storage may be full or blocked.');
    return false;
  } finally {
    saving = false;
  }
}

function renderPage() {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(paintCanvas, 0, 0);
  context.drawImage(outlineCanvas, 0, 0);
}

function blankPage(templateId = null, id = newPictureId()) {
  currentId = id;
  currentPicture = null;
  activeTemplate = coloringTemplates.find((template) => template.id === templateId) || null;
  paintContext.clearRect(0, 0, canvas.width, canvas.height);
  outlineContext.clearRect(0, 0, canvas.width, canvas.height);
  drawColoringOutline(outlineContext, activeTemplate);
  hasDrawing = false;
  renderPage();
}

function captureDraft() {
  return {
    id: currentId,
    paint: paintCanvas.toDataURL('image/png'),
    template: activeTemplate?.id || null,
    hasDrawing,
  };
}

function loadPicture(source) {
  // Keep pictures from the original, single-layer sketchbook readable.
  const draft = typeof source === 'string' ? { paint: source, template: null, hasDrawing: true } : source;
  const loadedPicture = state.pictures.find((picture) => picture.id === draft.id);
  // A restored draft may predate an edit in another instance. Keep its own base.
  const original = samePaint(draft, loadedPicture) ? loadedPicture : { ...draft };
  if (!draft.paint) {
    blankPage(draft.template, draft.id);
    return;
  }
  loading = true;
  const image = new Image();
  image.onload = () => {
    blankPage(draft.template, draft.id);
    paintContext.drawImage(image, 0, 0, canvas.width, canvas.height);
    currentPicture = original;
    hasDrawing = draft.hasDrawing !== false;
    renderPage();
    loading = false;
  };
  image.onerror = () => {
    loading = false;
    say('This picture could not be opened.');
  };
  image.src = draft.paint;
}

blankPage();
try {
  const saved = readState();
  if (saved && Array.isArray(saved.pictures)) {
    state = {
      ...saved,
      pictures: saved.pictures,
    };
    if (state.draft) {
      const draft = typeof state.draft === 'string'
        ? { paint: state.draft, template: null, hasDrawing: true }
        : state.draft;
      const existing = state.pictures.find((picture) => picture.id === draft.id ||
        (draft.paint && (picture.paint || picture.image) === draft.paint && (picture.template || null) === (draft.template || null)));
      state.draft = { ...draft, id: draft.id || existing?.id || newPictureId() };
      loadPicture(state.draft);
    }
  }
} catch {
  say('Saved pictures could not be read. Storage may be blocked.');
}

const brushTypes = [
  ['round', 'Round paint'],
  ['marker', 'Flat marker'],
  ['pencil', 'Pencil'],
  ['spray', 'Spray paint'],
  ['rainbow', 'Rainbow'],
  ['stars', 'Stars'],
  ['hearts', 'Hearts'],
  ['flowers', 'Flowers'],
  ['bubbles', 'Bubbles'],
  ['confetti', 'Confetti'],
  ['eraser', 'Eraser'],
];

// Stamp brushes paint one, a few or lots of shapes at each step: [pieces, piece size, step].
const stampTypes = ['stars', 'hearts', 'flowers', 'bubbles', 'confetti'];
const amounts = [['One', 1, 1, 1.8], ['A few', 3, 0.45, 1.4], ['Lots', 7, 0.3, 1.1]];
const brushAmounts = { stars: 0, hearts: 0, flowers: 0, bubbles: 1, confetti: 2 };
const partyColors = ['#ed575e', '#f49b38', '#f3ce45', '#57ad74', '#499cde', '#9d79cb', '#ec8fba'];

function makeBrush(type, size, paint, amount = brushAmounts[type] ?? 0) {
  const stamp = stampTypes.includes(type);
  const spacing = Math.max(1, size * (stamp ? amounts[amount][3] : type === 'spray' ? 0.3 : 0.15));
  return { type, size, color: paint, amount, spacing, untilNext: spacing };
}

// One shape filling a circle of `radius` around the origin.
function stampShape(target, type, radius, paint) {
  target.fillStyle = paint;
  target.beginPath();
  if (type === 'stars') {
    for (let index = 0; index < 10; index++) {
      const angle = index * Math.PI / 5 - Math.PI / 2;
      const reach = radius * (index % 2 ? 0.43 : 1);
      target.lineTo(Math.cos(angle) * reach, Math.sin(angle) * reach);
    }
    target.fill();
  } else if (type === 'hearts') {
    target.moveTo(0, radius * 0.8);
    target.bezierCurveTo(-radius * 1.35, -radius * 0.1, -radius * 0.65, -radius * 1.15, 0, -radius * 0.5);
    target.bezierCurveTo(radius * 0.65, -radius * 1.15, radius * 1.35, -radius * 0.1, 0, radius * 0.8);
    target.fill();
  } else if (type === 'flowers') {
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      target.moveTo(Math.cos(angle) * radius * 0.58 + radius * 0.42, Math.sin(angle) * radius * 0.58);
      target.arc(Math.cos(angle) * radius * 0.58, Math.sin(angle) * radius * 0.58, radius * 0.42, 0, Math.PI * 2);
    }
    target.fill();
    target.fillStyle = paint === '#f3ce45' || paint === '#fff1a3' ? '#f49b38' : '#f3ce45';
    target.beginPath();
    target.arc(0, 0, radius * 0.3, 0, Math.PI * 2);
    target.fill();
  } else if (type === 'bubbles') {
    const rim = Math.max(1, radius * 0.13);
    target.arc(0, 0, radius - rim / 2, 0, Math.PI * 2);
    target.globalAlpha = 0.22;
    target.fill();
    target.globalAlpha = 1;
    target.strokeStyle = paint;
    target.lineWidth = rim;
    target.stroke();
    target.beginPath();
    target.arc(0, 0, radius * 0.6, Math.PI * 1.1, Math.PI * 1.45);
    target.strokeStyle = '#ffffff';
    target.lineCap = 'round';
    target.stroke();
  } else {
    // Confetti: a tilted paper strip, mostly in the chosen color.
    target.fillStyle = Math.random() < 0.45 ? paint : partyColors[Math.floor(Math.random() * partyColors.length)];
    target.rotate(Math.random() * Math.PI);
    target.fillRect(-radius * 0.85, -radius * 0.38, radius * 1.7, radius * 0.76);
  }
}

function dab(target, x, y, brush) {
  const size = brush.size;
  target.save();
  target.translate(x, y);
  target.fillStyle = brush.color;
  if (brush.type === 'marker') {
    target.rotate(-Math.PI / 4);
    target.fillRect(-size / 2, -size / 6, size, size / 3);
  } else if (brush.type === 'pencil' || brush.type === 'spray') {
    const spray = brush.type === 'spray';
    target.globalAlpha = spray ? 0.55 : 0.4;
    for (let index = 0; index < (spray ? 24 : 16); index++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * size * (spray ? 0.7 : 0.45);
      target.beginPath();
      target.arc(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.max(0.6, size * (spray ? 0.025 : 0.035)), 0, Math.PI * 2);
      target.fill();
    }
  } else if (brush.type === 'rainbow') {
    const rainbow = ['#ed575e', '#f49b38', '#f3ce45', '#57ad74', '#499cde', '#9d79cb'];
    rainbow.forEach((paint, index) => {
      target.fillStyle = paint;
      target.beginPath();
      target.arc(0, (index - 2.5) * size / 6, size / 10, 0, Math.PI * 2);
      target.fill();
    });
  } else if (stampTypes.includes(brush.type)) {
    const [, count, scale] = amounts[brush.amount];
    // Several pieces sit around a ring (lots keeps one in the middle) so they rarely pile up.
    const turn = Math.random() * Math.PI * 2;
    const ring = count === 7 ? 6 : count;
    for (let index = 0; index < count; index++) {
      const onRing = count > 1 && !(count === 7 && index === 6);
      const angle = turn + index * Math.PI * 2 / ring;
      const reach = onRing ? size * 0.75 * (1 - scale) : 0;
      target.save();
      target.translate(Math.cos(angle) * reach, Math.sin(angle) * reach);
      if (count > 1) target.rotate((Math.random() - 0.5) * 0.8);
      stampShape(target, brush.type, size * 0.75 * scale * (count > 1 ? 0.8 + Math.random() * 0.2 : 1), brush.color);
      target.restore();
    }
  } else {
    target.beginPath();
    target.arc(0, 0, size / 2, 0, Math.PI * 2);
    target.fill();
  }
  target.restore();
}

function paintLine(target, from, to, brush) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  if (!distance) return;
  let offset = brush.untilNext;
  for (; offset <= distance; offset += brush.spacing) {
    const fraction = offset / distance;
    dab(target, from.x + (to.x - from.x) * fraction, from.y + (to.y - from.y) * fraction, brush);
  }
  brush.untilNext = offset - distance;
}

function drawBrushPreview(preview, type, size, opacity) {
  const target = preview.getContext('2d');
  target.setTransform(preview.width / 120, 0, 0, preview.height / 120, 0, 0);
  target.clearRect(0, 0, 120, 120);
  const brush = makeBrush(type, size, color);
  let previous = { x: 22, y: 60 };
  dab(target, previous.x, previous.y, brush);
  for (let index = 1; index <= 60; index++) {
    const next = { x: 22 + index / 60 * 76, y: 60 + Math.sin(index / 60 * Math.PI * 2) * 19 };
    paintLine(target, previous, next, brush);
    previous = next;
  }
  // Fade the completed stroke once, just like the drawing canvas.
  target.save();
  target.globalCompositeOperation = 'destination-in';
  target.globalAlpha = opacity;
  target.fillStyle = '#000000';
  target.fillRect(0, 0, 120, 120);
  target.restore();
  if (type === 'eraser') {
    target.save();
    target.globalCompositeOperation = 'source-out';
    target.fillStyle = color;
    target.fillRect(10, 18, 100, 84);
    target.restore();
  }
}

const brushPreview = document.querySelector('#brush-preview');
const brushButton = document.querySelector('#brush-button');
const colorButton = document.querySelector('#color-button');
const amountChoices = document.querySelector('#amounts');
function updateBrushPreview() {
  drawBrushPreview(brushPreview, brushType, Number(brushSize.value) / 3, Number(brushOpacity.value) / 100);
  brushButton.style.setProperty('--paint', color);
  colorButton.style.setProperty('--paint', color);
  document.querySelectorAll('.brush-choice canvas').forEach((preview) => {
    drawBrushPreview(preview, preview.dataset.brush, 22, 1);
  });
  amountChoices.hidden = !stampTypes.includes(brushType);
  if (!amountChoices.hidden) {
    amountChoices.querySelectorAll('canvas').forEach((picture, amount) => {
      const target = picture.getContext('2d');
      target.setTransform(1, 0, 0, 1, 0, 0);
      target.clearRect(0, 0, picture.width, picture.height);
      dab(target, picture.width / 2, picture.height / 2, makeBrush(brushType, picture.width * 0.6, color, amount));
      picture.parentElement.setAttribute('aria-pressed', String(amount === brushAmounts[brushType]));
    });
  }
  refreshBrushCursor();
}

amounts.forEach(([name], amount) => {
  const button = document.createElement('button');
  button.className = 'amount-choice';
  button.title = name;
  button.setAttribute('aria-label', name);
  const picture = document.createElement('canvas');
  picture.width = picture.height = 120;
  picture.setAttribute('aria-hidden', 'true');
  button.append(picture);
  button.addEventListener('click', () => {
    brushAmounts[brushType] = amount;
    updateBrushPreview();
  });
  amountChoices.append(button);
});

for (const [type, name] of brushTypes) {
  const button = document.createElement('button');
  button.className = 'brush-choice';
  button.title = name;
  button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(type === brushType));
  const preview = document.createElement('canvas');
  preview.width = preview.height = 120;
  preview.dataset.brush = type;
  preview.setAttribute('aria-hidden', 'true');
  if (type === 'eraser') {
    button.innerHTML = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" aria-hidden="true"><path d="m9 29 18-18a4 4 0 0 1 6 0l7 7a4 4 0 0 1 0 6L25 39H18Z" fill="#ec8fba"/><path d="m16 22 16 16M25 39h17"/></svg>';
  } else {
    button.append(preview);
  }
  button.addEventListener('click', () => {
    brushType = type;
    document.querySelectorAll('.brush-choice').forEach((choice) => {
      choice.setAttribute('aria-pressed', String(choice === button));
    });
    updateBrushPreview();
    showSheet(null);
  });
  document.querySelector('#brushes').append(button);
}
brushSize.addEventListener('input', updateBrushPreview);
brushOpacity.addEventListener('input', updateBrushPreview);
updateBrushPreview();

for (const [name, paint, light] of colors) {
  const button = document.createElement('button');
  button.className = light ? 'swatch light' : 'swatch';
  button.style.setProperty('--paint', paint);
  button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(paint === color));
  button.addEventListener('click', () => {
    color = paint;
    updateBrushPreview();
    document.querySelectorAll('.swatch').forEach((swatch) => {
      swatch.setAttribute('aria-pressed', String(swatch === button));
    });
    showSheet(null);
  });
  document.querySelector('#palette').append(button);
}

function point(event) {
  const bounds = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * canvas.width / bounds.width,
    y: (event.clientY - bounds.top) * canvas.height / bounds.height,
  };
}

function hideBrushCursor() {
  cursorPosition = null;
  brushCursor.hidden = true;
  stage.classList.remove('has-brush-cursor');
}

function refreshBrushCursor() {
  if (!cursorPosition) return;
  const bounds = canvas.getBoundingClientRect();
  const { x, y } = cursorPosition;
  if (loading || gesture || openSheet || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
    hideBrushCursor();
    return;
  }
  const brush = pointer !== null ? activeBrush : makeBrush(brushType, Number(brushSize.value), color);
  const opacity = pointer !== null ? strokeOpacity : Number(brushOpacity.value) / 100;
  const scale = bounds.width / canvas.width;
  const extent = brush.size * (stampTypes.includes(brush.type) || brush.type === 'spray' ? 1.5 : brush.type === 'rainbow' || brush.type === 'marker' ? 1.06 : 1);
  const side = extent * scale + 12;
  const key = `${brush.type}-${brush.amount}-${brush.size}-${brush.color}-${opacity}-${scale}`;
  if (key !== cursorTipKey) {
    cursorTipKey = key;
    const target = brushCursor.getContext('2d');
    const logicalSide = side / scale;
    const middle = logicalSide / 2;
    target.setTransform(256 / logicalSide, 0, 0, 256 / logicalSide, 0, 0);
    target.clearRect(0, 0, logicalSide, logicalSide);
    dab(target, middle, middle, { ...brush, color: brush.type === 'eraser' ? '#ffffff' : brush.color });
    target.save();
    target.globalCompositeOperation = 'destination-in';
    target.globalAlpha = opacity;
    target.fillRect(0, 0, logicalSide, logicalSide);
    target.restore();
    // A crisp rim keeps pale paint and the eraser visible without changing the paint preview.
    target.beginPath();
    target.arc(middle, middle, extent / 2, 0, Math.PI * 2);
    target.strokeStyle = '#ffffff';
    target.lineWidth = 3.5 / scale;
    target.stroke();
    if (brush.type === 'eraser') target.setLineDash([4 / scale, 3 / scale]);
    target.strokeStyle = brush.type === 'eraser' ? '#b44b58' : '#263f54';
    target.lineWidth = 1.25 / scale;
    target.stroke();
    target.setLineDash([]);
    brushCursor.style.width = `${side}px`;
    brushCursor.style.height = `${side}px`;
  }
  brushCursor.style.left = `${x}px`;
  brushCursor.style.top = `${y}px`;
  brushCursor.hidden = false;
  stage.classList.add('has-brush-cursor');
}

function updateBrushCursor(event) {
  if (event.pointerType === 'touch' && event.pointerId !== pointer) return;
  cursorPosition = { x: event.clientX, y: event.clientY };
  refreshBrushCursor();
}

function renderStroke() {
  paintContext.clearRect(0, 0, canvas.width, canvas.height);
  paintContext.drawImage(baseCanvas, 0, 0);
  paintContext.save();
  clipColoringRegion(paintContext, activeTemplate, activeRegion);
  paintContext.globalAlpha = strokeOpacity;
  paintContext.globalCompositeOperation = activeBrush.type === 'eraser' ? 'destination-out' : 'source-over';
  paintContext.drawImage(strokeCanvas, 0, 0);
  paintContext.restore();
  renderPage();
}

function startStroke(event) {
  if (loading || pointer !== null || event.button !== 0) return;
  canvasVersion++;
  event.preventDefault();
  pointer = event.pointerId;
  pointerType = event.pointerType;
  canvas.setPointerCapture(pointer);
  lastPoint = point(event);
  activeRegion = -1;
  if (activeTemplate) {
    for (let index = activeTemplate.regions.length - 1; index >= 0; index--) {
      if (context.isPointInPath(activeTemplate.regions[index], lastPoint.x, lastPoint.y)) {
        activeRegion = index;
        break;
      }
    }
  }
  baseContext.clearRect(0, 0, canvas.width, canvas.height);
  baseContext.drawImage(paintCanvas, 0, 0);
  strokeContext.clearRect(0, 0, canvas.width, canvas.height);
  strokeOpacity = Number(brushOpacity.value) / 100;
  activeBrush = makeBrush(brushType, Number(brushSize.value), color);
  dab(strokeContext, lastPoint.x, lastPoint.y, activeBrush);
  renderStroke();
  hadDrawing = hasDrawing;
  hasDrawing = true;
}

// A second finger turns the touch into a pinch: drop the provisional paint before anything is saved.
function cancelStroke() {
  pointer = null;
  paintContext.clearRect(0, 0, canvas.width, canvas.height);
  paintContext.drawImage(baseCanvas, 0, 0);
  hasDrawing = hadDrawing;
  renderPage();
  strokeWaiters.splice(0).forEach((resolve) => resolve());
}

function finishStroke(event) {
  if (event.pointerId !== pointer) return;
  pointer = null;
  strokeWaiters.splice(0).forEach((resolve) => resolve());
  saveCurrentPicture();
}

// Zoom and pan only move the paper on screen; the canvas pixels stay 1200 square.
const stage = document.querySelector('.drawing-area');
const paper = document.querySelector('.paper');
const fitButton = document.querySelector('#fit-button');
const maxZoom = 5;
const touches = new Map();
let gesture = null;
let view = { scale: 1, x: 0, y: 0 };

function setView(scale, x, y) {
  const fit = (offset, start, size, space) => size <= space
    ? (space - size) / 2 - start
    : Math.min(-start, Math.max(space - size - start, offset));
  view = {
    scale,
    x: fit(x, paper.offsetLeft, paper.offsetWidth * scale, stage.clientWidth),
    y: fit(y, paper.offsetTop, paper.offsetHeight * scale, stage.clientHeight),
  };
  paper.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  fitButton.hidden = view.scale === 1;
  refreshBrushCursor();
}

// Keep the spot of paper that was under `from` (in the `base` view) under `to`.
function zoomTo(scale, from, to, base) {
  const bounds = stage.getBoundingClientRect();
  const originX = bounds.left + paper.offsetLeft;
  const originY = bounds.top + paper.offsetTop;
  const next = Math.min(maxZoom, Math.max(1, scale)) < 1.03 ? 1 : Math.min(maxZoom, scale);
  const paperX = (from.x - originX - base.x) / base.scale;
  const paperY = (from.y - originY - base.y) / base.scale;
  setView(next, to.x - originX - paperX * next, to.y - originY - paperY * next);
}

function touchCenter() {
  const [first, second] = [...touches.values()];
  if (!second) return { center: first, distance: 0 };
  return {
    center: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    distance: Math.hypot(second.x - first.x, second.y - first.y),
  };
}

function anchorGesture() {
  paper.classList.remove('settling');
  gesture = { ...touchCenter(), view: { ...view } };
}

function moveGesture() {
  const { center, distance } = touchCenter();
  const scale = gesture.distance && distance ? gesture.view.scale * distance / gesture.distance : gesture.view.scale;
  zoomTo(scale, gesture.center, center, gesture.view);
}

stage.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') {
    // Ignore a resting hand while a pen or mouse is drawing.
    if (pointer !== null && pointerType !== 'touch') return;
    if (event.isPrimary) {
      touches.clear();
      gesture = null;
    }
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Fingers that close a sheet or join another finger only move the view, never paint.
    if (openSheet || gesture || touches.size > 1) {
      showSheet(null);
      hideBrushCursor();
      if (pointer !== null) cancelStroke();
      anchorGesture();
      return;
    }
  } else if (openSheet) {
    showSheet(null);
    return;
  }
  if (event.target === canvas) {
    startStroke(event);
    updateBrushCursor(event);
  }
});

stage.addEventListener('pointermove', (event) => {
  if (touches.has(event.pointerId)) {
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture) {
      moveGesture();
      return;
    }
  }
  updateBrushCursor(event);
  if (event.pointerId !== pointer) return;
  const points = event.getCoalescedEvents?.() || [event];
  for (const sample of points.length ? points : [event]) {
    const next = point(sample);
    paintLine(strokeContext, lastPoint, next, activeBrush);
    lastPoint = next;
  }
  renderStroke();
});

function releasePointer(event) {
  if (touches.delete(event.pointerId) && gesture) {
    // Painting waits until every gesture finger is up.
    if (touches.size) anchorGesture();
    else gesture = null;
    return;
  }
  finishStroke(event);
  if (event.pointerType === 'touch' || event.type === 'pointercancel') hideBrushCursor();
}
stage.addEventListener('pointerleave', hideBrushCursor);
window.addEventListener('blur', hideBrushCursor);
stage.addEventListener('pointerup', releasePointer);
stage.addEventListener('pointercancel', releasePointer);
stage.addEventListener('lostpointercapture', releasePointer);

stage.addEventListener('wheel', (event) => {
  event.preventDefault();
  if (pointer !== null || gesture) return;
  const at = { x: event.clientX, y: event.clientY };
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : 1);
  paper.classList.remove('settling');
  zoomTo(view.scale * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.002)), at, at, view);
}, { passive: false });

fitButton.addEventListener('click', () => {
  paper.classList.add('settling');
  setView(1, 0, 0);
});
paper.addEventListener('transitionend', () => paper.classList.remove('settling'));
new ResizeObserver(() => setView(view.scale, view.x, view.y)).observe(stage);
// Safari still pinch-zooms the whole page unless its own gesture events are stopped.
document.addEventListener('gesturestart', (event) => event.preventDefault());

const dock = document.querySelector('.dock');
const sheets = {
  brush: [document.querySelector('#brush-button'), document.querySelector('#brush-sheet')],
  properties: [document.querySelector('#properties-button'), document.querySelector('#properties-sheet')],
  color: [colorButton, document.querySelector('#color-sheet')],
};
let openSheet = null;
function showSheet(name) {
  for (const [key, [button, sheet]] of Object.entries(sheets)) {
    if (key !== name && sheet.contains(document.activeElement)) button.focus();
    button.setAttribute('aria-expanded', String(key === name));
    sheet.hidden = key !== name;
  }
  openSheet = name;
  if (name) hideBrushCursor();
}
for (const [key, [button]] of Object.entries(sheets)) {
  button.addEventListener('click', () => showSheet(openSheet === key ? null : key));
}
document.addEventListener('pointerdown', (event) => {
  if (openSheet && !dock.contains(event.target) && !stage.contains(event.target)) showSheet(null);
}, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && openSheet) showSheet(null);
});

function queuePersistence(operation) {
  const next = persistenceTail.then(operation).catch(() => {
    say('Could not save. Device storage may be full or blocked.');
    return false;
  });
  persistenceTail = next;
  return next;
}

async function waitForStroke() {
  while (pointer !== null) await new Promise((resolve) => strokeWaiters.push(resolve));
}

function saveCurrentPicture() {
  if (loading) return Promise.resolve(false);
  // Capture pixels and their base when this job runs, not when it is enqueued.
  return queuePersistence(saveCanvas);
}

async function saveCanvas() {
  await waitForStroke();
  if (loading) return false;
  const draft = captureDraft();
  const previous = state.pictures.find((picture) => picture.id === currentId);
  if (!hasDrawing && !activeTemplate && !previous) {
    return store({ ...state, draft }, '');
  }
  const picture = {
    ...draft,
    image: canvas.toDataURL('image/png'),
    created: previous?.created || Date.now(),
  };
  const pictures = previous
    ? state.pictures.map((entry) => entry.id === currentId ? picture : entry)
    : [...state.pictures, picture];
  return store({ ...state, draft, pictures }, '', picture);
}

async function flushCanvas() {
  let version;
  do {
    await waitForStroke();
    version = canvasVersion;
    if (!await saveCanvas()) return false;
  } while (pointer !== null || version !== canvasVersion);
  return true;
}

function navigatePicture(makeDraft, open) {
  return queuePersistence(async () => {
    // Drawing can continue during either lock wait. Only switch once its latest
    // completed paint is durable and no newer/provisional stroke can be cleared.
    while (!loading) {
      if (!await flushCanvas()) return false;
      const version = canvasVersion;
      const draft = makeDraft();
      if (!draft || !await store({ ...state, draft }, '')) return false;
      if (pointer !== null || version !== canvasVersion) continue;
      open(draft);
      return true;
    }
    return false;
  });
}

const pagePicker = document.querySelector('#page-picker');
for (const template of [null, ...coloringTemplates]) {
  const button = document.createElement('button');
  button.className = 'page-choice';
  button.setAttribute('aria-label', template ? template.name : 'Blank page');
  const preview = document.createElement('canvas');
  preview.width = preview.height = 300;
  preview.setAttribute('aria-hidden', 'true');
  const target = preview.getContext('2d');
  target.scale(0.25, 0.25);
  drawColoringOutline(target, template);
  if (!template) {
    target.strokeStyle = '#accfdf';
    target.lineWidth = 14;
    target.strokeRect(260, 180, 680, 840);
    target.beginPath();
    target.moveTo(600, 470);
    target.lineTo(600, 730);
    target.moveTo(470, 600);
    target.lineTo(730, 600);
    target.stroke();
  }
  button.append(preview);
  button.addEventListener('click', () => navigatePicture(
    () => ({ id: newPictureId(), paint: null, template: template?.id || null, hasDrawing: false }),
    (draft) => {
      blankPage(draft.template, draft.id);
      pagePicker.close();
      gallery.close();
    },
  ));
  document.querySelector('#page-choices').append(button);
}
const newButton = document.querySelector('#new-button');
newButton.addEventListener('click', () => {
  if (!loading) pagePicker.showModal();
});
document.querySelector('#close-page-picker').addEventListener('click', () => pagePicker.close());

function renderGallery() {
  const pictures = document.querySelector('#pictures');
  pictures.replaceChildren(newButton);
  [...state.pictures].reverse().forEach((picture) => {
    const card = document.createElement('div');
    card.className = 'picture-card';
    const button = document.createElement('button');
    button.className = 'picture';
    button.setAttribute('aria-label', `Open picture from ${new Date(picture.created).toLocaleString()}`);
    const image = document.createElement('img');
    image.src = picture.image;
    image.alt = 'Saved drawing';
    button.append(image);
    button.addEventListener('click', () => navigatePicture(
      () => {
        const selected = state.pictures.find((entry) => entry.id === picture.id);
        return selected && {
          id: selected.id,
          paint: selected.paint || selected.image,
          template: selected.template || null,
          hasDrawing: selected.hasDrawing !== false,
        };
      },
      (draft) => {
        loadPicture(draft);
        gallery.close();
      },
    ));
    const remove = document.createElement('button');
    remove.className = 'delete-picture icon-button';
    remove.setAttribute('aria-label', 'Delete picture');
    remove.title = 'Delete picture';
    remove.append(document.querySelector('#delete-icon').content.cloneNode(true));
    remove.addEventListener('click', () => deletePicture(picture.id));
    card.append(button, remove);
    pictures.append(card);
  });
}

function updateUndoButtons() {
  document.querySelector('#undo-delete').hidden = !state.deleted;
  document.querySelector('#undo-gallery-delete').hidden = !state.deleted;
}

function deletePicture(id) {
  const expected = state.pictures.find((picture) => picture.id === id);
  const wasCurrent = id === currentId;
  return queuePersistence(() => deleteSavedPicture(id, expected, wasCurrent));
}

async function deleteSavedPicture(id, expected, wasCurrent) {
  await waitForStroke();
  if (loading) return;
  if ((wasCurrent && id !== currentId) || (!wasCurrent &&
      !samePicture(expected, state.pictures.find((picture) => picture.id === id)))) {
    say('This picture changed while waiting. Reopen My Pictures before deleting.');
    return;
  }
  const version = canvasVersion;
  const current = id === currentId;
  const previous = state.pictures.find((picture) => picture.id === id);
  const deleted = current
    ? { ...captureDraft(), image: canvas.toDataURL('image/png'), created: previous?.created || Date.now() }
    : previous;
  if (!deleted || (current && !hasDrawing && !activeTemplate && !previous)) return;
  if (!await store({
    ...state,
    draft: current ? null : state.draft,
    pictures: state.pictures.filter((picture) => picture.id !== id),
    deleted,
  }, '')) return;
  if (current && pointer === null && version === canvasVersion) blankPage();
  else if (pointer !== null || version !== canvasVersion) await flushCanvas();
  updateUndoButtons();
  if (gallery.open) renderGallery();
}

function undoDelete() {
  const expected = state.deleted;
  return queuePersistence(() => restoreDeletedPicture(expected));
}

async function restoreDeletedPicture(expected) {
  await waitForStroke();
  if (!state.deleted || loading) return;
  if (!samePicture(expected, state.deleted)) {
    say('Delete history changed while waiting. Reopen My Pictures and try again.');
    return;
  }
  const version = canvasVersion;
  const picture = state.deleted;
  const restoreOnCanvas = !hasDrawing && !activeTemplate;
  const draft = {
    id: picture.id,
    paint: picture.paint || picture.image,
    template: picture.template || null,
    hasDrawing: picture.hasDrawing !== false,
  };
  if (!await store({
    ...state,
    pictures: [...state.pictures, picture],
    deleted: null,
    draft: restoreOnCanvas ? draft : state.draft,
  }, '')) return;
  if (restoreOnCanvas && pointer === null && version === canvasVersion) loadPicture(draft);
  else if (pointer !== null || version !== canvasVersion) await flushCanvas();
  updateUndoButtons();
  if (gallery.open) renderGallery();
}

document.querySelector('#undo-delete').addEventListener('click', undoDelete);
document.querySelector('#undo-gallery-delete').addEventListener('click', undoDelete);
updateUndoButtons();

document.querySelector('#gallery-button').addEventListener('click', () => queuePersistence(async () => {
  if (loading) return;
  await flushCanvas();
  renderGallery();
  gallery.showModal();
}));
document.querySelector('#close-gallery').addEventListener('click', () => gallery.close());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((registration) => {
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (installing.state === 'redundant' && !registration.active) {
        say('Offline setup failed. Reconnect and reload to try again.');
      }
    });
  }).catch(() => {
    say('Offline setup failed. Reconnect and reload to try again.');
  });
}
