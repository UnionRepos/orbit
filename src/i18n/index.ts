/**
 * Public i18n entry point.
 *
 * `core.ts` holds locale state and dictionary lookups for plain helpers;
 * `I18nProvider` exposes them to React. Import everything from here.
 */
export * from './core.ts'
export { I18nProvider, useI18n, type I18nContextValue } from './I18nProvider.tsx'
