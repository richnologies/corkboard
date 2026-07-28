import { Injectable, inject } from '@angular/core';
import { Conversation, ConversationSummary } from '@org/domain';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class ConversationsService {
  private readonly api = inject(ApiService);

  list() {
    return this.api.get<ConversationSummary[]>('/conversations');
  }

  get(id: string) {
    return this.api.get<Conversation>(`/conversations/${id}`);
  }

  remove(id: string) {
    return this.api.delete(`/conversations/${id}`);
  }
}
