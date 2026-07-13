// Renders the default social-share card (1200x630) to public/images/og-default.png.
// Re-run after identity changes: `node scripts/gen-og-default.mjs`.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/images/og-default.png', import.meta.url));
const besley = fileURLToPath(
  new URL('../node_modules/@fontsource-variable/besley/files/besley-latin-wght-normal.woff2', import.meta.url)
);
const besleyData = readFileSync(besley).toString('base64');

const rag = '#FCFBF7';
const ink = '#1A2129';
const prussian = '#17456E';
const wash = '#E3EDF5';
const stamp = '#C63D2F';
const dim = '#5D6872';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <style>
      @font-face {
        font-family: 'Besley OG';
        src: url('data:font/woff2;base64,${besleyData}') format('woff2');
        font-weight: 400 900;
      }
      .display { font-family: 'Besley OG', Georgia, serif; }
      .body { font-family: Georgia, serif; }
      .mono { font-family: Menlo, Consolas, monospace; }
    </style>
    <pattern id="grain" width="34" height="34" patternUnits="userSpaceOnUse">
      <path d="M0 13 H34 M12 0 V34" stroke="${prussian}" stroke-opacity="0.055" stroke-width="1"/>
      <circle cx="25" cy="8" r="1.2" fill="${prussian}" fill-opacity="0.075"/>
      <circle cx="7" cy="27" r="0.9" fill="${stamp}" fill-opacity="0.08"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="${rag}"/>
  <rect width="1200" height="630" fill="url(#grain)"/>
  <rect x="74" y="70" width="1052" height="1" fill="${prussian}" opacity="0.42"/>
  <rect x="74" y="78" width="1052" height="1" fill="${prussian}" opacity="0.42"/>
  <rect x="74" y="552" width="1052" height="1" fill="${prussian}" opacity="0.42"/>
  <rect x="74" y="560" width="1052" height="1" fill="${prussian}" opacity="0.42"/>

  <text x="600" y="275" text-anchor="middle" class="display" font-size="112" font-weight="800" letter-spacing="0" fill="${ink}">RAHUL NAIDU</text>
  <text x="102" y="346" class="body" font-size="40" fill="${prussian}">A journal of measured work in AI engineering.</text>

  <rect x="102" y="396" width="720" height="1" fill="${prussian}" opacity="0.55"/>
  <rect x="102" y="408" width="720" height="1" fill="${prussian}" opacity="0.35"/>

  <text x="102" y="468" class="mono" font-size="24" letter-spacing="1" fill="${dim}">VOL. I · EST. JUNE 2026 · blog.neuromancer.in</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
console.log('loaded Besley font', besley);
