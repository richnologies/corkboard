import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class MediaService {
  private readonly api = inject(ApiService);

  presign(contentType: string, extension?: string) {
    return this.api.post<{ key: string; uploadUrl: string }>(
      '/items/photos/presign',
      { contentType, extension },
    );
  }

  getViewUrl(key: string) {
    return this.api.get<{ url: string }>('/items/photos/view-url', { key });
  }

  async uploadFile(file: File): Promise<string> {
    const extension = file.name.split('.').pop()?.toLowerCase();
    const { key, uploadUrl } = await firstValueFrom(
      this.presign(file.type || 'application/octet-stream', extension),
    );

    const response = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
    });

    if (!response.ok) {
      throw new Error('Photo upload failed');
    }

    return key;
  }
}
