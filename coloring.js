// All artwork is local. Closed paths also define the areas children can color.
function ovalPath(x, y, rx, ry) {
  return `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0`;
}

// Mirrors absolute "x y" pairs across the page's center line (M, L, Q, C and Z only).
function mirrorPath(path) {
  return path.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x, y) => `${1200 - x} ${y}`);
}

// Eyes and noses are solid detail strokes, so they never become tiny coloring areas.
function dotPath(x, y, rx, ry = rx) {
  let path = '';
  for (let inset = 0; Math.min(rx, ry) - inset > 0; inset += 4) path += ovalPath(x, y, rx - inset, ry - inset);
  return path;
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
  {
    id: 'rabbit',
    name: 'Rabbit',
    regions: [
      ovalPath(805, 895, 72, 66),
      'M470 470C390 330 395 140 455 128C515 120 565 300 565 455Z',
      'M488 425C445 320 450 195 466 185C490 185 525 300 535 415Z',
      mirrorPath('M470 470C390 330 395 140 455 128C515 120 565 300 565 455Z'),
      mirrorPath('M488 425C445 320 450 195 466 185C490 185 525 300 535 415Z'),
      ovalPath(600, 835, 215, 190),
      ovalPath(600, 875, 125, 130),
      ovalPath(500, 1020, 105, 50),
      ovalPath(700, 1020, 105, 50),
      ovalPath(600, 520, 200, 170),
      ovalPath(488, 585, 52, 34),
      ovalPath(712, 585, 52, 34),
    ],
    details: [
      dotPath(528, 505, 12),
      dotPath(672, 505, 12),
      dotPath(600, 560, 22, 15),
      'M600 575Q600 612 572 620M600 575Q600 612 628 620',
    ],
  },
  {
    id: 'cat',
    name: 'Kitten',
    regions: [
      'M740 1010C940 1020 1000 830 935 715C912 675 862 690 878 738C918 835 880 940 740 950Z',
      'M600 610C450 610 395 830 415 960C425 1015 500 1025 600 1025C700 1025 775 1015 785 960C805 830 750 610 600 610Z',
      ovalPath(600, 890, 105, 125),
      ovalPath(535, 1035, 75, 40),
      ovalPath(665, 1035, 75, 40),
      'M395 430Q385 270 425 212Q448 192 472 210Q535 255 568 320Z',
      'M428 375Q424 285 446 245Q462 232 478 246Q516 285 538 335Z',
      mirrorPath('M395 430Q385 270 425 212Q448 192 472 210Q535 255 568 320Z'),
      mirrorPath('M428 375Q424 285 446 245Q462 232 478 246Q516 285 538 335Z'),
      ovalPath(600, 480, 225, 185),
      ovalPath(472, 562, 50, 33),
      ovalPath(728, 562, 50, 33),
    ],
    details: [
      dotPath(518, 480, 12),
      dotPath(682, 480, 12),
      dotPath(600, 535, 20, 13),
      'M600 548Q596 585 566 588M600 548Q604 585 634 588',
      'M440 520L360 505M440 545L362 560M760 520L840 505M760 545L838 560',
    ],
  },
  {
    id: 'dog',
    name: 'Puppy',
    regions: [
      'M765 905C870 890 915 800 900 715C893 680 852 682 852 718C850 790 822 830 755 850Z',
      'M600 620C445 620 395 830 412 960C422 1015 500 1025 600 1025C700 1025 778 1015 788 960C805 830 755 620 600 620Z',
      ovalPath(600, 890, 105, 125),
      ovalPath(535, 1035, 75, 40),
      ovalPath(665, 1035, 75, 40),
      'M445 650Q600 715 755 650L765 700Q600 770 435 700Z',
      ovalPath(600, 758, 38, 38),
      ovalPath(600, 470, 215, 190),
      ovalPath(670, 445, 56, 62),
      'M432 330C340 328 300 480 318 590C328 645 385 662 412 620C440 560 464 440 464 360Z',
      mirrorPath('M432 330C340 328 300 480 318 590C328 645 385 662 412 620C440 560 464 440 464 360Z'),
      ovalPath(600, 565, 110, 80),
    ],
    details: [
      dotPath(520, 455, 12),
      dotPath(680, 455, 12),
      dotPath(600, 530, 38, 25),
      'M600 555L600 590M600 590Q572 618 548 598M600 590Q628 618 652 598',
    ],
  },
  {
    id: 'fox',
    name: 'Fox',
    regions: [
      'M720 1010C930 1030 1060 870 1010 690C990 625 925 615 915 690C905 810 860 890 720 910Z',
      'M1010 690C990 625 925 615 915 690C935 735 995 740 1010 690Z',
      'M600 640C450 640 400 840 415 960C425 1015 500 1025 600 1025C700 1025 775 1015 785 960C800 840 750 640 600 640Z',
      'M600 690C520 720 495 840 510 920C520 975 560 990 600 990C640 990 680 975 690 920C705 840 680 720 600 690Z',
      ovalPath(535, 1035, 75, 40),
      ovalPath(665, 1035, 75, 40),
      'M392 450Q370 280 400 185Q410 165 432 180Q520 250 570 330Z',
      'M420 405Q405 300 422 230Q500 280 535 345Z',
      mirrorPath('M392 450Q370 280 400 185Q410 165 432 180Q520 250 570 330Z'),
      mirrorPath('M420 405Q405 300 422 230Q500 280 535 345Z'),
      'M600 290C450 290 382 380 372 470C366 525 340 565 298 600C420 640 520 690 600 722C680 690 780 640 902 600C860 565 834 525 828 470C818 380 750 290 600 290Z',
      'M298 600C380 560 470 548 528 592C562 622 584 672 600 722C520 690 420 640 298 600Z',
      mirrorPath('M298 600C380 560 470 548 528 592C562 622 584 672 600 722C520 690 420 640 298 600Z'),
    ],
    details: [
      dotPath(515, 490, 12),
      dotPath(685, 490, 12),
      dotPath(600, 695, 30, 20),
    ],
  },
  {
    id: 'owl',
    name: 'Owl',
    regions: [
      'M190 1000Q600 965 1010 1000Q1030 1025 1010 1050Q600 1015 190 1050Q170 1025 190 1000Z',
      'M412 330Q390 240 395 190Q450 215 515 262Z',
      mirrorPath('M412 330Q390 240 395 190Q450 215 515 262Z'),
      'M600 230C405 230 345 450 352 650C360 900 460 1010 600 1010C740 1010 840 900 848 650C855 450 795 230 600 230Z',
      ovalPath(600, 790, 150, 170),
      'M372 500C305 600 315 820 425 905C465 800 475 620 372 500Z',
      mirrorPath('M372 500C305 600 315 820 425 905C465 800 475 620 372 500Z'),
      ovalPath(500, 445, 92, 92),
      ovalPath(700, 445, 92, 92),
      ovalPath(500, 450, 44, 44),
      ovalPath(700, 450, 44, 44),
      'M555 520Q600 505 645 520Q628 582 600 622Q572 582 555 520Z',
      'M462 980Q462 1040 492 1036Q508 1058 530 1038Q554 1058 566 1034Q592 1034 590 980Z',
      mirrorPath('M462 980Q462 1040 492 1036Q508 1058 530 1038Q554 1058 566 1034Q592 1034 590 980Z'),
    ],
    details: [
      dotPath(500, 452, 16),
      dotPath(700, 452, 16),
      'M535 725Q555 748 575 725M625 725Q645 748 665 725M580 800Q600 823 620 800M535 875Q555 898 575 875M625 875Q645 898 665 875',
    ],
  },
  {
    id: 'turtle',
    name: 'Turtle',
    regions: [
      'M270 720Q180 728 145 800Q230 815 290 780Z',
      'M830 790C830 690 860 590 950 570C1025 555 1070 605 1065 668C1060 730 1005 752 955 744C938 762 930 780 930 790Z',
      ovalPath(385, 800, 75, 95),
      ovalPath(775, 800, 75, 95),
      'M250 760C250 490 410 370 580 370C750 370 910 490 910 760Z',
      'M500 480L660 480L712 590L660 700L500 700L448 590Z',
      ovalPath(345, 655, 58, 66),
      ovalPath(815, 655, 58, 66),
      ovalPath(425, 490, 48, 40),
      ovalPath(735, 490, 48, 40),
      'M250 740L910 740Q945 745 935 790Q925 815 890 815L270 815Q235 815 225 790Q215 745 250 740Z',
    ],
    details: [
      dotPath(975, 640, 12),
      'M1015 690Q990 712 960 700',
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
