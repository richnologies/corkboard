import { Injectable, inject } from '@angular/core';
import { ApiService } from './api.service';

export interface MapPlaceCandidate {
  index: number;
  googlePlaceId: string;
  name: string;
  address: string;
  category: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  photoPreviewUrls?: string[];
  relatedItems?: { id: string; name: string }[];
  placeCandidates?: MapPlaceCandidate[];
  error?: boolean;
}

export interface AssistantChatResponse {
  message: string;
  relatedItems: { id: string; name: string }[];
  placeCandidates?: MapPlaceCandidate[];
}

export interface ConfirmedMapPlace {
  googlePlaceId: string;
  name?: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly api = inject(ApiService);

  chat(
    messages: ChatMessage[],
    photoKeys: string[] = [],
    confirmedMapPlace?: ConfirmedMapPlace,
    locale?: 'en' | 'es',
  ) {
    return this.api.post<AssistantChatResponse>('/assistant/chat', {
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      photoKeys: photoKeys.length ? photoKeys : undefined,
      confirmedMapPlace,
      locale,
    });
  }
}
