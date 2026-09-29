/* Renders the product artwork as studio-style product shots.
   Every product is fictional, so there is no photograph of "Aurora X1 Pro" to
   use. Instead each product is drawn as a lit studio render: a seamless
   backdrop with a light pool, a two-part contact shadow, a faint floor
   reflection, and materials built from multi-stop gradients plus a specular
   edge. One shared lighting rig keeps the set looking like a single shoot.

   Output: assets/images/*.svg (filenames are referenced from js/products.js)

   Run: node tools/make-images.js                                      */
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'assets', 'images');
const SIZE = 800;
const GROUND = 604;      // y of the surface the product rests on

/* ------------------------------------------------------------------ colour */

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(rgb) { return '#' + rgb.map((v) => clamp(v).toString(16).padStart(2, '0')).join(''); }

/* amount > 0 lightens toward white, < 0 darkens toward black */
function shade(hex, amount) {
  const rgb = hexToRgb(hex);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  return rgbToHex(rgb.map((v) => v + (target - v) * t));
}

function mix(a, b, t) {
  const x = hexToRgb(a); const y = hexToRgb(b);
  return rgbToHex(x.map((v, i) => v + (y[i] - v) * t));
}

/* A metal body lit from the upper left: dark edge, broad diffuse, a hard
   specular band, then falloff. This is what stops flat vectors reading flat. */
function metalStops(base, id) {
  return `
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0.35">
      <stop offset="0" stop-color="${shade(base, -0.42)}"/>
      <stop offset="0.14" stop-color="${shade(base, 0.30)}"/>
      <stop offset="0.34" stop-color="${shade(base, -0.04)}"/>
      <stop offset="0.52" stop-color="${shade(base, 0.46)}"/>
      <stop offset="0.72" stop-color="${shade(base, -0.10)}"/>
      <stop offset="0.9" stop-color="${shade(base, 0.16)}"/>
      <stop offset="1" stop-color="${shade(base, -0.38)}"/>
    </linearGradient>`;
}

/* Vertical variant for slabs seen face-on. */
function metalV(base, id) {
  return `
    <linearGradient id="${id}" x1="0" y1="0" x2="0.25" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.34)}"/>
      <stop offset="0.22" stop-color="${shade(base, 0.06)}"/>
      <stop offset="0.5" stop-color="${shade(base, -0.22)}"/>
      <stop offset="0.74" stop-color="${shade(base, 0.02)}"/>
      <stop offset="1" stop-color="${shade(base, -0.34)}"/>
    </linearGradient>`;
}

/* ------------------------------------------------------------------ shared */

function defs(body) { return `  <defs>${body}\n  </defs>`; }

function studioRigs(id, tone) {
  /* Backdrop sweep, a soft light pool behind the product, and a floor that
     darkens toward the viewer so the product is not floating. */
  return `
    <linearGradient id="bg${id}" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="${shade(tone, 0.42)}"/>
      <stop offset="0.46" stop-color="${shade(tone, 0.20)}"/>
      <stop offset="1" stop-color="${shade(tone, -0.10)}"/>
    </linearGradient>
    <radialGradient id="pool${id}" cx="0.42" cy="0.34" r="0.62">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.85"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vig${id}" cx="0.5" cy="0.42" r="0.78">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.30"/>
    </radialGradient>
    <linearGradient id="floor${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="fade${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>
    <mask id="refl${id}">
      <rect x="0" y="${GROUND}" width="${SIZE}" height="${SIZE - GROUND}" fill="url(#fade${id})"/>
    </mask>
    <filter id="soft${id}" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="26"/>
    </filter>
    <filter id="soft2${id}" x="-45%" y="-45%" width="190%" height="190%">
      <feGaussianBlur stdDeviation="9"/>
    </filter>
    <filter id="drop${id}" x="-35%" y="-30%" width="170%" height="180%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#1A1A20" flood-opacity="0.34"/>
    </filter>`;
}

function backdrop(id, tone) {
  return `
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg${id})"/>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#pool${id})"/>
  <rect x="0" y="${GROUND - 30}" width="${SIZE}" height="${SIZE - GROUND + 30}" fill="url(#floor${id})"/>`;
}

function contactShadow(id, cx, rx, ry) {
  return `
  <ellipse cx="${cx}" cy="${GROUND + 6}" rx="${rx}" ry="${ry}" fill="#141419" opacity="0.30" filter="url(#soft${id})"/>
  <ellipse cx="${cx}" cy="${GROUND + 2}" rx="${rx * 0.52}" ry="${ry * 0.6}" fill="#0E0E12" opacity="0.38" filter="url(#soft2${id})"/>`;
}

/* The product body is emitted once as #p{id} and re-used as a faint mirrored
   reflection, so the two can never drift apart. */
function reflection(id) {
  return `
  <g mask="url(#refl${id})">
    <use href="#p${id}" transform="translate(0 ${GROUND * 2}) scale(1 -1)"/>
  </g>`;
}

function svg(id, tone, label, product, shadow) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" role="img" aria-label="${label}">
${defs(studioRigs(id, tone) + product.defs)}
${backdrop(id, tone)}
${shadow}
  <g id="p${id}" filter="url(#drop${id})">
${product.body}
  </g>
${reflection(id)}
  <rect width="${SIZE}" height="${SIZE}" fill="url(#vig${id})"/>
</svg>
`;
}

/* Small helper for a glassy display face. */
function screenDefs(id, from, to, angle) {
  return `
    <linearGradient id="scr${id}" x1="0" y1="0" x2="${angle}" y2="1">
      <stop offset="0" stop-color="${from}"/>
      <stop offset="0.55" stop-color="${mix(from, to, 0.6)}"/>
      <stop offset="1" stop-color="${to}"/>
    </linearGradient>
    <linearGradient id="glare${id}" x1="0" y1="0" x2="1" y2="0.8">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.34"/>
      <stop offset="0.34" stop-color="#FFFFFF" stop-opacity="0.06"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`;
}

const TONES = { cool: '#D7DBE2', warm: '#DFD9D2', neutral: '#D5D7DA', mint: '#D6DEDC' };

/* ---------------------------------------------------------------- devices */

function phone(id, base, wallA, wallB, label) {
  const w = 236; const h = 468;
  const x = (SIZE - w) / 2; const y = 214;
  return {
    defs: metalV(base, `m${id}`) + screenDefs(id, wallA, wallB, '0.7') + `
    <linearGradient id="rim${id}" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="${shade(base, 0.55)}"/>
      <stop offset="0.5" stop-color="${shade(base, -0.2)}"/>
      <stop offset="1" stop-color="${shade(base, 0.3)}"/>
    </linearGradient>`,
    body: `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="42" fill="url(#rim${id})"/>
    <rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${h - 10}" rx="38" fill="url(#m${id})"/>
    <rect x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}" rx="31" fill="url(#scr${id})"/>
    <rect x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}" rx="31" fill="url(#glare${id})"/>
    <g opacity="0.5">
      <path d="M${x + 30} ${y + 300} C ${x + 92} ${y + 236}, ${x + 168} ${y + 262}, ${x + 214} ${y + 330}"
            fill="none" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2.5"/>
      <circle cx="${x + 196}" cy="${y + 356}" r="86" fill="#FFFFFF" opacity="0.10"/>
    </g>
    <rect x="${x + w / 2 - 26}" y="${y + 22}" width="52" height="15" rx="7.5" fill="#05060A"/>
    <circle cx="${x + w / 2 - 12}" cy="${y + 29.5}" r="4" fill="#1B2230"/>
    <circle cx="${x + w / 2 + 12}" cy="${y + 29.5}" r="4" fill="#1B2230"/>
    <text x="${x + w / 2}" y="${y + 128}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="46" font-weight="300" fill="#FFFFFF" fill-opacity="0.92" letter-spacing="-1">9:41</text>
    <text x="${x + w / 2}" y="${y + 156}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="13" fill="#FFFFFF" fill-opacity="0.6">Tuesday, 24 September</text>
    <rect x="${x + w + 2}" y="${y + 118}" width="5" height="40" rx="2.5" fill="${shade(base, 0.3)}"/>
    <rect x="${x + w + 2}" y="${y + 174}" width="5" height="66" rx="2.5" fill="${shade(base, 0.3)}"/>
    <rect x="${x - 7}" y="${y + 138}" width="5" height="80" rx="2.5" fill="${shade(base, 0.22)}"/>
    <path d="M${x + 20} ${y + 8} A 38 38 0 0 1 ${x + 60} ${y + 5}" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="2.5" stroke-linecap="round"/>`
  };
}

function laptop(id, base, wallA, wallB, label) {
  const sw = 356; const sh = 226;
  const sx = (SIZE - sw) / 2; const sy = 196;
  const deckY = sy + sh + 6;
  return {
    defs: metalV(base, `m${id}`) + screenDefs(id, wallA, wallB, '0.6') + `
    <linearGradient id="deck${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.34)}"/>
      <stop offset="0.3" stop-color="${shade(base, 0.12)}"/>
      <stop offset="1" stop-color="${shade(base, -0.16)}"/>
    </linearGradient>
    <linearGradient id="key${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(base, -0.30)}"/>
      <stop offset="1" stop-color="${shade(base, -0.52)}"/>
    </linearGradient>`,
    body: `
    <rect x="${sx}" y="${sy}" width="${sw}" height="${sh}" rx="16" fill="url(#m${id})"/>
    <rect x="${sx + 10}" y="${sy + 10}" width="${sw - 20}" height="${sh - 20}" rx="9" fill="url(#scr${id})"/>
    <rect x="${sx + 10}" y="${sy + 10}" width="${sw - 20}" height="${sh - 20}" rx="9" fill="url(#glare${id})"/>
    <g opacity="0.42">
      <rect x="${sx + 34}" y="${sy + 40}" width="120" height="9" rx="4.5" fill="#FFFFFF"/>
      <rect x="${sx + 34}" y="${sy + 60}" width="190" height="9" rx="4.5" fill="#FFFFFF" opacity="0.7"/>
      <rect x="${sx + 34}" y="${sy + 80}" width="150" height="9" rx="4.5" fill="#FFFFFF" opacity="0.5"/>
      <rect x="${sx + 34}" y="${sy + 112}" width="96" height="58" rx="8" fill="#FFFFFF" opacity="0.22"/>
      <rect x="${sx + 142}" y="${sy + 112}" width="96" height="58" rx="8" fill="#FFFFFF" opacity="0.16"/>
      <rect x="${sx + 250}" y="${sy + 112}" width="72" height="58" rx="8" fill="#FFFFFF" opacity="0.12"/>
    </g>
    <circle cx="${SIZE / 2}" cy="${sy + 12}" r="3" fill="${shade(base, -0.6)}"/>
    <path d="M${sx + 96} ${deckY} L ${sx - 6} ${deckY + 74} L ${sx + sw + 6} ${deckY + 74} L ${sx + sw - 96} ${deckY} Z" fill="url(#deck${id})"/>
    <path d="M${sx + 96} ${deckY} L ${sx + sw - 96} ${deckY} L ${sx + sw - 108} ${deckY + 7} L ${sx + 108} ${deckY + 7} Z" fill="${shade(base, -0.5)}"/>
    <g opacity="0.9">
      ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 12 }, (_, c) => {
        const kx = sx + 128 + c * 9.2 - r * 1.6;
        const ky = deckY + 16 + r * 10.5;
        return `<rect x="${kx.toFixed(1)}" y="${ky.toFixed(1)}" width="7.4" height="8" rx="1.6" fill="url(#key${id})"/>`;
      }).join('')).join('')}
    </g>
    <path d="M${sx + 178} ${deckY + 60} L ${sx + 166} ${deckY + 70} L ${sx + sw - 166} ${deckY + 70} L ${sx + sw - 178} ${deckY + 60} Z" fill="${shade(base, -0.22)}" opacity="0.5"/>
    <path d="M${sx + 20} ${sy + 6} A 16 16 0 0 1 ${sx + 60} ${sy + 4}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>`
  };
}

function overEar(id, base, accent, label) {
  const cupW = 132; const cupH = 176;
  const leftX = SIZE / 2 - 172; const rightX = SIZE / 2 + 40;
  return {
    defs: metalStops(base, `m${id}`) + `
    <linearGradient id="pad${id}" x1="0" y1="0" x2="0.6" y2="1">
      <stop offset="0" stop-color="${shade(base, -0.5)}"/>
      <stop offset="0.5" stop-color="${shade(base, -0.3)}"/>
      <stop offset="1" stop-color="${shade(base, -0.55)}"/>
    </linearGradient>
    <linearGradient id="band${id}" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.42)}"/>
      <stop offset="0.45" stop-color="${shade(base, 0.05)}"/>
      <stop offset="1" stop-color="${shade(base, -0.28)}"/>
    </linearGradient>`,
    body: `
    <path d="M${SIZE / 2 - 138} 372 C ${SIZE / 2 - 128} 250, ${SIZE / 2 - 74} 196, ${SIZE / 2} 196 C ${SIZE / 2 + 74} 196, ${SIZE / 2 + 128} 250, ${SIZE / 2 + 138} 372"
          fill="none" stroke="url(#band${id})" stroke-width="30" stroke-linecap="round"/>
    <path d="M${SIZE / 2 - 120} 300 C ${SIZE / 2 - 108} 236, ${SIZE / 2 - 70} 206, ${SIZE / 2} 206"
          fill="none" stroke="#FFFFFF" stroke-opacity="0.34" stroke-width="5" stroke-linecap="round"/>
    <g>
      <rect x="${leftX}" y="360" width="${cupW}" height="${cupH}" rx="52" fill="url(#m${id})"/>
      <ellipse cx="${leftX + cupW / 2}" cy="${450}" rx="${cupW / 2 - 10}" ry="${cupH / 2 - 12}" fill="url(#pad${id})"/>
      <ellipse cx="${leftX + cupW / 2 - 12}" cy="432" rx="26" ry="34" fill="${accent}" opacity="0.30"/>
      <rect x="${leftX + 10}" y="378" width="16" height="120" rx="8" fill="#FFFFFF" opacity="0.16"/>
    </g>
    <g>
      <rect x="${rightX}" y="360" width="${cupW}" height="${cupH}" rx="52" fill="url(#m${id})"/>
      <ellipse cx="${rightX + cupW / 2}" cy="${450}" rx="${cupW / 2 - 10}" ry="${cupH / 2 - 12}" fill="url(#pad${id})"/>
      <ellipse cx="${rightX + cupW / 2 + 12}" cy="432" rx="26" ry="34" fill="${accent}" opacity="0.26"/>
      <rect x="${rightX + cupW - 26}" y="378" width="16" height="120" rx="8" fill="#FFFFFF" opacity="0.16"/>
    </g>
    <rect x="${leftX - 8}" y="404" width="8" height="56" rx="4" fill="${shade(base, 0.2)}"/>
    <rect x="${rightX + cupW}" y="404" width="8" height="56" rx="4" fill="${shade(base, 0.2)}"/>`
  };
}

function earbuds(id, base, accent, label) {
  const caseY = 430;
  return {
    defs: metalV(base, `m${id}`) + `
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.5"/>
      <stop offset="0.4" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`,
    body: `
    <g>
      <rect x="${SIZE / 2 - 214}" y="236" width="58" height="150" rx="29" fill="url(#m${id})" transform="rotate(-13 ${SIZE / 2 - 185} 310)"/>
      <ellipse cx="${SIZE / 2 - 196}" cy="252" rx="29" ry="31" fill="url(#m${id})" transform="rotate(-13 ${SIZE / 2 - 185} 310)"/>
      <ellipse cx="${SIZE / 2 - 202}" cy="244" rx="13" ry="12" fill="${accent}" opacity="0.75" transform="rotate(-13 ${SIZE / 2 - 185} 310)"/>
      <ellipse cx="${SIZE / 2 - 206}" cy="238" rx="5" ry="4" fill="#FFFFFF" opacity="0.7" transform="rotate(-13 ${SIZE / 2 - 185} 310)"/>
    </g>
    <g>
      <rect x="${SIZE / 2 + 156}" y="236" width="58" height="150" rx="29" fill="url(#m${id})" transform="rotate(13 ${SIZE / 2 + 185} 310)"/>
      <ellipse cx="${SIZE / 2 + 196}" cy="252" rx="29" ry="31" fill="url(#m${id})" transform="rotate(13 ${SIZE / 2 + 185} 310)"/>
      <ellipse cx="${SIZE / 2 + 202}" cy="244" rx="13" ry="12" fill="${accent}" opacity="0.75" transform="rotate(13 ${SIZE / 2 + 185} 310)"/>
      <ellipse cx="${SIZE / 2 + 206}" cy="238" rx="5" ry="4" fill="#FFFFFF" opacity="0.7" transform="rotate(13 ${SIZE / 2 + 185} 310)"/>
    </g>
    <rect x="${SIZE / 2 - 130}" y="${caseY}" width="260" height="150" rx="46" fill="url(#m${id})"/>
    <rect x="${SIZE / 2 - 130}" y="${caseY}" width="260" height="150" rx="46" fill="url(#gloss${id})"/>
    <path d="M${SIZE / 2 - 130} ${caseY + 6} a 46 46 0 0 1 260 0" fill="#FFFFFF" opacity="0.10"/>
    <rect x="${SIZE / 2 - 112}" y="${caseY + 14}" width="46" height="8" rx="4" fill="${shade(base, -0.5)}" opacity="0.6"/>
    <circle cx="${SIZE / 2 + 92}" cy="${caseY + 122}" r="7" fill="${accent}" opacity="0.85"/>
    <path d="M${SIZE / 2 - 96} ${caseY + 20} A 40 40 0 0 1 ${SIZE / 2 - 40} ${caseY + 16}" fill="none" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="3" stroke-linecap="round"/>`
  };
}

function watch(id, base, screenA, screenB, label) {
  const w = 208; const h = 250;
  const x = (SIZE - w) / 2; const y = 286;
  return {
    defs: metalStops(base, `m${id}`) + screenDefs(id, screenA, screenB, '0.6') + `
    <linearGradient id="strap${id}" x1="0" y1="0" x2="1" y2="0.2">
      <stop offset="0" stop-color="${shade(base, -0.30)}"/>
      <stop offset="0.4" stop-color="${shade(base, 0.10)}"/>
      <stop offset="1" stop-color="${shade(base, -0.40)}"/>
    </linearGradient>`,
    body: `
    <path d="M${x + 46} ${y} L ${x + 46} ${y - 150} Q ${x + 46} ${y - 168} ${x + 64} ${y - 168} L ${x + w - 64} ${y - 168} Q ${x + w - 46} ${y - 168} ${x + w - 46} ${y - 150} L ${x + w - 46} ${y} Z" fill="url(#strap${id})"/>
    <path d="M${x + 46} ${y + h} L ${x + 46} ${y + h + 150} Q ${x + 46} ${y + h + 168} ${x + 64} ${y + h + 168} L ${x + w - 64} ${y + h + 168} Q ${x + w - 46} ${y + h + 168} ${x + w - 46} ${y + h + 150} L ${x + w - 46} ${y + h} Z" fill="url(#strap${id})"/>
    <rect x="${x + 46}" y="${y - 60}" width="${w - 92}" height="8" fill="#000000" opacity="0.14"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="56" fill="url(#m${id})"/>
    <rect x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}" rx="46" fill="url(#scr${id})"/>
    <rect x="${x + 13}" y="${y + 13}" width="${w - 26}" height="${h - 26}" rx="46" fill="url(#glare${id})"/>
    <g opacity="0.85">
      <circle cx="${x + w / 2}" cy="${y + 92}" r="44" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="7" stroke-linecap="round" transform="rotate(-90 ${x + w / 2} ${y + 92})" stroke-dasharray="207 277"/>
      <circle cx="${x + w / 2}" cy="${y + 92}" r="30" fill="none" stroke="#FFFFFF" stroke-opacity="0.28" stroke-width="5" transform="rotate(30 ${x + w / 2} ${y + 92})" stroke-dasharray="132 188"/>
    </g>
    <text x="${x + w / 2}" y="${y + 186}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="34" font-weight="500" fill="#FFFFFF" letter-spacing="-0.5">72</text>
    <text x="${x + w / 2}" y="${y + 208}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="12" fill="#FFFFFF" fill-opacity="0.65">BPM · RESTING</text>
    <rect x="${x + w - 4}" y="${y + 92}" width="12" height="44" rx="6" fill="${shade(base, 0.35)}"/>
    <rect x="${x + w + 2}" y="${y + 60}" width="8" height="20" rx="4" fill="${shade(base, 0.2)}"/>
    <path d="M${x + 22} ${y + 20} A 46 46 0 0 1 ${x + 74} ${y + 15}" fill="none" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="3" stroke-linecap="round"/>`
  };
}

function band(id, base, label) {
  const w = 96; const h = 470;
  const x = (SIZE - w) / 2; const y = 168;
  return {
    defs: `
    <linearGradient id="m${id}" x1="0" y1="0" x2="1" y2="0.25">
      <stop offset="0" stop-color="${shade(base, -0.28)}"/>
      <stop offset="0.2" stop-color="${shade(base, 0.30)}"/>
      <stop offset="0.55" stop-color="${shade(base, -0.05)}"/>
      <stop offset="0.85" stop-color="${shade(base, 0.22)}"/>
      <stop offset="1" stop-color="${shade(base, -0.32)}"/>
    </linearGradient>
    <linearGradient id="glow${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.55)}"/>
      <stop offset="1" stop-color="${shade(base, -0.1)}"/>
    </linearGradient>
    <linearGradient id="glare${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.30"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.04"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`,
    body: `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="46" fill="url(#m${id})"/>
    <rect x="${x + 14}" y="${y + 20}" width="${w - 28}" height="${h - 40}" rx="34" fill="url(#glow${id})" opacity="0.35"/>
    <rect x="${x + 10}" y="${y + 150}" width="${w - 20}" height="170" rx="30" fill="#0B0B10"/>
    <rect x="${x + 10}" y="${y + 150}" width="${w - 20}" height="170" rx="30" fill="url(#glare${id})" opacity="0.5"/>
    <text x="${SIZE / 2}" y="${y + 214}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="500" fill="#FFFFFF">64</text>
    <text x="${x + w / 2}" y="${y + 240}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="11" fill="#FFFFFF" fill-opacity="0.6">STEPS</text>
    <g opacity="0.8">
      <circle cx="${SIZE / 2}" cy="${y + 282}" r="18" fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="4"/>
      <circle cx="${SIZE / 2}" cy="${y + 282}" r="9" fill="${base}"/>
    </g>
    <rect x="${x + 20}" y="${y + 14}" width="14" height="${h - 28}" rx="7" fill="#FFFFFF" opacity="0.18"/>
    ${Array.from({ length: 5 }, (_, i) => `<rect x="${x - 6}" y="${y + 92 + i * 58}" width="8" height="34" rx="4" fill="${shade(base, -0.4)}"/>`).join('')}`
  };
}

function camera(id, base, label) {
  const w = 386; const h = 252;
  const x = (SIZE - w) / 2; const y = 300;
  return {
    defs: metalV(base, `m${id}`) + `
    <linearGradient id="lens${id}" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#4E5666"/>
      <stop offset="0.4" stop-color="#141821"/>
      <stop offset="1" stop-color="#05070C"/>
    </linearGradient>
    <radialGradient id="flare${id}" cx="0.34" cy="0.3" r="0.5">
      <stop offset="0" stop-color="#9FD4FF" stop-opacity="0.85"/>
      <stop offset="0.5" stop-color="#4E7FB8" stop-opacity="0.25"/>
      <stop offset="1" stop-color="#4E7FB8" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="grip${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${shade(base, -0.5)}"/>
      <stop offset="1" stop-color="${shade(base, -0.1)}"/>
    </linearGradient>`,
    body: `
    <rect x="${x - 66}" y="${y - 40}" width="86" height="30" rx="10" fill="${shade(base, -0.18)}"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="url(#m${id})"/>
    <rect x="${x + w - 92}" y="${y + 8}" width="84" height="${h - 16}" rx="22" fill="url(#grip${id})"/>
    <g opacity="0.5">
      ${Array.from({ length: 7 }, (_, i) => `<rect x="${x + w - 88}" y="${y + 26 + i * 28}" width="76" height="12" rx="6" fill="#000000" opacity="0.35"/>`).join('')}
    </g>
    <rect x="${x + 26}" y="${y + 22}" width="76" height="26" rx="8" fill="${shade(base, -0.6)}"/>
    <rect x="${x + 26}" y="${y + 62}" width="48" height="12" rx="6" fill="${shade(base, -0.45)}"/>
    <circle cx="${SIZE / 2 + 12}" cy="${y + h / 2 - 4}" r="96" fill="url(#lens${id})"/>
    <circle cx="${SIZE / 2 + 12}" cy="${y + h / 2 - 4}" r="96" fill="none" stroke="${shade(base, 0.42)}" stroke-width="7"/>
    <circle cx="${SIZE / 2 + 12}" cy="${y + h / 2 - 4}" r="70" fill="#0A0E15"/>
    <circle cx="${SIZE / 2 + 12}" cy="${y + h / 2 - 4}" r="70" fill="url(#flare${id})"/>
    <circle cx="${SIZE / 2 + 12}" cy="${y + h / 2 - 4}" r="38" fill="#05070C"/>
    <circle cx="${SIZE / 2 - 20}" cy="${y + h / 2 - 44}" r="17" fill="#FFFFFF" opacity="0.55"/>
    <circle cx="${SIZE / 2 + 40}" cy="${y + h / 2 + 34}" r="9" fill="#FFFFFF" opacity="0.22"/>
    <rect x="${x + 40}" y="${y - 16}" width="52" height="18" rx="9" fill="${shade(base, 0.3)}"/>
    <path d="M${x + 30} ${y + 16} A 30 30 0 0 1 ${x + 78} ${y + 12}" fill="none" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="2.5" stroke-linecap="round"/>`
  };
}

function powerbank(id, base, label) {
  const w = 250; const h = 388;
  const x = (SIZE - w) / 2; const y = 222;
  return {
    defs: metalV(base, `m${id}`) + `
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.42"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.03"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`,
    body: `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="url(#m${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="40" fill="url(#gloss${id})"/>
    <rect x="${x + 44}" y="${y + 46}" width="162" height="118" rx="16" fill="#0A0C11" opacity="0.88"/>
    <text x="${x + 125}" y="${y + 108}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="30" font-weight="600" fill="#FFFFFF" letter-spacing="-0.5">20000</text>
    <text x="${x + 125}" y="${y + 138}" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="12" fill="#FFFFFF" fill-opacity="0.55">mAh · 65W PD</text>
    <g>
      <rect x="${x + 40}" y="${y + 196}" width="72" height="26" rx="8" fill="#15181F"/>
      <rect x="${x + 46}" y="${y + 203}" width="60" height="12" rx="6" fill="#3A4150"/>
      <rect x="${x + 126}" y="${y + 196}" width="40" height="26" rx="13" fill="#15181F"/>
      <rect x="${x + 132}" y="${y + 203}" width="28" height="12" rx="6" fill="#3A4150"/>
      <rect x="${x + 180}" y="${y + 196}" width="32" height="26" rx="6" fill="#15181F"/>
    </g>
    <g>
      ${Array.from({ length: 4 }, (_, i) => `<rect x="${x + 40 + i * 44}" y="${y + 258}" width="32" height="10" rx="5" fill="${i < 4 ? '#5CE08A' : '#2A2F3A'}" opacity="0.92"/>`).join('')}
    </g>
    <path d="M${x + 30} ${y + 22} A 40 40 0 0 1 ${x + 88} ${y + 16}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2.5" stroke-linecap="round"/>`
  };
}

function charger(id, base, label) {
  const w = 224; const h = 224;
  const x = (SIZE - w) / 2; const y = 292;
  return {
    defs: metalV(base, `m${id}`) + `
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.46"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`,
    body: `
    <rect x="${x + 46}" y="${y - 46}" width="20" height="56" rx="9" fill="${shade(base, -0.2)}"/>
    <rect x="${x + 78}" y="${y - 46}" width="20" height="56" rx="9" fill="${shade(base, -0.2)}"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="52" fill="url(#m${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="52" fill="url(#gloss${id})"/>
    <circle cx="${SIZE / 2}" cy="${y + 96}" r="46" fill="#0B0D12" opacity="0.9"/>
    <circle cx="${SIZE / 2}" cy="${y + 96}" r="46" fill="none" stroke="${shade(base, 0.3)}" stroke-width="3"/>
    <path d="M${SIZE / 2 - 13} ${y + 74} L ${SIZE / 2 - 13} ${y + 96} L ${SIZE / 2 - 27} ${y + 96} L ${SIZE / 2 + 2} ${y + 120} L ${SIZE / 2 + 2} ${y + 98} L ${SIZE / 2 + 16} ${y + 98}"
          fill="none" stroke="#7FE3A0" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="${SIZE / 2 - 34}" y="${y + 160}" width="68" height="26" rx="13" fill="#15181F"/>
    <rect x="${SIZE / 2 - 26}" y="${y + 167}" width="52" height="12" rx="6" fill="#3E4553"/>
    <path d="M${x + 30} ${y + 20} A 44 44 0 0 1 ${x + 92} ${y + 16}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2.5" stroke-linecap="round"/>`
  };
}

function keyboard(id, base, label) {
  const w = 470; const h = 250;
  const x = (SIZE - w) / 2; const y = 320;
  return {
    defs: `
    <linearGradient id="m${id}" x1="0" y1="0" x2="0.2" y2="1">
      <stop offset="0" stop-color="${shade(base, 0.30)}"/>
      <stop offset="0.35" stop-color="${shade(base, 0.02)}"/>
      <stop offset="1" stop-color="${shade(base, -0.30)}"/>
    </linearGradient>
    <linearGradient id="key${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(base, -0.16)}"/>
      <stop offset="1" stop-color="${shade(base, -0.42)}"/>
    </linearGradient>
    <linearGradient id="cap${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F2F3F5"/>
      <stop offset="1" stop-color="#C9CCD2"/>
    </linearGradient>`,
    body: `
    <path d="M${x} ${y} L ${x + w} ${y} L ${x + w - 24} ${y + h} L ${x + 24} ${y + h} Z" fill="url(#m${id})"/>
    <path d="M${x} ${y} L ${x + w} ${y} L ${x + w - 4} ${y + 22} L ${x + 4} ${y + 22} Z" fill="${shade(base, 0.22)}"/>
    <g>
      ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 14 }, (_, c) => {
        const inset = r * 4.2;
        const kx = x + 22 + c * 30.6 + inset;
        const ky = y + 40 + r * 40 + inset * 1.6;
        const kw = 26 - inset * 0.5;
        return `<rect x="${kx.toFixed(1)}" y="${ky.toFixed(1)}" width="${kw.toFixed(1)}" height="30" rx="5" fill="url(#key${id})"/>`;
      }).join('')).join('')}
    </g>
    <g>
      <rect x="${x + 52}" y="${y + 40 + 4 * 40 + 13}" width="${w - 104}" height="32" rx="6" fill="url(#cap${id})"/>
      <rect x="${x + 18}" y="${y + 40 + 4 * 40 + 13}" width="30" height="32" rx="6" fill="url(#cap${id})"/>
      <rect x="${x + w - 48}" y="${y + 40 + 4 * 40 + 13}" width="30" height="32" rx="6" fill="url(#cap${id})"/>
    </g>
    <rect x="${x + 120}" y="${y + 12}" width="46" height="8" rx="4" fill="${base}"/>
    <circle cx="${x + w - 40}" cy="${y + 16}" r="6" fill="#5CE08A" opacity="0.9"/>
    <path d="M${x + 16} ${y + 30} L ${x + 40} ${y + 30}" stroke="#FFFFFF" stroke-opacity="0.4" stroke-width="2.5" stroke-linecap="round"/>`
  };
}

function speaker(id, base, label) {
  const w = 250; const h = 350;
  const x = (SIZE - w) / 2; const y = 254;
  return {
    defs: metalV(base, `m${id}`) + `
    <pattern id="mesh${id}" width="13" height="13" patternUnits="userSpaceOnUse">
      <circle cx="6.5" cy="6.5" r="3.4" fill="${shade(base, -0.5)}"/>
      <circle cx="5.6" cy="5.6" r="1.5" fill="#FFFFFF" opacity="0.20"/>
    </pattern>
    <linearGradient id="gloss${id}" x1="0" y1="0" x2="1" y2="0.4">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.40"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.02"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </linearGradient>`,
    body: `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="66" fill="url(#m${id})"/>
    <rect x="${x + 20}" y="${y + 74}" width="${w - 40}" height="${h - 148}" rx="46" fill="url(#mesh${id})"/>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="66" fill="url(#gloss${id})"/>
    <circle cx="${SIZE / 2}" cy="${y + 46}" r="24" fill="${shade(base, -0.35)}"/>
    <circle cx="${SIZE / 2}" cy="${y + 46}" r="24" fill="none" stroke="${shade(base, 0.4)}" stroke-width="2.5"/>
    <circle cx="${SIZE / 2}" cy="${y + 46}" r="9" fill="${shade(base, -0.6)}"/>
    <rect x="${SIZE / 2 - 34}" y="${y + h - 46}" width="68" height="8" rx="4" fill="${shade(base, -0.5)}" opacity="0.7"/>
    <path d="M${x + 30} ${y + 30} A 60 60 0 0 1 ${x + 96} ${y + 24}" fill="none" stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="3" stroke-linecap="round"/>`
  };
}

/* ------------------------------------------------------------------- table */

const JOBS = [
  // file, builder, tone, base, extras, label
  ['smartphone-titanium.svg', phone, TONES.cool, '#8E9299', ['#243043', '#0A0E18'], 'Aurora X1 Pro smartphone in titanium'],
  ['smartphone-midnight.svg', phone, TONES.cool, '#2B3440', ['#1A2A4A', '#060A14'], 'Aurora X1 smartphone in midnight'],
  ['smartphone-silver.svg', phone, TONES.neutral, '#C9CCD1', ['#3A4050', '#0C1018'], 'Nimbus One 5G smartphone in silver'],
  ['smartphone-graphite.svg', phone, TONES.cool, '#4A4E55', ['#3A1420', '#10070B'], 'Vertex 14 Pro smartphone in graphite'],

  ['laptop-silver.svg', laptop, TONES.neutral, '#C9CCD1', ['#243044', '#0A0E16'], 'Titanbook Air 14 laptop in silver'],
  ['laptop-graphite.svg', laptop, TONES.cool, '#4A4E55', ['#1F2A3C', '#070A11'], 'Titanbook Pro 16 laptop in graphite'],
  ['laptop-champagne.svg', laptop, TONES.warm, '#D9C7A6', ['#3A2E22', '#120D08'], 'Atlas Studio 15 laptop in champagne'],
  ['laptop-blue.svg', laptop, TONES.cool, '#5A7FB5', ['#1B2A46', '#070C18'], 'Nova Air 13 laptop in blue'],

  ['headphone-champagne.svg', overEar, TONES.warm, '#D9C7A6', '#E8B27A', 'Halo Pro Studio over-ear headphones in champagne'],
  ['headphone-graphite.svg', overEar, TONES.cool, '#4A4E55', '#7FA8D8', 'Halo Over-Ear ANC headphones in graphite'],

  ['earbuds-white.svg', earbuds, TONES.neutral, '#EDEEF0', '#8FA6C4', 'Pulse Buds 3 wireless earbuds in white'],
  ['earbuds-sand.svg', earbuds, TONES.warm, '#DCCDB4', '#C08A54', 'Echo Buds Lite wireless earbuds in sand'],
  ['earbuds-coral.svg', earbuds, TONES.warm, '#E4795E', '#8C3A2A', 'Horizon Sport Buds wireless earbuds in coral'],

  ['watch-black.svg', watch, TONES.cool, '#23252A', ['#2C3A52', '#080B12'], 'Orbit Watch Ultra in black'],
  ['watch-titanium.svg', watch, TONES.neutral, '#9AA0A8', ['#243043', '#080C14'], 'Orbit Watch Series 6 in titanium'],
  ['watch-graphite.svg', watch, TONES.cool, '#4A4E55', ['#33263A', '#0A0710'], 'Orbit Watch Active 2 in graphite'],

  ['band-pink.svg', band, TONES.warm, '#E38FA8', 'Pulse Band Fit fitness band in pink'],

  ['camera-black.svg', camera, TONES.cool, '#23252A', 'Vista X Mirrorless camera in black'],
  ['camera-silver.svg', camera, TONES.neutral, '#C9CCD1', 'Vista X Compact camera in silver'],
  ['camera-charcoal.svg', camera, TONES.cool, '#3A3D43', 'Vista Prime 50mm camera in charcoal'],
  ['camera-blue.svg', camera, TONES.cool, '#4E6E9E', 'Vista Scout action camera in blue'],

  ['powerbank.svg', powerbank, TONES.cool, '#3A3D43', 'ChargeCore 20K power bank'],
  ['charger.svg', charger, TONES.neutral, '#D5D7DA', 'Terra 65W GaN charger'],
  ['keyboard.svg', keyboard, TONES.cool, '#3A3D43', 'GlideFlex 75 mechanical keyboard'],
  ['speaker.svg', speaker, TONES.cool, '#4A4E55', 'AuraSound Mini speaker']
];

let written = 0;
JOBS.forEach(([file, build, tone, base, extras, label], i) => {
  const id = String.fromCharCode(97 + (i % 26)) + i;   // unique defs id per file
  const p = build(id, base, extras[0], extras[1], label);
  const wide = file.startsWith('camera') || file.startsWith('laptop') || file.startsWith('keyboard');
  const cx = SIZE / 2;
  const rx = wide ? 250 : 150;
  const ry = wide ? 26 : 32;
  fs.writeFileSync(path.join(OUT, file), svg(id, tone, label, p, contactShadow(id, cx, rx, ry)), 'utf8');
  written += 1;
});

console.log('wrote ' + written + ' product renders to assets/images/');
