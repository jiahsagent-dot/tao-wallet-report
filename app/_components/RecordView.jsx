'use client';

import { useEffect } from 'react';
import { addRecent } from './RecentColdkeys.jsx';

// Tiny client-side bridge for server pages: drop <RecordView coldkey={coldkey}/>
// anywhere on a page and it'll add to the recent list once on mount.
export default function RecordView({ coldkey }) {
  useEffect(() => {
    if (coldkey) addRecent(coldkey);
  }, [coldkey]);
  return null;
}
