#!/usr/bin/env node
// iter 290 — KB-STRUCTURAL cohort boundary refinement.
// Tightens the spike-anomaly-flagged rule to require ratio > 10 EXCLUSIVELY
// (removes the spreadIQR >= 6 OR-branch introduced iter 288). SN118 (IQR 6.24
// ratio 1.55) was flagged spike-anomaly on the IQR-boundary alone even though
// its LOW naive/IQR ratio marks it as genuine dispersion, not spike-corrupted.
// Under the new rule SN118 reclassifies to open-marketplace where it
// structurally belongs; SN107 (ratio 77.4) stays spike-anomaly-flagged.
//
// NEW RULE:
//   • competition-format      : spreadIQR < 2
//   • open-marketplace        : spreadIQR >= 2 AND ratio <= 10
//   • spike-anomaly-flagged   : ratio > 10  (exclusive)
//
// Overwrites the existing entry.cohort field on any DOSSIER entry carrying
// spreadNaive + spreadIQR.

const fs = require('fs');
const path = require('path');

const KB_PATH = path.resolve(__dirname, '..', 'lib', 'bittensor-kb.js');
const src = fs.readFileSync(KB_PATH, 'utf8');
const lines = src.split('\n');

function classify(spreadNaive, spreadIQR) {
  const ratio = spreadIQR > 0 ? spreadNaive / spreadIQR : Infinity;
  if (ratio > 10) return 'spike-anomaly-flagged';
  if (spreadIQR >= 2) return 'open-marketplace';
  return 'competition-format';
}

const dist = { 'competition-format': 0, 'open-marketplace': 0, 'spike-anomaly-flagged': 0 };
const changes = [];
let hits = 0;

const rewritten = lines.map((line) => {
  if (!/spreadNaive:\s*[\d.]+/.test(line) || !/spreadIQR:\s*[\d.]+/.test(line)) return line;

  const netuidMatch = line.match(/^\s*(\d+):\s*\{/);
  const nMatch = line.match(/spreadNaive:\s*([\d.]+)/);
  const iMatch = line.match(/spreadIQR:\s*([\d.]+)/);
  const oldCohortMatch = line.match(/cohort:\s*'([^']+)'/);
  if (!netuidMatch || !nMatch || !iMatch || !oldCohortMatch) return line;

  const netuid = Number(netuidMatch[1]);
  const spreadNaive = Number(nMatch[1]);
  const spreadIQR = Number(iMatch[1]);
  const oldCohort = oldCohortMatch[1];
  const newCohort = classify(spreadNaive, spreadIQR);
  dist[newCohort]++;
  hits++;

  if (oldCohort !== newCohort) {
    changes.push({ netuid, spreadNaive, spreadIQR, ratio: +(spreadNaive / spreadIQR).toFixed(2), from: oldCohort, to: newCohort });
  }

  // Overwrite in-place; preserve everything else.
  return line.replace(/cohort:\s*'[^']+'/, `cohort: '${newCohort}'`);
});

fs.writeFileSync(KB_PATH, rewritten.join('\n'));

console.log(JSON.stringify({ hits, distribution: dist, changes }, null, 2));
