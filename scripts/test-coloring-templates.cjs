// Check coloring template data: IDs, names, closed region paths, page margins and the original pages.
// Path2D is a recording double here, so this proves path data, not native rendering or hit testing.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = process.argv[2] || path.resolve(__dirname, '..');

const sandbox = { Path2D: class { constructor(data) { this.data = data; } } };
vm.runInNewContext(`${fs.readFileSync(path.join(root, 'coloring.js'), 'utf8')}\nthis.templates = coloringTemplates;`, sandbox);
// Array.from copies the VM's arrays into this realm so deepEqual compares values.
const templates = Array.from(sandbox.templates, (template) => ({
  id: template.id,
  name: template.name,
  regions: Array.from(template.regions, (region) => region.data),
  details: Array.from(template.details, (detail) => detail.data),
}));

const originals = templates.slice(0, 3);
assert.deepEqual(originals.map(({ id }) => id), ['flower', 'butterfly', 'rocket']);
// SHA-256 of the three original templates' exact path data, as shipped before the animal pages.
assert.equal(crypto.createHash('sha256').update(JSON.stringify(originals)).digest('hex'), '7e7d38f71a87bb8e1fcd118b08ef3be9ac4c1a2fdd9f0b746ab926aae5f9ceca');

const animals = [['rabbit', 'Rabbit'], ['cat', 'Kitten'], ['dog', 'Puppy'], ['fox', 'Fox'], ['owl', 'Owl'], ['turtle', 'Turtle']];
assert.deepEqual(templates.slice(3).map(({ id, name }) => [id, name]), animals);
assert.equal(new Set(templates.map(({ id }) => id)).size, templates.length);

// Returns each subpath's start, end, whether it ends with Z, and a conservative bounding box.
function subpaths(data) {
  const tokens = data.match(/[a-zA-Z]|-?\d*\.?\d+(?:e-?\d+)?/g);
  const sizes = { M: 2, L: 2, Q: 4, C: 6, A: 7, Z: 0 };
  const result = [];
  let current = null, x = 0, y = 0, index = 0;
  const include = (px, py) => {
    current.box = [Math.min(current.box[0], px), Math.min(current.box[1], py), Math.max(current.box[2], px), Math.max(current.box[3], py)];
  };
  while (index < tokens.length) {
    const command = tokens[index++];
    const size = sizes[command.toUpperCase()];
    assert.ok(size !== undefined, `Unsupported path command ${command} in ${data}`);
    const args = tokens.slice(index, index + size).map(Number);
    assert.ok(args.length === size && args.every(Number.isFinite), `Bad arguments for ${command} in ${data}`);
    index += size;
    const relative = command !== command.toUpperCase();
    if (command.toUpperCase() === 'Z') {
      current.closed = true;
      [x, y] = current.start;
      continue;
    }
    const end = [args[size - 2] + (relative ? x : 0), args[size - 1] + (relative ? y : 0)];
    if (command.toUpperCase() === 'M') {
      current = { start: end, closed: false, box: [end[0], end[1], end[0], end[1]] };
      result.push(current);
    } else if (command.toUpperCase() === 'A') {
      // An arc stays within its endpoints widened by its radii.
      for (const [px, py] of [[x, y], end]) {
        include(px - args[0], py - args[1]);
        include(px + args[0], py + args[1]);
      }
    } else {
      for (let point = 0; point < size; point += 2) include(args[point] + (relative ? x : 0), args[point + 1] + (relative ? y : 0));
    }
    [x, y] = end;
    current.end = end;
  }
  return result;
}

for (const template of templates) {
  assert.ok(template.name.trim(), `${template.id} needs an accessible name`);
  assert.ok(template.regions.length > 0, `${template.id} needs coloring regions`);
  for (const region of template.regions) {
    const parts = subpaths(region);
    assert.ok(parts.length > 0, `${template.id} has an empty region`);
    for (const part of parts) {
      const returns = Math.hypot(part.end[0] - part.start[0], part.end[1] - part.start[1]) < 0.01;
      assert.ok(part.closed || returns, `${template.id} region is not closed: ${region}`);
    }
  }
}

for (const template of templates.slice(3)) {
  assert.ok(template.details.length >= 2, `${template.id} needs a face`);
  for (const data of [...template.regions, ...template.details]) {
    for (const { box } of subpaths(data)) {
      assert.ok(box[0] >= 120 && box[1] >= 120 && box[2] <= 1080 && box[3] <= 1080, `${template.id} leaves the page margin: ${data}`);
    }
  }
}

console.log(`Checked ${templates.length} coloring templates: ${animals.length} animal pages, closed regions, margins and unchanged original pages.`);
