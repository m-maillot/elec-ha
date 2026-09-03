import { useEffect, useState } from 'react';
import { TARIFF_OPTIONS } from '@elec-ha/core';

interface Health {
  status: string;
  core: string;
  time: string;
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setHealth((await r.json()) as Health);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <h1>elec-ha</h1>
      <p>Comparateur d'options tarifaires EDF ({TARIFF_OPTIONS.join(' / ')}).</p>
      {health && (
        <p>
          API : {health.status} – core {health.core}
        </p>
      )}
      {error && <p style={{ color: 'crimson' }}>API injoignable : {error}</p>}
    </main>
  );
}
