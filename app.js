const canvas = document.querySelector('#canvas');
const context = canvas.getContext('2d');
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

for (const [name, paint] of colors) {
  const button = document.createElement('button');
  button.className = 'swatch';
  button.style.setProperty('--paint', paint);
  button.setAttribute('aria-label', name);
  button.setAttribute('aria-pressed', String(paint === color));
  button.addEventListener('click', () => {
    color = paint;
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

canvas.addEventListener('pointerdown', (event) => {
  if (loading || pointer !== null || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId;
  canvas.setPointerCapture(pointer);
  lastPoint = point(event);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = 16;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  context.arc(lastPoint.x, lastPoint.y, 8, 0, Math.PI * 2);
  context.fill();
  hasDrawing = true;
  say('Drawing…');
});

canvas.addEventListener('pointermove', (event) => {
  if (event.pointerId !== pointer) return;
  const points = event.getCoalescedEvents?.() || [event];
  for (const sample of points.length ? points : [event]) {
    const next = point(sample);
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.lineTo(next.x, next.y);
    context.stroke();
    lastPoint = next;
  }
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
