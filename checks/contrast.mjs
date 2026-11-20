// Recompute the colour-contrast facts quoted in the README and case study.
// Usage: node checks/contrast.mjs
// Reads the colour tokens of every theme from styles.css, prints WCAG 2 contrast ratios,
// and the same ratios after simulating deuteranopia and protanopia (Machado et al. 2009, severity 1.0).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'styles.css'), 'utf8');

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  return out;
}
const rootBlock = css.match(/:root\s*\{([^}]*)\}/)[1];
const themes = { 'bahi red (default)': tokens(rootBlock) };
for (const m of css.matchAll(/:root\[data-theme="([a-z]+)"\]\s*\{([^}]*)\}/g)) {
  themes[m[1]] = { ...themes['bahi red (default)'], ...tokens(m[2]) };
}

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = h => [1, 3, 5].map(i => lin(parseInt(h.slice(i, i + 2), 16) / 255));
const lum = v => 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const M = {
  none: null,
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
};
const sim = (v, m) => (m ? m.map(r => Math.min(1, Math.max(0, r[0] * v[0] + r[1] * v[1] + r[2] * v[2]))) : v);

const pairs = [
  ['body text', 'ink', 'background'],
  ['secondary text', 'muted', 'background'],
  ['secondary on card', 'muted', 'surface'],
  ['button text', 'on-accent', 'accent'],
  ['accent text on card', 'accent', 'surface'],
  ['accent on tint', 'accent', 'green-tint'],
];

let worst = Infinity;
for (const [name, t] of Object.entries(themes)) {
  console.log(`\n${name}`);
  for (const [label, fg, bg] of pairs) {
    const row = Object.entries(M).map(([k, m]) => {
      const r = ratio(sim(rgb(t[fg]), m), sim(rgb(t[bg]), m));
      worst = Math.min(worst, r);
      return `${k} ${r.toFixed(2)}:1`;
    });
    console.log(`  ${label.padEnd(20)} ${row.join('  ')}`);
  }
}
console.log(`\nLowest ratio across all themes and simulations: ${worst.toFixed(2)}:1 (WCAG AA for body text is 4.5:1)`);
