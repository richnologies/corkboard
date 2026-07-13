import { AppLocale } from '../locale.js';
import { en } from './en.js';
import { es } from './es.js';

export type TranslationTree = Record<string, unknown>;

export const TRANSLATIONS: Record<AppLocale, TranslationTree> = {
  en,
  es,
};
