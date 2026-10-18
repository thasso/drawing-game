// All artwork is local. Closed paths also define the areas children can color.
function ovalPath(x, y, rx, ry) {
  return `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

const flowerPetals = Array.from({ length: 6 }, (_, index) => {
  const angle = index * Math.PI / 3 - Math.PI / 2;
  const point = (radius, offset) => `${600 + Math.cos(angle + offset) * radius} ${430 + Math.sin(angle + offset) * radius}`;
  return `M${point(95, -0.5)}C${point(370, -0.8)} ${point(370, 0.8)} ${point(95, 0.5)}A95 95 0 0 0 ${point(95, -0.5)}Z`;
});

const coloringTemplates = [
  {
    id: 'flower',
    name: 'Flower',
    regions: [
      'M582 500Q620 710 580 990L612 990Q650 710 614 500Z',
      'M601 827C410 850 350 760 320 690C465 680 570 718 601 827Z',
      'M615 930C792 916 858 806 874 744C724 758 638 828 615 930Z',
      ...flowerPetals,
      ovalPath(600, 430, 95, 95),
    ],
  },
  {
    id: 'butterfly',
    name: 'Butterfly',
    regions: [
      'M575 580C160 650 100 140 340 200C500 230 555 440 575 580Z',
      'M625 580C1040 650 1100 140 860 200C700 230 645 440 625 580Z',
      'M576 590C180 510 220 1020 430 916C550 858 578 702 576 590Z',
      'M624 590C1020 510 980 1020 770 916C650 858 622 702 624 590Z',
      ovalPath(600, 625, 42, 260),
      ovalPath(600, 355, 62, 62),
      ovalPath(350, 400, 64, 85),
      ovalPath(850, 400, 64, 85),
      ovalPath(407, 750, 50, 65),
      ovalPath(793, 750, 50, 65),
    ],
    details: ['M574 300Q500 192 466 230M626 300Q700 192 734 230'],
  },
  {
    id: 'rocket',
    name: 'Rocket',
    regions: [
      'M495 785Q450 940 520 1040L600 960L680 1040Q750 940 705 785Z',
      'M455 570Q310 642 320 880L475 790Z',
      'M745 570Q890 642 880 880L725 790Z',
      'M600 145C450 260 420 520 475 800L725 800C780 520 750 260 600 145Z',
      'M600 145Q514 211 476 330L724 330Q686 211 600 145Z',
      ovalPath(600, 495, 91, 91),
      ovalPath(600, 495, 64, 64),
      'M475 735L725 735L725 800L475 800Z',
    ],
  },
].map((template) => ({
  ...template,
  regions: template.regions.map((path) => new Path2D(path)),
  details: (template.details || []).map((path) => new Path2D(path)),
}));

function excludeLaterRegions(target, template, index) {
  for (let next = index + 1; next < template.regions.length; next++) {
    const outside = new Path2D();
    outside.rect(0, 0, 1200, 1200);
    outside.addPath(template.regions[next]);
    target.clip(outside, 'evenodd');
  }
}

function clipColoringRegion(target, template, index) {
  if (!template) return;
  if (index >= 0) target.clip(template.regions[index]);
  // Nested shapes, such as a rocket window, are separate coloring areas.
  excludeLaterRegions(target, template, index);
}

function drawColoringOutline(target, template) {
  if (!template) return;
  target.save();
  target.strokeStyle = '#263f54';
  target.lineWidth = 8;
  target.lineCap = 'round';
  target.lineJoin = 'round';
  template.regions.forEach((path, index) => {
    target.save();
    excludeLaterRegions(target, template, index);
    target.stroke(path);
    target.restore();
  });
  template.details.forEach((path) => target.stroke(path));
  target.restore();
}
