/// <reference types="vite/client" />

declare module 'echarts/i18n/langFR-obj.js' {
  const locale: Parameters<typeof import('echarts/core').registerLocale>[1];
  export default locale;
}
