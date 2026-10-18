const canvas = document.querySelector('#canvas');
const context = canvas.getContext('2d');
const strokeCanvas = document.createElement('canvas');
const baseCanvas = document.createElement('canvas');
strokeCanvas.width = baseCanvas.width = canvas.width;
strokeCanvas.height = baseCanvas.height = canvas.height;
const strokeContext = strokeCanvas.getContext('2d');
const baseContext = baseCanvas.getContext('2d');
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
let state = { draft: null, pictures: [] };

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

function blankPage() {
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  hasDrawing = false;
}

function loadPicture(source) {
  loading = true;
  const image = new Image();
  image.onload = () => {
    blankPage();
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    hasDrawing = true;
    loading = false;
  };
  image.onerror = () => {
    loading = false;
    say('This picture could not be opened.');
  };
  image.src = source;
}

blankPage();
try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (saved && Array.isArray(saved.pictures)) {
    state = saved;
    if (state.draft) loadPicture(state.draft);
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
  button.append(preview);
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
  context.drawImage(baseCanvas, 0, 0);
  context.globalAlpha = strokeOpacity;
  context.drawImage(strokeCanvas, 0, 0);
  context.globalAlpha = 1;
}

canvas.addEventListener('pointerdown', (event) => {
  if (loading || pointer !== null || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  lastPoint = point(event);
  baseContext.drawImage(canvas, 0, 0);
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
  store({ ...state, draft: canvas.toDataURL('image/png') }, '');
}
canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);
canvas.addEventListener('lostpointercapture', finishStroke);

document.querySelector('#save-button').addEventListener('click', () => {
  if (loading || pointer !== null || !hasDrawing) return;
  const image = canvas.toDataURL('image/png');
  if (state.pictures.some((picture) => picture.image === image)) {
    say('Already in My pictures');
    return;
  }
  store({
    draft: image,
    pictures: [...state.pictures, { image, created: Date.now() }],
  }, 'Picture kept!');
});

document.querySelector('#new-button').addEventListener('click', () => {
  if (loading || pointer !== null) return;
  const kept = !hasDrawing || state.pictures.some((picture) => picture.image === canvas.toDataURL('image/png'));
  if (!kept && !confirm('Start a new page? This drawing is not in My pictures. Choose Cancel, then Keep picture to keep it.')) return;
  if (store({ ...state, draft: null }, 'A fresh page for you')) blankPage();
});

document.querySelector('#gallery-button').addEventListener('click', () => {
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
    const button = document.createElement('button');
    button.className = 'picture';
    button.setAttribute('aria-label', `Open picture from ${new Date(picture.created).toLocaleString()}`);
    const image = document.createElement('img');
    image.src = picture.image;
    image.alt = 'Saved drawing';
    button.append(image);
    button.addEventListener('click', () => {
      if (loading || pointer !== null) return;
      const kept = !hasDrawing || state.pictures.some((entry) => entry.image === canvas.toDataURL('image/png'));
      if (!kept && !confirm('Open this picture instead? Choose Cancel, then Keep picture to keep your current drawing.')) return;
      if (!store({ ...state, draft: picture.image }, '')) return;
      loadPicture(picture.image);
      gallery.close();
    });
    pictures.append(button);
  });
  gallery.showModal();
});

document.querySelector('#close-gallery').addEventListener('click', () => gallery.close());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    say('Offline setup failed. Reconnect and reload to try again.');
  });
}
