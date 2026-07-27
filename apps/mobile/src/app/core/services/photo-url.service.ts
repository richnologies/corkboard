import { Injectable, inject, signal } from '@angular/core';
import { MediaService } from './media.service';

@Injectable({ providedIn: 'root' })
export class PhotoUrlService {
  private readonly media = inject(MediaService);
  private readonly urls = signal<Record<string, string>>({});

  url(key: string | undefined): string | undefined {
    if (!key) return undefined;
    return this.urls()[key];
  }

  ensure(key: string | undefined): void {
    if (!key || this.urls()[key]) return;
    this.media.getViewUrl(key).subscribe({
      next: ({ url }) => {
        this.urls.update((current) => ({ ...current, [key]: url }));
      },
    });
  }

  ensureMany(keys: Iterable<string | undefined>): void {
    for (const key of keys) {
      this.ensure(key);
    }
  }
}
