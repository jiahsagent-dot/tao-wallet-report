'use client';

import { useEffect, useState } from 'react';

export default function UsageBadge() {
  const [total, setTotal] = useState(null);
  useEffect(() => {
    fetch('/api/usage')
      .then((r) => r.json())
      .then((j) => setTotal(Number(j?.total || 0)))
      .catch(() => {});
  }, []);
  if (total == null || total < 1) return null;
  const formatted = total.toLocaleString();
  return (
    <p className="usage-badge">
      📊 {formatted} {total === 1 ? 'report' : 'reports'} generated so far
    </p>
  );
}
