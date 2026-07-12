import type { CollectionEntry } from 'astro:content';

type BlogPost = CollectionEntry<'blog'>;

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

export const renderPlateSvg = (seed: string, options: { large?: boolean; title?: string } = {}) => {
  const hash = hashSeed(seed);
  const width = options.large ? 640 : WIDTH;
  const height = options.large ? 360 : HEIGHT;
  const type = (((hash >>> 7) ^ (hash >>> 19) ^ hash) >>> 0) % 3;
  const body = type === 0 ? scatterPlate(width, height, hash) : type === 1 ? graphPlate(width, height, hash) : arcsPlate(width, height, hash);
  const title = options.title ? `<title>${options.title.replace(/[<>&"]/g, '')}</title>` : '';

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-hidden="${options.title ? 'false' : 'true'}" focusable="false" xmlns="http://www.w3.org/2000/svg">${title}${body}</svg>`;
};

export const getFigNumber = (posts: BlogPost[], post: BlogPost) => {
  const ordered = posts
    .filter((entry) => !entry.data.draft)
    .slice()
    .sort((a, b) => a.data.pubDate.valueOf() - b.data.pubDate.valueOf());
  return ordered.findIndex((entry) => entry.id === post.id) + 1;
};
