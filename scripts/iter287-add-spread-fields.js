#!/usr/bin/env node
// iter 287 KB-STRUCTURAL SWEEP: add spreadNaive (max/min) and spreadIQR (p90/p10)
// to every priceRange6mo object in lib/bittensor-kb.js
const fs = require('fs');
const path = require('path');

const kbPath = path.join(__dirname, '..', 'lib', 'bittensor-kb.js');
const src = fs.readFileSync(kbPath, 'utf8');

const round = (n, d = 2) => {
  const m = 10 ** d;
  return Math.round(n * m) / m;
};

let replacements = 0;
let widthDist = { narrow: 0, medium: 0, wide: 0 };

// Match priceRange6mo: { ... } single-line objects. Non-greedy to closing brace before comma+space+}}.
// Shape: priceRange6mo: { min: X, p10: X, median: X, p90: X, max: X, samples: N, asOf: 'YYYY-MM-DD' }
const re = /priceRange6mo:\s*\{\s*min:\s*([0-9.eE+-]+),\s*p10:\s*([0-9.eE+-]+),\s*median:\s*([0-9.eE+-]+),\s*p90:\s*([0-9.eE+-]+),\s*max:\s*([0-9.eE+-]+),\s*samples:\s*(\d+),\s*asOf:\s*'([^']+)'\s*\}/g;

const out = src.replace(re, (m, min, p10, median, p90, max, samples, asOf) => {
  const mn = parseFloat(min);
  const p10v = parseFloat(p10);
  const p90v = parseFloat(p90);
  const mx = parseFloat(max);
  const spreadNaive = mn > 0 ? round(mx / mn, 2) : null;
  const spreadIQR = p10v > 0 ? round(p90v / p10v, 2) : null;
  replacements++;
  // Use IQR spread for cohort tally (spike-robust)
  const s = spreadIQR ?? spreadNaive ?? 0;
  if (s < 2) widthDist.narrow++;
  else if (s < 4) widthDist.medium++;
  else widthDist.wide++;
  return `priceRange6mo: { min: ${min}, p10: ${p10}, median: ${median}, p90: ${p90}, max: ${max}, spreadNaive: ${spreadNaive}, spreadIQR: ${spreadIQR}, samples: ${samples}, asOf: '${asOf}' }`;
});

fs.writeFileSync(kbPath, out);
console.log(JSON.stringify({ replacements, widthDist }, null, 2));
