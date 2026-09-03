const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const eur4 = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const kwhFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
const kwh3 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const pct = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});
const signedEur = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  signDisplay: 'exceptZero',
});
const dateFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' });
const dateTimeFmt = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export const fmt = {
  eur: (v: number) => eur.format(v),
  eur4: (v: number) => eur4.format(v),
  signedEur: (v: number) => signedEur.format(v),
  kwh: (v: number) => `${kwhFmt.format(v)} kWh`,
  kwh3: (v: number) => `${kwh3.format(v)} kWh`,
  /** `v` en fraction (0.12 → « +12 % »). */
  pct: (v: number) => pct.format(v),
  date: (iso: string) => dateFmt.format(new Date(`${iso}T12:00:00`)),
  dateTime: (iso: string) => dateTimeFmt.format(new Date(iso)),
};
