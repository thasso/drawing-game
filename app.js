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
const storageKey = 'little-sketchbook-v1';
const colors = [
  ['Ink', '#263f54'],
  ['Red', '#ed575e'],
  ['Orange', '#f49b38'],
  ['Yellow', '#f3ce45'],
  ['Green', '#57ad74'],
  ['Blue', '#499cde'],
  ['Purple', '#9d79cb'],
  ['Pink', '#ec8fba'],
];
let color = colors[5][1];
let brushType = 'round';
let activeBrush = null;
let pointer = null;
let lastPoint = null;
let loading = false;
let hasDrawing = false;
let currentId = newPictureId();
let state = { draft: null, pictures: [], deleted: null };

function newPictureId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function say(message) {
  status.textContent = message;
}

function store(nextState, message) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(nextState));
    state = nextState;
    say(message);
    return true;
  } catch {
    say('Could not save. Device storage may be full or blocked.');
    return false;
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
  if (!draft.paint) {
    blankPage(draft.template, draft.id);
    return;
  }
  loading = true;
  const image = new Image();
  image.onload = () => {
    blankPage(draft.template, draft.id);
    paintContext.drawImage(image, 0, 0, canvas.width, canvas.height);
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
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.pictures)) {
    state = {
      ...saved,
      pictures: saved.pictures.map((picture) => ({ ...picture, id: picture.id || newPictureId() })),
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
  ['eraser', 'Eraser'],
];

function makeBrush(type, size, paint) {
  const spacing = Math.max(1, size * (type === 'stars' ? 1.8 : type === 'spray' ? 0.3 : 0.15));
  return { type, size, color: paint, spacing, untilNext: spacing };
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
  } else if (brush.type === 'stars') {
    target.beginPath();
    for (let index = 0; index < 10; index++) {
      const angle = index * Math.PI / 5 - Math.PI / 2;
      const radius = size * (index % 2 ? 0.32 : 0.75);
      if (index === 0) target.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      else target.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    target.closePath();
    target.fill();
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
function updateBrushPreview() {
  drawBrushPreview(brushPreview, brushType, Number(brushSize.value) / 3, Number(brushOpacity.value) / 100);
  document.querySelectorAll('.brush-choice canvas').forEach((preview) => {
    drawBrushPreview(preview, preview.dataset.brush, 22, 1);
  });
}

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
  });
  document.querySelector('#brushes').append(button);
}
brushSize.addEventListener('input', updateBrushPreview);
brushOpacity.addEventListener('input', updateBrushPreview);
updateBrushPreview();

for (const [name, paint] of colors) {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.style.setProperty('--paint', paint);
  button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(paint === color));
  button.addEventListener('click', () => {
    color = paint;
    updateBrushPreview();
    document.querySelectorAll('.swatch').forEach((swatch) => {
      swatch.setAttribute('aria-pressed', String(swatch === button));
    });
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

canvas.addEventListener('pointerdown', (event) => {
  if (loading || pointer !== null || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId;
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
  hasDrawing = true;
  say('Drawing…');
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer) return;
  const points = event.getCoalescedEvents?.() || [event];
  for (const sample of points.length ? points : [event]) {
    const next = point(sample);
    paintLine(strokeContext, lastPoint, next, activeBrush);
    lastPoint = next;
  }
  renderStroke();
});

function finishStroke(event) {
  if (event.pointerId !== pointer) return;
  pointer = null;
  saveCurrentPicture();
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);

function saveCurrentPicture() {
  if (loading || pointer !== null) return false;
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
  return store({ ...state, draft, pictures }, '');
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
  button.addEventListener('click', () => {
    if (loading || pointer !== null) return;
    if (!saveCurrentPicture()) return;
    const draft = { id: newPictureId(), paint: null, template: template?.id || null, hasDrawing: false };
    if (!store({ ...state, draft }, '')) return;
    blankPage(draft.template, draft.id);
    pagePicker.close();
  });
  document.querySelector('#page-choices').append(button);
}
document.querySelector('#new-button').addEventListener('click', () => {
  if (!loading && pointer === null) pagePicker.showModal();
});
document.querySelector('#close-page-picker').addEventListener('click', () => pagePicker.close());

function renderGallery() {
  const pictures = document.querySelector('#pictures');
  pictures.replaceChildren();
  if (!state.pictures.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-gallery';
    empty.setAttribute('role', 'img');
    empty.setAttribute('aria-label', 'No saved pictures yet');
    empty.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="m3 17 6-6 4 4 3-3 5 5"/><circle cx="16" cy="8" r="2"/></svg>';
    pictures.append(empty);
  }
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
    button.addEventListener('click', () => {
      if (loading || pointer !== null) return;
      if (!saveCurrentPicture()) return;
      const selected = state.pictures.find((entry) => entry.id === picture.id);
      if (!selected) return;
      const draft = {
        id: selected.id,
        paint: selected.paint || selected.image,
        template: selected.template || null,
        hasDrawing: selected.hasDrawing !== false,
      };
      if (!store({ ...state, draft }, '')) return;
      loadPicture(draft);
      gallery.close();
    });
    const remove = document.createElement('button');
    remove.className = 'delete-picture icon-button';
    remove.setAttribute('aria-label', 'Delete picture');
    remove.title = 'Delete picture';
    remove.innerHTML = document.querySelector('#delete-button').innerHTML;
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
  if (loading || pointer !== null) return;
  const current = id === currentId;
  const previous = state.pictures.find((picture) => picture.id === id);
  const deleted = current
    ? { ...captureDraft(), image: canvas.toDataURL('image/png'), created: previous?.created || Date.now() }
    : previous;
  if (!deleted || (current && !hasDrawing && !activeTemplate && !previous)) return;
  if (!store({
    ...state,
    draft: current ? null : state.draft,
    pictures: state.pictures.filter((picture) => picture.id !== id),
    deleted,
  }, '')) return;
  if (current) blankPage();
  updateUndoButtons();
  if (gallery.open) renderGallery();
}

function undoDelete() {
  if (!state.deleted || loading || pointer !== null) return;
  const picture = state.deleted;
  const restoreOnCanvas = !hasDrawing && !activeTemplate;
  const draft = {
    id: picture.id,
    paint: picture.paint || picture.image,
    template: picture.template || null,
    hasDrawing: picture.hasDrawing !== false,
  };
  if (!store({
    ...state,
    pictures: [...state.pictures, picture],
    deleted: null,
    draft: restoreOnCanvas ? draft : state.draft,
  }, '')) return;
  if (restoreOnCanvas) loadPicture(draft);
  updateUndoButtons();
  if (gallery.open) renderGallery();
}

document.querySelector('#delete-button').addEventListener('click', () => deletePicture(currentId));
document.querySelector('#undo-delete').addEventListener('click', undoDelete);
document.querySelector('#undo-gallery-delete').addEventListener('click', undoDelete);
updateUndoButtons();

document.querySelector('#gallery-button').addEventListener('click', () => {
  if (loading || pointer !== null) return;
  saveCurrentPicture();
  renderGallery();
  gallery.showModal();
});
document.querySelector('#close-gallery').addEventListener('click', () => gallery.close());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    say('Offline setup failed. Reconnect and reload to try again.');
  });
}
