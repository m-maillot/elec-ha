import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** Configuration unique (ligne id = 1). Réf. spec §6.5. */
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey(),
  haUrl: text('ha_url'),
  haTokenEnc: text('ha_token_enc'),
  entityId: text('entity_id'),
  tempoEntityId: text('tempo_entity_id'),
  subscribedPowerKva: integer('subscribed_power_kva').notNull().default(6),
  tempoSource: text('tempo_source').notNull().default('rte'),
  rteClientId: text('rte_client_id'),
  rteSecretEnc: text('rte_secret_enc'),
  currentOption: text('current_option').notNull().default('base'),
  smoothingRefDays: integer('smoothing_ref_days').notNull().default(3),
  smoothingSearchWindowDays: integer('smoothing_search_window_days').notNull().default(14),
  colorSwitchHour: integer('color_switch_hour').notNull().default(6),
  lastSyncAt: text('last_sync_at'),
  updatedAt: text('updated_at'),
});

/** Une ligne par option : base | hphc | tempo. */
export const tariffs = sqliteTable('tariffs', {
  option: text('option').primaryKey(),
  validFrom: text('valid_from'),
  subscriptionYearly: real('subscription_yearly').notNull(),
  /** {kwh} | {hp,hc} | {blueHp,blueHc,...} */
  priceJson: text('price_json').notNull(),
});

export const offpeakRanges = sqliteTable('offpeak_ranges', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tariffSet: text('tariff_set').notNull(),
  startMin: integer('start_min').notNull(),
  endMin: integer('end_min').notNull(),
});

/** Cache des statistiques horaires HA. */
export const consumptionHours = sqliteTable('consumption_hours', {
  startUtc: integer('start_utc').primaryKey(),
  kwh: real('kwh').notNull(),
  sourceSum: real('source_sum'),
  fetchedAt: text('fetched_at').notNull(),
});

export const tempoDays = sqliteTable('tempo_days', {
  date: text('date').primaryKey(),
  color: text('color').notNull(),
  source: text('source').notNull(),
  fetchedAt: text('fetched_at').notNull(),
});
