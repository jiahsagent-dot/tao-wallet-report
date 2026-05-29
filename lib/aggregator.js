// Combine multiple coldkey reports into a single header summary.
// Per-wallet PnL/drawdown/yield are NOT merged — cost-basis and time-window
// semantics differ per wallet. The /me view stacks the individual reports
// underneath this header so the user keeps the rich per-wallet data.

export function aggregateSummary(reports) {
  const ok = reports.filter((r) => r && r.portfolio);
  if (ok.length === 0) return null;

  let totalTao = 0;
  let totalUsd = 0;
  let totalAud = 0;
  let positionCount = 0;
  const subnetMap = new Map();

  for (const r of ok) {
    const p = r.portfolio;
    totalTao += Number(p.totalTao || 0);
    totalUsd += Number(p.totalUsd || 0);
    totalAud += Number(p.totalAud || 0);
    positionCount += Number(p.positionCount || 0);
    for (const pos of p.allPositions || []) {
      const key = pos.netuid;
      const prior = subnetMap.get(key);
      if (!prior) {
        subnetMap.set(key, { ...pos });
      } else {
        prior.taoValue = (prior.taoValue || 0) + (pos.taoValue || 0);
        prior.usdValue = (prior.usdValue || 0) + (pos.usdValue || 0);
      }
    }
  }

  const totalsTao = Array.from(subnetMap.values()).reduce(
    (s, p) => s + (p.taoValue || 0),
    0,
  );
  const dedupedPositions = Array.from(subnetMap.values())
    .map((p) => ({
      ...p,
      pctOfPortfolio: totalsTao > 0 ? (100 * (p.taoValue || 0)) / totalsTao : 0,
    }))
    .sort((a, b) => (b.taoValue || 0) - (a.taoValue || 0));

  return {
    totalTao,
    totalUsd,
    totalAud,
    positionCount,
    uniqueSubnetCount: subnetMap.size,
    walletCount: ok.length,
    taoPrice: ok[0].portfolio.taoPrice,
    usdAud: ok[0].portfolio.usdAud,
    positions: dedupedPositions,
    perWallet: ok.map((r) => ({
      coldkey: r.coldkey,
      totalTao: r.portfolio.totalTao,
      totalUsd: r.portfolio.totalUsd,
      positionCount: r.portfolio.positionCount,
    })),
  };
}
