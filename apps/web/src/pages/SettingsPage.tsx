import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../api/client.js';
import { useSettings } from '../api/queries.js';
import { AdvancedSection } from '../components/settings/AdvancedSection.js';
import { HaConnectionSection } from '../components/settings/HaConnectionSection.js';
import { OffpeakSection } from '../components/settings/OffpeakSection.js';
import { TariffSection } from '../components/settings/TariffSection.js';
import { TempoSourceSection } from '../components/settings/TempoSourceSection.js';
import { Alert } from '../components/ui/alert.js';
import { t } from '../i18n/fr.js';

export function SettingsPage() {
  const [params] = useSearchParams();
  const settings = useSettings();

  if (settings.isPending) return <p className="text-slate-500">{t.app.loading}</p>;
  if (settings.isError) return <Alert variant="error">{errorMessage(settings.error)}</Alert>;
  const data = settings.data;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold">{t.settings.title}</h2>
      {(params.get('welcome') || !data.configured) && <Alert>{t.settings.welcome}</Alert>}
      <HaConnectionSection settings={data} />
      <TariffSection settings={data} />
      <OffpeakSection settings={data} />
      <TempoSourceSection settings={data} />
      <AdvancedSection settings={data} />
    </div>
  );
}
