import type { CollectionEntry } from 'astro:content';

type BlogPost = CollectionEntry<'blog'>;
type PlateSpec = BlogPost['data']['plate'];

const WIDTH = 160;
const HEIGHT = 120;

const hashSeed = (seed: string) => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const numberFromHash = (hash: number, index: number, min: number, max: number) => {
  const shifted = (hash >>> ((index * 5) % 24)) & 255;
  return min + (shifted / 255) * (max - min);
};

const streamHash = (hash: number, salt: number) => Math.imul(hash ^ salt, 0x9e3779b1) >>> 0;

const attrs = (values: Record<string, string | number>) =>
  Object.entries(values)
    .map(([key, value]) => `${key}="${String(value)}"`)
    .join(' ');

const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  weight: number,
  className = 'redraw',
  stroke = 'var(--plate-ink)',
  opacity = 1
) =>
  `<line ${attrs({
    x1: x1.toFixed(1),
    y1: y1.toFixed(1),
    x2: x2.toFixed(1),
    y2: y2.toFixed(1),
    stroke,
    'stroke-width': weight,
    'stroke-linecap': 'round',
    opacity,
    class: className,
    pathLength: 1,
  })} />`;

const circle = (
  cx: number,
  cy: number,
  r: number,
  fill = 'var(--plate-ink)',
  stroke = 'var(--plate-ink)',
  weight = 1,
  className = 'redraw',
  opacity = 1
) =>
  `<circle ${attrs({
    cx: cx.toFixed(1),
    cy: cy.toFixed(1),
    r: r.toFixed(1),
    fill,
    stroke,
    'stroke-width': weight,
    opacity,
    class: className,
    pathLength: 1,
  })} />`;

const path = (
  d: string,
  weight: number,
  className = 'redraw',
  stroke = 'var(--plate-ink)',
  opacity = 1
) =>
  `<path ${attrs({
    d,
    fill: 'none',
    stroke,
    'stroke-width': weight,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    opacity,
    class: className,
    pathLength: 1,
  })} />`;

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  opacity = 1,
  extra: Record<string, string | number> = {}
) => `<rect ${attrs({ x, y, width, height, fill, opacity, ...extra })} />`;

const plateStroke = (width: number) => (width > 300 ? 2.8 : 1.8);
const plateHeavyStroke = (width: number) => (width > 300 ? 3.2 : 2.3);

const frame = (width: number, height: number, hash: number) => {
  const marks: string[] = [
    rect(0, 0, width, height, 'var(--plate-ground)'),
    rect(5, 5, width - 10, height - 10, 'var(--plate-paper)', 0.18),
  ];

  for (let i = 0; i < 13; i += 1) {
    const x = numberFromHash(hash, i, 8, width - 8);
    marks.push(line(x, 6, x, height - 6, 0.55, 'grain', 'var(--plate-ink)', 0.35));
  }

  for (let i = 0; i < 8; i += 1) {
    const y = numberFromHash(hash, i + 13, 8, height - 8);
    marks.push(line(6, y, width - 6, y, 0.5, 'grain', 'var(--plate-ink)', 0.3));
  }

  marks.push(
    rect(6, 6, width - 12, height - 12, 'none', 0.7, {
      stroke: 'var(--plate-ink)',
      'stroke-width': 1.2,
    })
  );

  return marks;
};

const text = (
  x: number,
  y: number,
  value: string,
  size: number,
  fill = 'var(--plate-ink)',
  anchor = 'middle',
  opacity = 1
) =>
  `<text ${attrs({
    x: x.toFixed(1),
    y: y.toFixed(1),
    fill,
    'font-family': 'var(--font-mono)',
    'font-size': size.toFixed(1),
    'font-weight': 560,
    'text-anchor': anchor,
    opacity,
  })}>${value.replace(/[<>&"]/g, '')}</text>`;

const polygon = (
  points: [number, number][],
  fill = 'var(--plate-ink)',
  opacity = 1,
  className = 'redraw'
) =>
  `<polygon ${attrs({
    points: points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
    fill,
    opacity,
    class: className,
  })} />`;

const scatterPlate = (width: number, height: number, hash: number) => {
  const marks = frame(width, height, hash);
  const jitterHash = streamHash(hash, 0x85ebca6b);
  const points: [number, number][] = [];
  const count = width > 300 ? 46 : 26;

  for (let i = 0; i < count; i += 1) {
    const x = numberFromHash(hash, i, 16, width - 16);
    const curve = height * 0.68 - Math.sin((x / width) * Math.PI) * height * 0.34;
    const y = curve + numberFromHash(jitterHash, i, -height * 0.12, height * 0.12);
    points.push([x, y]);
    marks.push(circle(x, y, width > 300 ? 3.4 : 2.4));
    marks.push(circle(x - 0.7, y - 0.7, width > 300 ? 1.1 : 0.8, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.95));
  }

  const curveD = points
    .sort((a, b) => a[0] - b[0])
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(' ');

  marks.push(path(curveD, width > 300 ? 3.2 : 2.2));
  marks.push(path(curveD, width > 300 ? 1.2 : 0.85, 'redraw', 'var(--plate-paper)', 0.9));
  marks.push(line(14, height - 16, width - 14, height - 16, 1.5));
  marks.push(line(18, 14, 18, height - 14, 1.5));
  marks.push(line(width - 44, 20, width - 18, 20, 1.1, 'redraw', 'var(--plate-paper)', 0.95));

  return marks.join('');
};

const graphPlate = (width: number, height: number, hash: number) => {
  const marks = frame(width, height, hash);
  const offsetHash = streamHash(hash, 0xc2b2ae35);
  const columns = width > 300 ? 4 : 3;
  const rows = width > 300 ? 3 : 2;
  const nodes: [number, number][] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const index = row * columns + col;
      nodes.push([
        width * (0.18 + (col / Math.max(columns - 1, 1)) * 0.64) +
          numberFromHash(hash, index, -width * 0.035, width * 0.035),
        height * (0.24 + (row / Math.max(rows - 1, 1)) * 0.52) +
          numberFromHash(offsetHash, index, -height * 0.06, height * 0.06),
      ]);
    }
  }

  nodes.forEach((node, index) => {
    const right = index + 1;
    const down = index + columns;
    const heavy = width > 300 ? 2 : 1.45;
    if (right < nodes.length && right % columns !== 0) marks.push(line(node[0], node[1], nodes[right][0], nodes[right][1], heavy));
    if (down < nodes.length) marks.push(line(node[0], node[1], nodes[down][0], nodes[down][1], heavy));
    if (index % 3 === 0 && down + 1 < nodes.length) marks.push(line(node[0], node[1], nodes[down + 1][0], nodes[down + 1][1], width > 300 ? 1.35 : 1));
  });

  nodes.forEach((node, index) => {
    const radius = (index % 4 === 0 ? 7 : 5.2) * (width > 300 ? 1.35 : 1);
    marks.push(circle(node[0], node[1], radius, 'var(--plate-ink)', 'var(--plate-ink)', 1.4));
    marks.push(circle(node[0] - radius * 0.24, node[1] - radius * 0.24, radius * 0.34, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));
  });

  marks.push(
    rect(width * 0.08, height * 0.12, width * 0.84, height * 0.76, 'none', 0.8, {
      stroke: 'var(--plate-paper)',
      'stroke-width': width > 300 ? 1.6 : 1,
      class: 'redraw',
      pathLength: 1,
    })
  );

  return marks.join('');
};

const arcsPlate = (width: number, height: number, hash: number) => {
  const marks = frame(width, height, hash);
  const arcHash = streamHash(hash, 0x27d4eb2f);
  const cx = numberFromHash(hash, 3, width * 0.35, width * 0.62);
  const cy = numberFromHash(arcHash, 8, height * 0.52, height * 0.7);
  const count = width > 300 ? 10 : 7;

  for (let i = 0; i < count; i += 1) {
    const r = Math.min(width, height) * 0.13 + i * Math.min(width, height) * 0.065;
    const start = -172 + i * 5;
    const end = 58 + i * 9;
    const x1 = cx + r * Math.cos((start * Math.PI) / 180);
    const y1 = cy + r * Math.sin((start * Math.PI) / 180);
    const x2 = cx + r * Math.cos((end * Math.PI) / 180);
    const y2 = cy + r * Math.sin((end * Math.PI) / 180);
    const large = end - start > 180 ? 1 : 0;
    const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    marks.push(path(d, width > 300 ? 2.4 : 1.8));
    if (i % 2 === 0) marks.push(path(d, width > 300 ? 0.8 : 0.55, 'redraw', 'var(--plate-paper)', 0.82));
  }

  for (let i = 0; i < 12; i += 1) {
    const angle = ((-160 + i * 22) * Math.PI) / 180;
    const inner = Math.min(width, height) * 0.08;
    const outer = Math.min(width, height) * (i % 3 === 0 ? 0.43 : 0.35);
    marks.push(line(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner, cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer, width > 300 ? 1.1 : 0.8, 'redraw', 'var(--plate-ink)', 0.85));
  }

  marks.push(line(cx, cy, width - 16, cy, 1.5));
  marks.push(line(cx, cy, cx, 16, 1.5));
  marks.push(circle(cx, cy, width > 300 ? 6 : 4.2));
  marks.push(circle(cx - 1.1, cy - 1.1, width > 300 ? 2.1 : 1.4, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));

  return marks.join('');
};

const calibrationPlate = (width: number, height: number, hash: number) => {
  const marks = frame(width, height, hash);
  const cx = width * 0.42;
  const cy = height * 0.68;
  const base = Math.min(width, height);
  const count = width > 300 ? 10 : 8;

  for (let i = 0; i < count; i += 1) {
    const r = base * (0.12 + i * 0.058);
    const start = -168 + i * 2.5;
    const end = 52 + i * 6.2;
    const x1 = cx + r * Math.cos((start * Math.PI) / 180);
    const y1 = cy + r * Math.sin((start * Math.PI) / 180);
    const x2 = cx + r * Math.cos((end * Math.PI) / 180);
    const y2 = cy + r * Math.sin((end * Math.PI) / 180);
    const large = end - start > 180 ? 1 : 0;
    const d = `M ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    marks.push(path(d, plateStroke(width)));
    if (i % 2 === 0) marks.push(path(d, width > 300 ? 1 : 0.75, 'redraw', 'var(--plate-paper)', 0.8));
  }

  for (let i = 0; i < 15; i += 1) {
    const angle = ((-158 + i * 15) * Math.PI) / 180;
    const inner = base * 0.09;
    const outer = base * (i % 3 === 0 ? 0.47 : 0.39);
    marks.push(line(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner, cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer, width > 300 ? 1.8 : 1.25, 'redraw', 'var(--plate-ink)', 0.88));
  }

  const needleAngle = (-28 * Math.PI) / 180;
  const needleEndX = cx + Math.cos(needleAngle) * base * 0.5;
  const needleEndY = cy + Math.sin(needleAngle) * base * 0.5;
  marks.push(line(cx, cy, needleEndX, needleEndY, plateHeavyStroke(width)));
  marks.push(line(cx, cy - (width > 300 ? 2.8 : 1.2), needleEndX, needleEndY - (width > 300 ? 2.8 : 1.2), width > 300 ? 1.1 : 0.8, 'redraw', 'var(--plate-paper)', 0.78));
  marks.push(line(cx, cy, cx, height * 0.16, plateStroke(width)));
  marks.push(circle(cx, cy, width > 300 ? 11 : 5));
  marks.push(circle(cx - (width > 300 ? 2.7 : 1.2), cy - (width > 300 ? 2.7 : 1.2), width > 300 ? 3.6 : 1.7, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));

  return marks.join('');
};

const barsPlate = (width: number, height: number, hash: number, params: Record<string, any> = {}) => {
  const marks = frame(width, height, hash);
  const groups = Array.isArray(params.groups) ? params.groups : [];
  const parsed = groups
    .map((group) => ({
      label: typeof group?.label === 'string' ? group.label : '',
      values: Array.isArray(group?.values)
        ? group.values.map((value: unknown) => Number(value)).filter(Number.isFinite)
        : [],
    }))
    .filter((group) => group.values.length > 0);

  const allValues = parsed.flatMap((group) => group.values);
  const min = Math.min(-100, 0, ...allValues);
  const max = Math.max(35, 0, ...allValues);
  const top = height * 0.18;
  const bottom = height * 0.82;
  const left = width * 0.12;
  const right = width * 0.9;
  const scale = (value: number) => bottom - ((value - min) / Math.max(max - min, 1)) * (bottom - top);
  const baseline = height * 0.46;
  const winningIndex = parsed.reduce((best, group, index) => {
    const bestValue = Math.max(...group.values);
    const current = Math.max(...parsed[best].values);
    return bestValue > current ? index : best;
  }, 0);

  marks.push(line(left, baseline, right, baseline, plateHeavyStroke(width)));
  marks.push(line(left, top, left, bottom, plateStroke(width)));

  const groupStep = (right - left) / Math.max(parsed.length, 1);
  parsed.forEach((group, groupIndex) => {
    const center = left + groupStep * (groupIndex + 0.5);
    const barGap = groupStep / (group.values.length + 1);
    group.values.forEach((value, valueIndex) => {
      const x = center - (barGap * (group.values.length - 1)) / 2 + barGap * valueIndex;
      const y = value === 0 ? baseline : scale(value);
      const weight = width > 300 ? 14 : 10;
      const notch = width > 300 ? 18 : 7;
      marks.push(line(x, baseline, x, value === 0 ? baseline - notch : y, weight, 'redraw', 'var(--plate-ink)', 0.94));
      marks.push(line(x - weight * 0.28, baseline, x - weight * 0.28, value === 0 ? baseline - notch : y, Math.max(weight * 0.18, 1.4), 'redraw', 'var(--plate-paper)', 0.9));
      if (groupIndex === winningIndex) {
        marks.push(line(x + weight * 0.28, baseline, x + weight * 0.28, value === 0 ? baseline - notch : y, Math.max(weight * 0.18, 1.4), 'redraw', 'var(--plate-paper)', 0.9));
      }
    });
    if (group.label) marks.push(text(center, height * 0.91, group.label, width > 300 ? 18 : 7.2, 'var(--plate-ink)', 'middle', 0.84));
  });

  return marks.join('');
};

const budgetPlate = (width: number, height: number, hash: number, params: Record<string, any> = {}) => {
  const marks = frame(width, height, hash);
  const total = Number.isFinite(Number(params.total)) ? Number(params.total) : 1;
  const ticks = Math.max(1, Math.floor(Number(params.ticks) || 1));
  const emphasis = typeof params.emphasis === 'string' ? params.emphasis : '';
  const left = width * 0.13;
  const right = width * 0.88;
  const y = height * 0.56;
  const tickHeight = height * 0.2;

  marks.push(line(left, y, right, y, plateHeavyStroke(width)));
  marks.push(line(left, y - tickHeight * 0.55, left, y + tickHeight * 0.55, plateHeavyStroke(width)));
  marks.push(line(right, y - tickHeight * 0.55, right, y + tickHeight * 0.55, plateHeavyStroke(width)));
  for (let i = 0; i <= ticks; i += 1) {
    const x = left + ((right - left) * i) / ticks;
    marks.push(line(x, y - tickHeight * 0.5, x, y + tickHeight * 0.5, plateStroke(width)));
    marks.push(line(x + (width > 300 ? 2.1 : 1.2), y - tickHeight * 0.46, x + (width > 300 ? 2.1 : 1.2), y + tickHeight * 0.46, width > 300 ? 1.2 : 0.8, 'redraw', 'var(--plate-paper)', 0.82));
  }

  marks.push(text(left, y + height * 0.28, '0', width > 300 ? 22 : 8.5, 'var(--plate-ink)', 'middle', 0.9));
  marks.push(text(right, y + height * 0.28, String(total), width > 300 ? 22 : 8.5, 'var(--plate-ink)', 'middle', 0.9));

  const bracketLeft = left + (right - left) * 0.48;
  const bracketRight = left + (right - left) * 0.78;
  const bracketY = y - height * 0.28;
  marks.push(line(bracketLeft, bracketY, bracketRight, bracketY, plateHeavyStroke(width), 'redraw', 'var(--plate-ink)', 0.95));
  marks.push(line(bracketLeft, bracketY, bracketLeft, bracketY + height * 0.12, plateHeavyStroke(width), 'redraw', 'var(--plate-ink)', 0.95));
  marks.push(line(bracketRight, bracketY, bracketRight, bracketY + height * 0.12, plateHeavyStroke(width), 'redraw', 'var(--plate-ink)', 0.95));
  marks.push(line(bracketLeft, bracketY - (width > 300 ? 2.5 : 1.2), bracketRight, bracketY - (width > 300 ? 2.5 : 1.2), width > 300 ? 1.1 : 0.75, 'redraw', 'var(--plate-paper)', 0.9));
  if (emphasis) {
    marks.push(text((bracketLeft + bracketRight) / 2, bracketY - height * 0.07, emphasis, width > 300 ? 22 : 8.2, 'var(--plate-ink)', 'middle', 0.95));
  }

  return marks.join('');
};

const flowPlate = (width: number, height: number, hash: number, params: Record<string, any> = {}) => {
  const marks = frame(width, height, hash);
  const inputs = Math.max(1, Math.min(6, Math.floor(Number(params.inputs) || 3)));
  const layerX = width * 0.46;
  const layerY = height * 0.2;
  const layerW = width * 0.13;
  const layerH = height * 0.6;
  const joinX = layerX + layerW;
  const joinY = height * 0.5;

  for (let i = 0; i < inputs; i += 1) {
    const y = height * (0.22 + (inputs === 1 ? 0.28 : (i / (inputs - 1)) * 0.56));
    const d = `M ${(width * 0.06).toFixed(1)} ${y.toFixed(1)} C ${(width * 0.21).toFixed(1)} ${y.toFixed(1)} ${(width * 0.31).toFixed(1)} ${joinY.toFixed(1)} ${layerX.toFixed(1)} ${joinY.toFixed(1)}`;
    marks.push(path(d, plateHeavyStroke(width)));
    marks.push(path(d, width > 300 ? 1.1 : 0.8, 'redraw', 'var(--plate-paper)', 0.78));
  }

  marks.push(rect(layerX, layerY, layerW, layerH, 'var(--plate-ink)', 0.82));
  for (let i = 0; i < 6; i += 1) {
    const y = layerY + (layerH * i) / 5;
    marks.push(line(layerX + layerW * 0.14, y + layerH * 0.08, layerX + layerW * 0.86, y - layerH * 0.08, width > 300 ? 1.7 : 1.1, 'redraw', 'var(--plate-paper)', 0.86));
  }
  marks.push(line(joinX, joinY, width * 0.92, joinY, plateHeavyStroke(width)));
  marks.push(line(joinX, joinY - (width > 300 ? 3 : 1.3), width * 0.92, joinY - (width > 300 ? 3 : 1.3), width > 300 ? 1.1 : 0.8, 'redraw', 'var(--plate-paper)', 0.78));
  marks.push(arrowhead(width * 0.92, joinY, 0, width > 300 ? 13 : 5.2));

  return marks.join('');
};

const arrowhead = (x: number, y: number, angle: number, size: number) =>
  polygon(
    [
      [x, y],
      [x - Math.cos(angle - 0.45) * size, y - Math.sin(angle - 0.45) * size],
      [x - Math.cos(angle + 0.45) * size, y - Math.sin(angle + 0.45) * size],
    ],
    'var(--plate-ink)',
    0.9
  );

const networkPlate = (width: number, height: number, hash: number, params: Record<string, any> = {}) => {
  const marks = frame(width, height, hash);
  const spokes = Math.max(3, Math.min(14, Math.floor(Number(params.spokes) || 8)));
  const cx = width * 0.5;
  const cy = height * 0.5;
  const rx = width * 0.32;
  const ry = height * 0.28;
  const nodeR = width > 300 ? 8 : 3.1;
  const centerR = width > 300 ? 13 : 5.2;

  for (let i = 0; i < spokes; i += 1) {
    const angle = -Math.PI / 2 + (i / spokes) * Math.PI * 2;
    const jitter = numberFromHash(hash, i, -0.08, 0.08);
    const x = cx + Math.cos(angle + jitter) * rx;
    const y = cy + Math.sin(angle + jitter) * ry;
    const targetX = cx + Math.cos(angle) * centerR * 0.9;
    const targetY = cy + Math.sin(angle) * centerR * 0.9;
    marks.push(line(x, y, targetX, targetY, width > 300 ? 1.8 : 1.05));
    marks.push(arrowhead(targetX, targetY, Math.atan2(targetY - y, targetX - x), width > 300 ? 8 : 3.2));
    marks.push(circle(x, y, nodeR));
    marks.push(circle(x - nodeR * 0.24, y - nodeR * 0.24, nodeR * 0.34, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));
  }

  marks.push(circle(cx, cy, centerR));
  marks.push(circle(cx - centerR * 0.24, cy - centerR * 0.24, centerR * 0.34, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));

  return marks.join('');
};

const clusterGraphPlate = (width: number, height: number, hash: number) => {
  const marks = frame(width, height, hash);
  const hub: [number, number] = [width * 0.5, height * 0.5];
  const centers: [number, number][] = [
    [width * 0.29, height * 0.31],
    [width * 0.7, height * 0.34],
    [width * 0.52, height * 0.74],
  ];
  const clusterCounts = [4, 3, 4];
  const nodes: [number, number][][] = centers.map((center, clusterIndex) =>
    Array.from({ length: clusterCounts[clusterIndex] }, (_, nodeIndex) => {
      const angle = (nodeIndex / clusterCounts[clusterIndex]) * Math.PI * 2 + numberFromHash(hash, clusterIndex * 5 + nodeIndex, -0.18, 0.18);
      return [
        center[0] + Math.cos(angle) * width * 0.09,
        center[1] + Math.sin(angle) * height * 0.1,
      ];
    })
  );

  nodes.forEach((cluster, clusterIndex) => {
    const center = centers[clusterIndex];
    marks.push(line(hub[0], hub[1], center[0], center[1], plateHeavyStroke(width)));
    marks.push(line(hub[0], hub[1] - (width > 300 ? 2.4 : 1), center[0], center[1] - (width > 300 ? 2.4 : 1), width > 300 ? 1 : 0.7, 'redraw', 'var(--plate-paper)', 0.72));
    cluster.forEach((node, index) => {
      const next = cluster[(index + 1) % cluster.length];
      marks.push(line(node[0], node[1], next[0], next[1], plateStroke(width), 'redraw', 'var(--plate-ink)', 0.88));
      marks.push(line(node[0], node[1], center[0], center[1], plateStroke(width), 'redraw', 'var(--plate-ink)', 0.78));
    });
  });

  marks.push(circle(hub[0], hub[1], width > 300 ? 22 : 8.2));
  marks.push(circle(hub[0] - (width > 300 ? 5 : 2), hub[1] - (width > 300 ? 5 : 2), width > 300 ? 7 : 2.6, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));
  nodes.flat().forEach((node, index) => {
    const radius = (index % 3 === 0 ? 6.2 : 5.2) * (width > 300 ? 1.45 : 1);
    marks.push(circle(node[0], node[1], radius));
    marks.push(circle(node[0] - radius * 0.24, node[1] - radius * 0.24, radius * 0.34, 'var(--plate-paper)', 'var(--plate-paper)', 0, 'grain', 0.92));
  });

  return marks.join('');
};

const renderPlateBody = (seed: string, width: number, height: number, hash: number, plate?: PlateSpec) => {
  if (!plate) {
    const type = (((hash >>> 7) ^ (hash >>> 19) ^ hash) >>> 0) % 3;
    return {
      kind: 'abstract',
      body: type === 0 ? scatterPlate(width, height, hash) : type === 1 ? graphPlate(width, height, hash) : arcsPlate(width, height, hash),
    };
  }

  const params = plate.params ?? {};
  switch (plate.kind) {
    case 'calibration':
      return { kind: plate.kind, body: calibrationPlate(width, height, hash) };
    case 'bars':
      return { kind: plate.kind, body: barsPlate(width, height, hash, params) };
    case 'budget':
      return { kind: plate.kind, body: budgetPlate(width, height, hash, params) };
    case 'flow':
      return { kind: plate.kind, body: flowPlate(width, height, hash, params) };
    case 'network':
      return { kind: plate.kind, body: networkPlate(width, height, hash, params) };
    case 'graph':
      return { kind: plate.kind, body: clusterGraphPlate(width, height, hash) };
    default:
      return { kind: 'abstract', body: renderPlateBody(seed, width, height, hash).body };
  }
};

export const renderPlateSvg = (
  seed: string,
  options: { large?: boolean; title?: string; plate?: PlateSpec } = {}
) => {
  const hash = hashSeed(seed);
  const width = options.large ? 640 : WIDTH;
  const height = options.large ? 360 : HEIGHT;
  const { kind, body } = renderPlateBody(seed, width, height, hash, options.plate);
  const title = options.title ? `<title>${options.title.replace(/[<>&"]/g, '')}</title>` : '';

  return `<svg viewBox="0 0 ${width} ${height}" data-plate-kind="${kind}" role="img" aria-hidden="${options.title ? 'false' : 'true'}" focusable="false" xmlns="http://www.w3.org/2000/svg">${title}${body}</svg>`;
};

export const getFigNumber = (posts: BlogPost[], post: BlogPost) => {
  const ordered = posts
    .filter((entry) => !entry.data.draft)
    .slice()
    .sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
  return ordered.findIndex((entry) => entry.id === post.id) + 1;
};
