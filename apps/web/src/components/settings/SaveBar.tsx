import type { ReactNode } from 'react';
import { Button } from '../ui/button.js';
import { Alert } from '../ui/alert.js';
import { t } from '../../i18n/fr.js';

interface SaveBarProps {
  saving: boolean;
  saved: boolean;
  error: string | null;
  disabled?: boolean;
  children?: ReactNode;
}

/** Bouton Enregistrer + retour (succès / erreur) commun aux sections. */
export function SaveBar({ saving, saved, error, disabled, children }: SaveBarProps) {
  return (
    <>
      <Button type="submit" disabled={saving || disabled}>
        {saving ? t.app.loading : t.app.save}
      </Button>
      {children}
      {saved && !error && (
        <Alert variant="success" className="py-1">
          {t.app.saved}
        </Alert>
      )}
      {error && (
        <Alert variant="error" className="py-1">
          {error}
        </Alert>
      )}
    </>
  );
}
