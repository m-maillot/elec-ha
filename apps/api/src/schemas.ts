import { Type, type Static } from '@sinclair/typebox';
import { SUBSCRIBED_POWERS, TARIFF_OPTIONS, TEMPO_SOURCES } from '@elec-ha/core';

export const IsoDate = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
export const TariffOptionSchema = Type.Union(TARIFF_OPTIONS.map((o) => Type.Literal(o)));
export const TempoSourceSchema = Type.Union(TEMPO_SOURCES.map((o) => Type.Literal(o)));
export const SubscribedPowerSchema = Type.Union(SUBSCRIBED_POWERS.map((p) => Type.Literal(p)));

const Price = Type.Number({ minimum: 0 });
const OptionTariff = <T extends ReturnType<typeof Type.Object>>(prices: T) =>
  Type.Object({ subscriptionYearly: Type.Number({ minimum: 0 }), prices });

export const TariffGridSchema = Type.Object({
  validFrom: Type.Optional(IsoDate),
  base: OptionTariff(Type.Object({ kwh: Price })),
  hphc: OptionTariff(Type.Object({ hp: Price, hc: Price })),
  tempo: OptionTariff(
    Type.Object({
      blueHp: Price,
      blueHc: Price,
      whiteHp: Price,
      whiteHc: Price,
      redHp: Price,
      redHc: Price,
    }),
  ),
});

export const OffpeakRangeSchema = Type.Object({
  startMin: Type.Integer({ minimum: 0, maximum: 1439 }),
  endMin: Type.Integer({ minimum: 0, maximum: 1440 }),
});
export const OffpeakSetsSchema = Type.Object({
  hphc: Type.Array(OffpeakRangeSchema),
  tempo: Type.Array(OffpeakRangeSchema),
});

const NullableString = Type.Union([Type.String(), Type.Null()]);

export const SettingsUpdateSchema = Type.Object({
  ha: Type.Optional(
    Type.Object({
      url: Type.Optional(Type.String()),
      token: Type.Optional(Type.String()),
      entityIds: Type.Optional(Type.Array(Type.String({ minLength: 1 }), { maxItems: 20 })),
    }),
  ),
  subscribedPowerKva: Type.Optional(SubscribedPowerSchema),
  currentOption: Type.Optional(TariffOptionSchema),
  grid: Type.Optional(TariffGridSchema),
  offpeak: Type.Optional(OffpeakSetsSchema),
  tempo: Type.Optional(
    Type.Object({
      source: Type.Optional(TempoSourceSchema),
      rteClientId: Type.Optional(NullableString),
      rteClientSecret: Type.Optional(Type.String()),
    }),
  ),
  advanced: Type.Optional(
    Type.Object({
      colorSwitchHour: Type.Optional(Type.Integer({ minimum: 0, maximum: 23 })),
      smoothingRefDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 10 })),
      smoothingSearchWindowDays: Type.Optional(Type.Integer({ minimum: 1, maximum: 60 })),
    }),
  ),
});
export type SettingsUpdateBody = Static<typeof SettingsUpdateSchema>;

export const PeriodQuerySchema = Type.Object({ from: IsoDate, to: IsoDate });

export const HaTestSchema = Type.Object({
  url: Type.Optional(Type.String()),
  token: Type.Optional(Type.String()),
});

export const ConsumptionQuerySchema = Type.Object({
  from: IsoDate,
  to: IsoDate,
  granularity: Type.Optional(
    Type.Union([Type.Literal('hour'), Type.Literal('day'), Type.Literal('month')], {
      default: 'hour',
    }),
  ),
});

export const SimulateBodySchema = Type.Object({
  from: IsoDate,
  to: IsoDate,
  currentOption: Type.Optional(TariffOptionSchema),
  smoothing: Type.Optional(Type.Object({ enabled: Type.Boolean() })),
});

export const TempoCsvBodySchema = Type.Object({
  csv: Type.String(),
  overwrite: Type.Optional(Type.Boolean()),
});
