import { Injectable, signal } from '@angular/core';
import {
  AppLocale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  SUPPORTED_LOCALES,
  detectBrowserLocale,
  isAppLocale,
  toAngularLocale,
  LOCALE_LABELS,
} from './locale.js';
import { TRANSLATIONS, TranslationTree } from './translations/index.js';

type TranslationParams = Record<string, string | number>;

@Injectable({ providedIn: 'root' })
export class I18nService {
  private readonly translations = TRANSLATIONS;

  readonly locale = signal<AppLocale>(this.resolveInitialLocale());

  constructor() {
    document.documentElement.lang = this.locale();
  }
  readonly supportedLocales = SUPPORTED_LOCALES;

  t(key: string, params?: TranslationParams): string {
    const value = this.lookup(this.translations[this.locale()], key);
    if (typeof value !== 'string') return key;
    return this.interpolate(value, params);
  }

  setLocale(locale: AppLocale): void {
    if (this.locale() === locale) return;
    this.locale.set(locale);
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }

  angularLocale(): string {
    return toAngularLocale(this.locale());
  }

  localeLabel(locale: AppLocale): string {
    return LOCALE_LABELS[locale];
  }

  private resolveInitialLocale(): AppLocale {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && isAppLocale(stored)) return stored;
    return detectBrowserLocale() ?? DEFAULT_LOCALE;
  }

  private lookup(tree: TranslationTree, key: string): string | undefined {
    const parts = key.split('.');
    let current: unknown = tree;
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
  }

  private interpolate(template: string, params?: TranslationParams): string {
    if (!params) return template;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
      params[name] != null ? String(params[name]) : `{{${name}}}`,
    );
  }
}
