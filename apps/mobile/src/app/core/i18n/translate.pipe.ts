import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service.js';

@Pipe({
  name: 'translate',
  standalone: true,
  pure: false,
})
export class TranslatePipe implements PipeTransform {
  private readonly i18n = inject(I18nService);

  transform(key: string, params?: Record<string, string | number>): string {
    this.i18n.locale();
    return this.i18n.t(key, params);
  }
}
