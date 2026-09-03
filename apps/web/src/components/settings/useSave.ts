import { useState } from 'react';
import type { SettingsUpdateDto } from '@elec-ha/core';
import { errorMessage } from '../../api/client.js';
import { useUpdateSettings } from '../../api/queries.js';

/** État d'enregistrement d'une section (mutation partielle de /api/settings). */
export function useSave() {
  const mutation = useUpdateSettings();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(patch: SettingsUpdateDto): Promise<boolean> {
    setSaved(false);
    setError(null);
    try {
      await mutation.mutateAsync(patch);
      setSaved(true);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  }

  return { save, saving: mutation.isPending, saved, error, setError };
}
