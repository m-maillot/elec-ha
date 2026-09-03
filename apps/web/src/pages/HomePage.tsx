import { Navigate } from 'react-router-dom';
import { useSettings } from '../api/queries.js';
import { Alert } from '../components/ui/alert.js';
import { t } from '../i18n/fr.js';
import { errorMessage } from '../api/client.js';

export function HomePage() {
  const settings = useSettings();
  if (settings.isPending) return <p className="text-slate-500">{t.app.loading}</p>;
  if (settings.isError) return <Alert variant="error">{errorMessage(settings.error)}</Alert>;
  if (!settings.data.configured) return <Navigate to="/settings?welcome=1" replace />;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{t.home.title}</h2>
      <Alert>{t.home.placeholder}</Alert>
    </div>
  );
}
