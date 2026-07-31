import { Injectable, inject } from '@angular/core';
import {
  CompanionAmbiguity,
  CompanionNameResolution,
} from '@org/domain';
import { ApiService } from './api.service';

export interface MapPlaceCandidate {
  index: number;
  googlePlaceId: string;
  name: string;
  address: string;
  category: string;
}

export interface PendingVisitAction {
  type: 'log_visit' | 'create_place_and_log_visit' | 'update_visit';
  placeId?: string;
  googlePlaceId?: string;
  experienceId?: string;
  visitedAt?: string;
  overallRating?: number;
  notes?: string;
  wouldReturn?: boolean;
  companions: string[];
  photoKeys?: string[];
  photoThumbKeys?: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  photoPreviewUrls?: string[];
  photoKeys?: string[];
  relatedItems?: { id: string; name: string }[];
  placeCandidates?: MapPlaceCandidate[];
  companionAmbiguities?: CompanionAmbiguity[];
  pendingVisit?: PendingVisitAction;
  suggestedReplies?: string[];
  error?: boolean;
}

export interface AssistantChatResponse {
  message: string;
  relatedItems: { id: string; name: string }[];
  placeCandidates?: MapPlaceCandidate[];
  companionAmbiguities?: CompanionAmbiguity[];
  pendingVisit?: PendingVisitAction;
  suggestedReplies?: string[];
  loggedVisit?: boolean;
  conversationId?: string;
  title?: string;
}

export interface ConfirmedMapPlace {
  googlePlaceId: string;
  name?: string;
}

export interface AssistantChatOptions {
  conversationId?: string | null;
  confirmedMapPlace?: ConfirmedMapPlace;
  confirmedCompanions?: CompanionNameResolution[];
  pendingVisit?: PendingVisitAction;
  photoThumbKeys?: string[];
  timeZone?: string;
}

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly api = inject(ApiService);

  chat(
    messages: ChatMessage[],
    photoKeys: string[] = [],
    options: AssistantChatOptions = {},
    locale?: 'en' | 'es',
  ) {
    return this.api.post<AssistantChatResponse>('/assistant/chat', {
      messages: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      photoKeys: photoKeys.length ? photoKeys : undefined,
      photoThumbKeys: options.photoThumbKeys?.length
        ? options.photoThumbKeys
        : undefined,
      conversationId: options.conversationId ?? undefined,
      confirmedMapPlace: options.confirmedMapPlace,
      confirmedCompanions: options.confirmedCompanions,
      pendingVisit: options.pendingVisit,
      locale,
      timeZone: options.timeZone,
    });
  }
}
