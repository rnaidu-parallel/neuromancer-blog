// Renders the default social-share card (1200×630) → public/images/og-default.png.
// Used as the og:image / twitter:image fallback for any page without its own image.
// Re-run after design changes: `node scripts/gen-og-default.mjs`. Output is committed
// (build-time scrapers need a real raster — SVG is rejected by X/Facebook/LinkedIn).
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/images/og-default.png', import.meta.url));

// design tokens mirrored from src/styles/global.css (dark theme)
const bg = '#0a0e12';
const accent = '#a8173a';
const bright = '#edf3f6';
const dim = '#6e7f8b';
const grid = 'rgba(110, 11, 33, 0.10)';

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="vignette" cx="50%" cy="42%" r="75%">
      <stop offset="55%" stop-color="${bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="#02060a" stop-opacity="0.55"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0 H0 V40" fill="none" stroke="${grid}" stroke-width="1"/>
    </pattern>
  </defs>

  <rect width="1200" height="630" fill="${bg}"/>
  <rect width="1200" height="630" fill="url(#grid)"/>
  <rect width="1200" height="630" fill="url(#vignette)"/>

  <!-- blood-red top rule -->
  <rect x="0" y="0" width="1200" height="6" fill="${accent}"/>

  <!-- wordmark -->
  <text x="100" y="330" font-family="'Martian Mono', ui-monospace, Menlo, monospace"
        font-size="118" font-weight="700" letter-spacing="-2" fill="${bright}">blackwall<tspan fill="${accent}">_</tspan></text>

  <!-- domain -->
  <text x="104" y="408" font-family="'Martian Mono', ui-monospace, Menlo, monospace"
        font-size="34" font-weight="500" letter-spacing="2" fill="${dim}">blog.neuromancer.in</text>
</svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log('wrote', out);
