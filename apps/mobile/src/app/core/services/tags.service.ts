import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface TagCount {
  tag: string;
  count: number;
}

@Injectable({ providedIn: 'root' })
export class TagsService {
  private readonly api = inject(ApiService);

  list() {
    return this.api.get<TagCount[]>('/tags');
  }
}
