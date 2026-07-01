#!/usr/bin/env node
// iter 288 — KB-STRUCTURAL cohort tag sweep.
// Adds a top-level `cohort` field to every SUBNET_DOSSIER entry that carries
// spreadNaive + spreadIQR (introduced iter 287), derived deterministically:
//   • competition-format      : spreadIQR < 2
//   • open-marketplace        : 2 <= spreadIQR < 6
//   • spike-anomaly-flagged   : spreadIQR >= 6  OR  (spreadNaive/spreadIQR) > 10
// The cohort is inserted as a sibling of priceRange6mo (entry-level), placed
// immediately after the closing brace of priceRange6mo.

const fs = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '..', 'lib', 'bittensor-kb.js');
const src = fs.readFileSync(KB_PATH, 'utf8');
const lines = src.split('\n');

function classify(spreadNaive, spreadIQR) {
  const ratio = spreadIQR > 0 ? spreadNaive / spreadIQR : Infinity;
  if (spreadIQR >= 6 || ratio > 10) return 'spike-anomaly-flagged';
  if (spreadIQR >= 2) return 'open-marketplace';
  return 'competition-format';
}

const dist = { 'competition-format': 0, 'open-marketplace': 0, 'spike-anomaly-flagged': 0 };
const perEntry = [];
let hits = 0;

const rewritten = lines.map((line) => {
  // Only DOSSIER entry lines carry spreadNaive + spreadIQR.
  if (!/spreadNaive:\s*[\d.]+/.test(line) || !/spreadIQR:\s*[\d.]+/.test(line)) return line;
  // Skip if cohort already present (idempotent).
  if (/cohort:\s*'[^']+'/.test(line)) return line;

  const netuidMatch = line.match(/^\s*(\d+):\s*\{/);
  const nMatch = line.match(/spreadNaive:\s*([\d.]+)/);
  const iMatch = line.match(/spreadIQR:\s*([\d.]+)/);
  if (!netuidMatch || !nMatch || !iMatch) return line;

  const netuid = Number(netuidMatch[1]);
  const spreadNaive = Number(nMatch[1]);
  const spreadIQR = Number(iMatch[1]);
  const cohort = classify(spreadNaive, spreadIQR);
  dist[cohort]++;
  perEntry.push({ netuid, spreadNaive, spreadIQR, ratio: +(spreadNaive / spreadIQR).toFixed(2), cohort });
  hits++;

  // Insert `cohort: '...'` right after the closing brace of priceRange6mo (which
  // is the first `}` before the entry closer). The entry line pattern is:
  //   NN: { name: ..., ..., priceRange6mo: { ...asOf: '...' } },
  // We swap the FIRST occurrence of ` } }` (priceRange6mo close + entry close)
  // with ` }, cohort: '<X>' }` to place cohort at the entry level.
  return line.replace(/\}\s*\}(,?\s*)$/, `}, cohort: '${cohort}' }$1`);
});

fs.writeFileSync(KB_PATH, rewritten.join('\n'));

console.log(JSON.stringify({ hits, distribution: dist }, null, 2));
console.log('Per-entry sample:');
for (const e of perEntry) {
  console.log(`  SN${String(e.netuid).padStart(3)}: naive=${e.spreadNaive} iqr=${e.spreadIQR} ratio=${e.ratio} → ${e.cohort}`);
}
