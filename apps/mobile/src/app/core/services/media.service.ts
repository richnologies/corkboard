import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

export interface UploadedPhoto {
  key: string;
  thumbKey: string;
}

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly api = inject(ApiService);

  presign(contentType: string, extension?: string, variant?: 'thumb') {
    return this.api.post<{ key: string; uploadUrl: string }>(
      '/items/photos/presign',
      { contentType, extension, variant },
    );
  }

  getViewUrl(key: string) {
    return this.api.get<{ url: string }>('/items/photos/view-url', { key });
  }

  async uploadPhoto(full: File, thumb: File): Promise<UploadedPhoto> {
    const [key, thumbKey] = await Promise.all([
      this.uploadBlob(full),
      this.uploadBlob(thumb, 'thumb'),
    ]);
    return { key, thumbKey };
  }

  private async uploadBlob(file: File, variant?: 'thumb'): Promise<string> {
    const extension = variant === 'thumb' ? 'jpg' : file.name.split('.').pop()?.toLowerCase();
    const { key, uploadUrl } = await firstValueFrom(
      this.presign(file.type || 'application/octet-stream', extension, variant),
    );

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });

    if (!response.ok) {
      const detail = (await response.text()).trim();
      const code = detail.match(/<Code>([^<]+)<\/Code>/)?.[1];
      const message = detail.match(/<Message>([^<]+)<\/Message>/)?.[1];
      const suffix = code || message ? `: ${[code, message].filter(Boolean).join(' — ')}` : '';
      throw new Error(`Photo upload failed (${response.status})${suffix}`);
    }

    return key;
  }
}
