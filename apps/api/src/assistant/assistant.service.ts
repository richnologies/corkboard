import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Item, ItemCategory, ItemStatus } from '@org/domain';
import { ItemsService } from '../items/items.service.js';
import { ExperiencesService } from '../experiences/experiences.service.js';
import { ExperienceSearchService } from '../experiences/experience-search.service.js';
import { PeopleService } from '../people/people.service.js';
import { PlacesService } from '../places/places.service.js';
import { AssistantChatDto } from './dto/assistant-chat.dto.js';
import { ASSISTANT_TOOLS } from './assistant.tools.js';

interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: OpenAiToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OpenAiToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

type VisitLogMissingField = 'visitedAt' | 'overallRating' | 'companions';

export interface MapPlaceCandidate {
  index: number;
  googlePlaceId: string;
  name: string;
  address: string;
  category: string;
}

export interface AssistantChatResult {
  message: string;
  relatedItems: { id: string; name: string }[];
  placeCandidates?: MapPlaceCandidate[];
}

@Injectable()
export class AssistantService {
  constructor(
    private readonly config: ConfigService,
    private readonly itemsService: ItemsService,
    private readonly experiencesService: ExperiencesService,
    private readonly experienceSearchService: ExperienceSearchService,
    private readonly peopleService: PeopleService,
    private readonly placesService: PlacesService,
  ) {}

  async chat(userId: string, dto: AssistantChatDto): Promise<AssistantChatResult> {
    const apiKey = this.config.get<string>('app.openai.apiKey');
    const model = this.config.get<string>('app.openai.model') ?? 'gpt-4o-mini';

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Assistant is not configured. Set OPENAI_API_KEY in your environment.',
      );
    }

    if (dto.confirmedMapPlace?.googlePlaceId) {
      return this.resumeAfterMapPlaceConfirmation(userId, dto, apiKey, model);
    }

    return this.runAssistantLoop(userId, dto, apiKey, model);
  }

  private async runAssistantLoop(
    userId: string,
    dto: AssistantChatDto,
    apiKey: string,
    model: string,
    resolvedPlace?: { id: string; name: string },
  ): Promise<AssistantChatResult> {
    let relatedItems = new Map<string, string>();
    let placeCandidates: MapPlaceCandidate[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const photoNote =
      dto.photoKeys?.length ?
        `The user attached ${dto.photoKeys.length} photo(s) with this message. If you log a visit, they should be saved with that visit.`
      : 'The user did not attach photos with this message.';

    const locale = dto.locale ?? 'en';
    const replyLanguage =
      locale === 'es' ? 'Spanish' : 'English';

    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: [
          'You are Corkboard, a friendly personal food & places assistant.',
          'The user tracks restaurants and places they visit, with ratings, companions, and photos.',
          `Today is ${today}. Interpret relative dates like "yesterday" accordingly.`,
          `Always reply in ${replyLanguage}, matching the language the user writes in.`,
          'Use tools to look up real data before answering — never invent visits or places.',
          'Prefer search_visits for questions about companions, visit notes, food/atmosphere memories, or fuzzy visit recall.',
          'Use search_places or get_last_visit when the user names a specific saved place.',
          'When a place is not saved yet: search_places first, then search_google_places if needed.',
          'If search_google_places returns exactly one match, call ensure_place_from_google with that googlePlaceId and continue — never ask the user to confirm a single match.',
          'If search_google_places returns multiple matches, present numbered options and wait for the user to pick one.',
          'Use ensure_place_from_google to save a Google match without logging a visit — especially before answering questions about visit history.',
          'Only call create_place_and_log_visit when the user is reporting a new visit they went on.',
          'Before calling log_visit or create_place_and_log_visit, you must have ALL of: when (visitedAt), overall rating (0-10), and companions (use an empty array if they went alone).',
          'If any of those are missing, ask the user in one friendly message — never guess a date, never default a rating, never log until they answer.',
          'When several saved places match a name, list them and ask the user to clarify.',
          'When logging a visit to an existing saved place, use log_visit.',
          'When the user wants to change, fix, or correct an existing visit, use search_visits or get_last_visit to find it, then update_visit. Never use log_visit or create_place_and_log_visit for edits.',
          'Use log_visit or create_place_and_log_visit only when the user is explicitly logging a new visit.',
          'When several Google Maps candidates are returned, ask which one they mean by number or name — do not create a visit until they confirm.',
          resolvedPlace
            ? `The user already confirmed "${resolvedPlace.name}" (placeId: ${resolvedPlace.id}). Answer their original question using get_last_visit or search_visits. Do NOT log a new visit.`
            : null,
          'Keep replies short and conversational (2-4 sentences unless listing matches).',
          photoNote,
        ]
          .filter((line): line is string => !!line)
          .join('\n'),
      },
      ...dto.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    ];

    for (let step = 0; step < 6; step++) {
      const completion = await this.callOpenAi(apiKey, model, messages);
      const choice = completion.choices?.[0]?.message;
      if (!choice) {
        throw new BadRequestException('Assistant returned an empty response');
      }

      if (choice.tool_calls?.length) {
        messages.push({
          role: 'assistant',
          content: choice.content,
          tool_calls: choice.tool_calls,
        });

        const roundRelatedItems = new Map<string, string>();
        let roundPlaceCandidates: MapPlaceCandidate[] = [];
        for (const toolCall of choice.tool_calls) {
          let result: unknown;
          try {
            result = await this.runTool(
              userId,
              toolCall,
              dto.photoKeys ?? [],
              roundRelatedItems,
              (candidates) => {
                roundPlaceCandidates = candidates;
              },
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : 'Tool call failed';
            result = { error: message };
          }
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: JSON.stringify(result),
          });
        }
        relatedItems = roundRelatedItems;
        if (roundPlaceCandidates.length) {
          placeCandidates = roundPlaceCandidates;
        }
        continue;
      }

      const text = choice.content?.trim();
      if (!text) {
        throw new BadRequestException('Assistant returned an empty response');
      }

      return {
        message: text,
        relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
          id,
          name,
        })),
        placeCandidates:
          placeCandidates.length > 1 ? placeCandidates : undefined,
      };
    }

    throw new BadRequestException('Assistant took too many steps');
  }

  private async callOpenAi(
    apiKey: string,
    model: string,
    messages: OpenAiMessage[],
  ) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools: ASSISTANT_TOOLS,
        tool_choice: 'auto',
        temperature: 0.4,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Assistant request failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    return response.json() as Promise<{
      choices: { message: OpenAiMessage }[];
    }>;
  }

  private async runTool(
    userId: string,
    toolCall: OpenAiToolCall,
    photoKeys: string[],
    relatedItems: Map<string, string>,
    onPlaceCandidates: (candidates: MapPlaceCandidate[]) => void,
  ): Promise<unknown> {
    const args = JSON.parse(toolCall.function.arguments || '{}') as Record<
      string,
      unknown
    >;

    switch (toolCall.function.name) {
      case 'search_places':
        return this.toolSearchPlaces(userId, String(args['query'] ?? ''), relatedItems);
      case 'get_last_visit':
        return this.toolGetLastVisit(
          userId,
          args['placeName'] ? String(args['placeName']) : undefined,
          args['placeId'] ? String(args['placeId']) : undefined,
          relatedItems,
        );
      case 'search_google_places':
        return this.toolSearchGooglePlaces(
          String(args['query'] ?? ''),
          onPlaceCandidates,
        );
      case 'create_place_and_log_visit':
        return this.toolCreatePlaceAndLogVisit(
          userId,
          args,
          photoKeys,
          relatedItems,
        );
      case 'ensure_place_from_google':
        return this.toolEnsurePlaceFromGoogle(userId, args, relatedItems);
      case 'log_visit':
        return this.toolLogVisit(userId, args, photoKeys, relatedItems);
      case 'update_visit':
        return this.toolUpdateVisit(userId, args, relatedItems);
      case 'search_visits':
        return this.toolSearchVisits(userId, String(args['query'] ?? ''), relatedItems);
      case 'search_people':
        return this.toolSearchPeople(userId, String(args['query'] ?? ''));
      default:
        return { error: `Unknown tool: ${toolCall.function.name}` };
    }
  }

  private async toolSearchGooglePlaces(
    query: string,
    onPlaceCandidates: (candidates: MapPlaceCandidate[]) => void,
  ) {
    const trimmed = query.trim();
    if (!trimmed) {
      return { error: 'query is required' };
    }

    const results = await this.placesService.searchMapPlaces(trimmed, 5);
    const candidates: MapPlaceCandidate[] = results.map((place, index) => ({
      index: index + 1,
      googlePlaceId:
        place.googlePlaceId ?? `osm:${place.latitude},${place.longitude}`,
      name: place.name,
      address: place.displayName,
      category: place.category ?? ItemCategory.Other,
    }));

    if (candidates.length > 1) {
      onPlaceCandidates(candidates);
    }

    if (candidates.length === 1) {
      const candidate = candidates[0];
      return {
        count: 1,
        autoSelected: true,
        source: results[0]?.source ?? 'google',
        candidate,
        message:
          'Only one Google Maps match. Call ensure_place_from_google with this googlePlaceId, then answer the user using get_last_visit or search_visits. Do not ask for confirmation and do not log a visit unless the user asked to.',
      };
    }

    return {
      count: candidates.length,
      source: results[0]?.source ?? 'google',
      candidates,
      message:
        candidates.length
          ? 'Present these numbered options and ask the user which place they mean before saving anything.'
        : 'No Google Maps matches found. Ask the user for a more specific name or neighborhood.',
    };
  }

  private async toolEnsurePlaceFromGoogle(
    userId: string,
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
  ) {
    const googlePlaceId = String(args['googlePlaceId'] ?? '').trim();
    if (!googlePlaceId) {
      return { error: 'googlePlaceId is required' };
    }

    const place = await this.ensurePlaceFromGoogle(
      userId,
      googlePlaceId,
      relatedItems,
      { forNewVisit: false },
    );
    if ('error' in place) {
      return place;
    }

    return {
      success: true,
      created: place.created,
      place: this.placeSummary(place.item),
    };
  }

  private async toolCreatePlaceAndLogVisit(
    userId: string,
    args: Record<string, unknown>,
    photoKeys: string[],
    relatedItems: Map<string, string>,
  ) {
    const googlePlaceId = String(args['googlePlaceId'] ?? '').trim();
    if (!googlePlaceId) {
      return { error: 'googlePlaceId is required' };
    }

    const validated = this.validateVisitLogArgs(args);
    if (!validated.ok) {
      return this.visitLogNeedsInput(validated.missingFields);
    }

    const place = await this.ensurePlaceFromGoogle(
      userId,
      googlePlaceId,
      relatedItems,
      { forNewVisit: true },
    );
    if ('error' in place) {
      return place;
    }

    const { visitedAt, overallRating, companions, notes } = validated;

    const experience = await this.experiencesService.create(
      userId,
      place.item.id,
      {
        visitedAt,
        companions,
        notes,
        rating: {
          food: overallRating,
          service: overallRating,
          atmosphere: overallRating,
          valueForMoney: overallRating,
          overall: overallRating,
        },
        photos: photoKeys.map((key) => ({ key })),
      },
    );

    return {
      success: true,
      createdPlace: place.created,
      place: this.placeSummary(place.item),
      visit: {
        id: experience.id,
        visitedAt: experience.visitedAt,
        companions: experience.companions ?? [],
        photoCount: experience.photos?.length ?? 0,
      },
    };
  }

  private async ensurePlaceFromGoogle(
    userId: string,
    googlePlaceId: string,
    relatedItems: Map<string, string>,
    options?: { forNewVisit?: boolean },
  ): Promise<
    | { item: Item; created: boolean }
    | { error: string }
  > {
    const existing = await this.itemsService.findOwnedByGooglePlaceId(
      userId,
      googlePlaceId,
    );
    if (existing) {
      relatedItems.set(existing.id, existing.name);
      return { item: existing, created: false };
    }

    if (googlePlaceId.startsWith('osm:')) {
      const [latStr, lonStr] = googlePlaceId.slice(4).split(',');
      const latitude = Number(latStr);
      const longitude = Number(lonStr);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return { error: 'Invalid map place reference.' };
      }

      const reverse = await this.placesService.reverse(latitude, longitude);
      if (!reverse) {
        return { error: 'Could not resolve the selected map location.' };
      }

      const item = await this.itemsService.create(userId, {
        name: reverse.name,
        category: reverse.category ?? ItemCategory.Other,
        status: options?.forNewVisit ? ItemStatus.Visited : ItemStatus.Wishlist,
        location: {
          latitude: reverse.latitude,
          longitude: reverse.longitude,
          googleMapsUrl: reverse.googleMapsUrl,
          address: reverse.displayName,
          city: reverse.city,
          country: reverse.country,
        },
      });

      relatedItems.set(item.id, item.name);
      return { item, created: true };
    }

    const details = await this.placesService.getGooglePlaceDetails(googlePlaceId);
    if (!details) {
      return { error: 'Could not load place details from Google Maps.' };
    }

    const item = await this.itemsService.create(userId, {
      name: details.name,
      category: details.category,
      status: options?.forNewVisit ? ItemStatus.Visited : ItemStatus.Wishlist,
      location: {
        latitude: details.latitude,
        longitude: details.longitude,
        googlePlaceId: details.googlePlaceId,
        googleMapsUrl: details.googleMapsUrl,
        address: details.displayName,
        city: details.city,
        country: details.country,
        placeId: details.googlePlaceId,
      },
    });

    relatedItems.set(item.id, item.name);
    return { item, created: true };
  }

  private async toolSearchPlaces(
    userId: string,
    query: string,
    relatedItems: Map<string, string>,
  ) {
    const places = await this.itemsService.findAll(userId, { q: query });
    const limited = places.slice(0, 4);
    for (const place of limited) {
      relatedItems.set(place.id, place.name);
    }
    return {
      count: places.length,
      places: limited.map((place) => this.placeSummary(place)),
    };
  }

  private async toolGetLastVisit(
    userId: string,
    placeName?: string,
    placeId?: string,
    relatedItems?: Map<string, string>,
  ) {
    const resolved = await this.resolvePlace(userId, placeName, placeId);
    if ('matches' in resolved) {
      for (const match of resolved.matches.slice(0, 4)) {
        relatedItems?.set(match.id, match.name);
      }
      return resolved;
    }
    if ('error' in resolved || 'found' in resolved) {
      return resolved;
    }

    const place = resolved;
    relatedItems?.set(place.id, place.name);

    const experiences = await this.experiencesService.findByItem(
      userId,
      place.id,
    );
    if (!experiences.length) {
      return {
        place: this.placeSummary(place),
        lastVisit: null,
        message: 'No visits logged yet for this place.',
      };
    }

    const latest = experiences[0];
    return {
      place: this.placeSummary(place),
      lastVisit: {
        experienceId: latest.id,
        visitedAt: latest.visitedAt,
        companions: latest.companions ?? [],
        notes: latest.notes,
        overallRating: latest.rating?.overall,
        photoCount: latest.photos?.length ?? 0,
      },
      totalVisits: experiences.length,
    };
  }

  private async toolUpdateVisit(
    userId: string,
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
  ) {
    const resolved = await this.resolveExperience(userId, args);
    if ('error' in resolved || 'matches' in resolved) {
      return resolved;
    }

    const { experienceId, itemId, itemName } = resolved;
    const updates: Record<string, unknown> = {};

    if (args['newVisitedAt']) {
      updates['visitedAt'] = new Date(String(args['newVisitedAt'])).toISOString();
    }
    if (args['notes'] !== undefined) {
      updates['notes'] = String(args['notes']);
    }
    if (Array.isArray(args['companions'])) {
      updates['companions'] = args['companions'].map(String);
    }
    if (typeof args['overallRating'] === 'number') {
      const overall = args['overallRating'];
      updates['rating'] = {
        food: overall,
        service: overall,
        atmosphere: overall,
        valueForMoney: overall,
        overall,
      };
    }

    if (!Object.keys(updates).length) {
      return { error: 'No changes provided. Specify what to update.' };
    }

    const experience = await this.experiencesService.update(
      userId,
      experienceId,
      updates,
    );

    relatedItems.set(itemId, itemName);

    return {
      success: true,
      place: { id: itemId, name: itemName },
      visit: {
        id: experience.id,
        visitedAt: experience.visitedAt,
        companions: experience.companions ?? [],
        notes: experience.notes,
        overallRating: experience.rating?.overall,
        photoCount: experience.photos?.length ?? 0,
      },
    };
  }

  private async resolveExperience(
    userId: string,
    args: Record<string, unknown>,
  ): Promise<
    | { experienceId: string; itemId: string; itemName: string }
    | { error: string }
    | {
        matches: {
          experienceId: string;
          place: string;
          visitedAt: string;
          companions: string[];
        }[];
      }
  > {
    const experienceId = args['experienceId']
      ? String(args['experienceId'])
      : undefined;

    if (experienceId) {
      try {
        const experiences = await this.findExperienceContext(userId, experienceId);
        return experiences;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Visit lookup failed';
        return { error: message };
      }
    }

    const placeName = args['placeName'] ? String(args['placeName']) : undefined;
    const placeId = args['placeId'] ? String(args['placeId']) : undefined;
    const visitedAt = args['visitedAt'] ? String(args['visitedAt']) : undefined;

    if (!visitedAt) {
      return {
        error:
          'experienceId is required, or provide placeName/placeId with visitedAt to identify the visit.',
      };
    }

    const resolved = await this.resolvePlace(userId, placeName, placeId);
    if ('error' in resolved) {
      return resolved;
    }
    if ('found' in resolved) {
      return { error: resolved.message };
    }
    if ('matches' in resolved) {
      return {
        error: 'Several places match. Specify which place the visit was at.',
      };
    }

    const place = resolved;
    const experiences = await this.experiencesService.findByItem(userId, place.id);
    const targetKey = this.visitDateKey(visitedAt);
    const matches = experiences.filter(
      (experience) => this.visitDateKey(experience.visitedAt) === targetKey,
    );

    if (!matches.length) {
      return {
        error: `No visit found for ${place.name} on ${targetKey}.`,
      };
    }
    if (matches.length > 1) {
      return {
        matches: matches.map((experience) => ({
          experienceId: experience.id,
          place: place.name,
          visitedAt: experience.visitedAt,
          companions: experience.companions ?? [],
        })),
      };
    }

    return {
      experienceId: matches[0].id,
      itemId: place.id,
      itemName: place.name,
    };
  }

  private async findExperienceContext(userId: string, experienceId: string) {
    const experience = await this.experiencesService.findByIdForUser(
      userId,
      experienceId,
    );
    const item = await this.itemsService.findOne(
      userId,
      experience.itemId,
    );
    return {
      experienceId: experience.id,
      itemId: item.id,
      itemName: item.name,
    };
  }

  private visitDateKey(visitedAt: string): string {
    const date = new Date(visitedAt);
    if (Number.isNaN(date.getTime())) return visitedAt.slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  private async toolLogVisit(
    userId: string,
    args: Record<string, unknown>,
    photoKeys: string[],
    relatedItems: Map<string, string>,
  ) {
    const validated = this.validateVisitLogArgs(args);
    if (!validated.ok) {
      return this.visitLogNeedsInput(validated.missingFields);
    }

    const resolved = await this.resolvePlace(
      userId,
      args['placeName'] ? String(args['placeName']) : undefined,
      args['placeId'] ? String(args['placeId']) : undefined,
    );
    if ('matches' in resolved || 'error' in resolved || 'found' in resolved) {
      return resolved;
    }

    const place = resolved;
    relatedItems.set(place.id, place.name);

    const { visitedAt, overallRating, companions, notes } = validated;

    const experience = await this.experiencesService.create(userId, place.id, {
      visitedAt,
      companions,
      notes,
      rating: {
        food: overallRating,
        service: overallRating,
        atmosphere: overallRating,
        valueForMoney: overallRating,
        overall: overallRating,
      },
      photos: photoKeys.map((key) => ({ key })),
    });

    return {
      success: true,
      place: this.placeSummary(place),
      visit: {
        id: experience.id,
        visitedAt: experience.visitedAt,
        companions: experience.companions ?? [],
        photoCount: experience.photos?.length ?? 0,
      },
    };
  }

  private async toolSearchPeople(userId: string, query: string) {
    const people = await this.peopleService.findAllForUser(userId, { q: query });
    return {
      people: people.slice(0, 10).map((person) => ({
        id: person.id,
        name: person.name,
        type: person.type,
      })),
    };
  }

  private async toolSearchVisits(
    userId: string,
    query: string,
    relatedItems: Map<string, string>,
  ) {
    const hits = await this.experienceSearchService.search(userId, query, 8);
    const topHits = hits.slice(0, hits.length <= 2 ? hits.length : 1);
    for (const hit of topHits) {
      relatedItems.set(
        hit.experience.itemId,
        hit.itemName ?? hit.experience.itemId,
      );
    }
    return {
      count: hits.length,
      visits: hits.map((hit) => ({
        experienceId: hit.experience.id,
        place: hit.itemName,
        itemId: hit.experience.itemId,
        visitedAt: hit.experience.visitedAt,
        companions: hit.experience.companions ?? [],
        notes: hit.experience.notes,
        overallRating: hit.experience.rating?.overall,
        snippet: hit.snippet,
        photoCount: hit.experience.photos?.length ?? 0,
      })),
    };
  }

  private async resolvePlace(
    userId: string,
    placeName?: string,
    placeId?: string,
  ): Promise<
    | Item
    | { matches: { id: string; name: string; category: string; latestVisit?: string }[] }
    | { error: string }
    | { found: false; message: string }
  > {
    if (placeId) {
      if (placeId.startsWith('ChIJ') || placeId.startsWith('osm:')) {
        return {
          error:
            'That id is a map reference, not a saved Corkboard place. Use ensure_place_from_google first.',
        };
      }
      try {
        return await this.itemsService.findOne(userId, placeId);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Place lookup failed';
        return { error: message };
      }
    }

    const query = placeName?.trim();
    if (!query) {
      return { error: 'placeName or placeId is required' };
    }

    const places = await this.itemsService.findAll(userId, { q: query });
    if (!places.length) {
      return { found: false, message: `No saved place matching "${query}".` };
    }

    const exact = places.filter(
      (place) => place.name.toLowerCase() === query.toLowerCase(),
    );
    if (exact.length === 1) return exact[0];
    if (places.length === 1) return places[0];

    return {
      matches: places.slice(0, 6).map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        latestVisit: place.latestVisit?.visitedAt,
      })),
    };
  }

  private placeSummary(place: Item & { latestVisit?: { visitedAt: string } }) {
    return {
      id: place.id,
      name: place.name,
      category: place.category,
      latestVisit: place.latestVisit?.visitedAt,
    };
  }

  private async resumeAfterMapPlaceConfirmation(
    userId: string,
    dto: AssistantChatDto,
    apiKey: string,
    model: string,
  ): Promise<AssistantChatResult> {
    const relatedItems = new Map<string, string>();
    const locale = dto.locale ?? 'en';
    const confirmed = dto.confirmedMapPlace!;
    const intent = await this.classifyMapPlaceIntent(apiKey, model, dto.messages);

    const place = await this.ensurePlaceFromGoogle(
      userId,
      confirmed.googlePlaceId,
      relatedItems,
      { forNewVisit: intent === 'log_visit' },
    );
    if ('error' in place) {
      throw new BadRequestException(place.error);
    }

    const placeName = confirmed.name ?? place.item.name;

    if (intent === 'log_visit') {
      const visitDetails = await this.extractVisitDetailsFromMessages(
        apiKey,
        model,
        dto.messages,
      );
      const validated = this.validateVisitLogArgs(visitDetails);
      if (!validated.ok) {
        return {
          message: this.formatMissingVisitPrompt(
            validated.missingFields,
            locale,
            placeName,
          ),
          relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
            id,
            name,
          })),
        };
      }

      const result = await this.toolCreatePlaceAndLogVisit(
        userId,
        {
          googlePlaceId: confirmed.googlePlaceId,
          visitedAt: validated.visitedAt,
          companions: validated.companions,
          notes: validated.notes,
          overallRating: validated.overallRating,
        },
        dto.photoKeys ?? [],
        relatedItems,
      );
      if (typeof result === 'object' && result !== null && 'error' in result) {
        throw new BadRequestException(String(result.error));
      }

      const companions = validated.companions;
      const companionText =
        companions.length
          ? locale === 'es'
            ? ` con ${companions.join(', ')}`
            : ` with ${companions.join(', ')}`
          : '';

      return {
        message:
          locale === 'es'
            ? `¡Listo! Guardé ${placeName} y registré tu visita${companionText}.`
            : `Done! I saved ${placeName} and logged your visit${companionText}.`,
        relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
          id,
          name,
        })),
      };
    }

    if (intent === 'lookup_last_visit') {
      const lastVisit = await this.toolGetLastVisit(
        userId,
        undefined,
        place.item.id,
        relatedItems,
      );
      return {
        message: this.formatLastVisitAnswer(lastVisit, placeName, locale),
        relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
          id,
          name,
        })),
      };
    }

    return this.runAssistantLoop(userId, dto, apiKey, model, {
      id: place.item.id,
      name: place.item.name,
    });
  }

  private async classifyMapPlaceIntent(
    apiKey: string,
    model: string,
    messages: AssistantChatDto['messages'],
  ): Promise<'lookup_last_visit' | 'lookup_other' | 'log_visit' | 'update_visit'> {
    const conversation = messages
      .map((message) => `${message.role}: ${message.content}`)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'Classify what the user wants regarding a map place they confirmed. Return JSON: { "intent": "lookup_last_visit" | "lookup_other" | "log_visit" | "update_visit" }. Use lookup_last_visit when asking when they last went somewhere. Use log_visit only when reporting a new visit. Use update_visit when correcting an existing visit. Use lookup_other for other questions about visits.',
          },
          { role: 'user', content: conversation },
        ],
      }),
    });

    if (!response.ok) {
      return 'lookup_last_visit';
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) return 'lookup_last_visit';

    try {
      const parsed = JSON.parse(raw) as { intent?: string };
      if (
        parsed.intent === 'log_visit' ||
        parsed.intent === 'update_visit' ||
        parsed.intent === 'lookup_other'
      ) {
        return parsed.intent;
      }
    } catch {
      // Fall through.
    }

    return 'lookup_last_visit';
  }

  private formatLastVisitAnswer(
    lastVisitResult: unknown,
    placeName: string,
    locale: 'en' | 'es',
  ): string {
    const angularLocale = locale === 'es' ? 'es-ES' : 'en-US';

    if (
      lastVisitResult &&
      typeof lastVisitResult === 'object' &&
      'lastVisit' in lastVisitResult
    ) {
      const lastVisit = (
        lastVisitResult as {
          lastVisit: {
            visitedAt: string;
            companions?: string[];
            notes?: string;
            overallRating?: number;
          } | null;
        }
      ).lastVisit;

      if (!lastVisit) {
        return locale === 'es'
          ? `Aún no tienes visitas registradas en ${placeName}.`
          : `You haven't logged any visits to ${placeName} yet.`;
      }

      const date = new Date(lastVisit.visitedAt).toLocaleDateString(
        angularLocale,
        { dateStyle: 'long' },
      );
      const parts: string[] = [];
      if (locale === 'es') {
        parts.push(`Tu última visita a ${placeName} fue el ${date}.`);
      } else {
        parts.push(`Your last visit to ${placeName} was on ${date}.`);
      }

      if (lastVisit.companions?.length) {
        parts.push(
          locale === 'es'
            ? `Fuiste con ${lastVisit.companions.join(', ')}.`
            : `You went with ${lastVisit.companions.join(', ')}.`,
        );
      }
      if (lastVisit.overallRating != null) {
        parts.push(
          locale === 'es'
            ? `Puntuación: ${lastVisit.overallRating}/10.`
            : `Rating: ${lastVisit.overallRating}/10.`,
        );
      }
      if (lastVisit.notes) {
        parts.push(lastVisit.notes);
      }
      return parts.join(' ');
    }

    return locale === 'es'
      ? `No pude encontrar visitas registradas en ${placeName}.`
      : `I couldn't find any logged visits to ${placeName}.`;
  }

  private validateVisitLogArgs(args: Record<string, unknown>):
    | {
        ok: true;
        visitedAt: string;
        overallRating: number;
        companions: string[];
        notes?: string;
      }
    | { ok: false; missingFields: VisitLogMissingField[] } {
    const missingFields: VisitLogMissingField[] = [];

    const visitedAtRaw = args['visitedAt'];
    let visitedAt: string | undefined;
    if (typeof visitedAtRaw === 'string' && visitedAtRaw.trim()) {
      const parsed = new Date(visitedAtRaw);
      if (!Number.isNaN(parsed.getTime())) {
        visitedAt = parsed.toISOString();
      }
    }
    if (!visitedAt) {
      missingFields.push('visitedAt');
    }

    const overallRating = args['overallRating'];
    if (
      typeof overallRating !== 'number' ||
      overallRating < 0 ||
      overallRating > 10
    ) {
      missingFields.push('overallRating');
    }

    if (!('companions' in args) || !Array.isArray(args['companions'])) {
      missingFields.push('companions');
    }

    if (missingFields.length) {
      return { ok: false, missingFields };
    }

    return {
      ok: true,
      visitedAt: visitedAt!,
      overallRating,
      companions: (args['companions'] as unknown[]).map(String),
      notes:
        typeof args['notes'] === 'string'
          ? args['notes'].trim() || undefined
          : undefined,
    };
  }

  private visitLogNeedsInput(missingFields: VisitLogMissingField[]) {
    return {
      needsInput: true,
      missingFields,
      message: `Cannot log the visit yet. Ask the user for: ${missingFields.join(', ')}. Do not guess or use defaults.`,
    };
  }

  private formatMissingVisitPrompt(
    missingFields: VisitLogMissingField[],
    locale: 'en' | 'es',
    placeName?: string,
  ): string {
    const place = placeName ? ` ${placeName}` : '';
    const labels: Record<VisitLogMissingField, { en: string; es: string }> = {
      visitedAt: { en: 'when you went', es: 'cuándo fuiste' },
      overallRating: { en: 'your overall rating (0–10)', es: 'tu puntuación general (0–10)' },
      companions: { en: 'who you went with (or if you went alone)', es: 'con quién fuiste (o si fuiste solo/a)' },
    };

    const parts = missingFields.map((field) => labels[field][locale]);

    if (locale === 'es') {
      if (parts.length === 1) {
        return `Para registrar la visita${place}, ¿me dices ${parts[0]}?`;
      }
      const last = parts.pop();
      return `Para registrar la visita${place}, ¿me dices ${parts.join(', ')} y ${last}?`;
    }

    if (parts.length === 1) {
      return `To log the visit${place ? ` to${place}` : ''}, could you tell me ${parts[0]}?`;
    }
    const last = parts.pop();
    return `To log the visit${place ? ` to${place}` : ''}, could you tell me ${parts.join(', ')}, and ${last}?`;
  }

  private async extractVisitDetailsFromMessages(
    apiKey: string,
    model: string,
    messages: AssistantChatDto['messages'],
  ): Promise<Record<string, unknown>> {
    const today = new Date().toISOString().slice(0, 10);
    const conversation = messages
      .filter((message) => message.role === 'user')
      .map((message) => message.content)
      .join('\n');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: [
              `Today is ${today}.`,
              'Extract visit details ONLY when the user is logging a new visit.',
              'Return JSON: { "visitedAt": "ISO 8601 date or null", "companions": ["name"] or null, "notes": "optional", "overallRating": number or null, "wentAlone": boolean or null }.',
              'Use null for any field the user did not clearly state. Do not guess dates or ratings.',
              'If the user said they went alone/solo, set wentAlone: true and companions: [].',
              'If they named companions, set companions to those names.',
            ].join(' '),
          },
          { role: 'user', content: conversation || today },
        ],
      }),
    });

    if (!response.ok) {
      return {};
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as {
        visitedAt?: string | null;
        companions?: string[] | null;
        notes?: string;
        overallRating?: number | null;
        wentAlone?: boolean | null;
      };

      const result: Record<string, unknown> = {};

      if (parsed.visitedAt) {
        const date = new Date(parsed.visitedAt);
        if (!Number.isNaN(date.getTime())) {
          result['visitedAt'] = date.toISOString();
        }
      }

      if (typeof parsed.overallRating === 'number') {
        result['overallRating'] = parsed.overallRating;
      }

      if (parsed.wentAlone === true) {
        result['companions'] = [];
      } else if (Array.isArray(parsed.companions)) {
        result['companions'] = parsed.companions.filter(Boolean).map(String);
      }

      if (parsed.notes?.trim()) {
        result['notes'] = parsed.notes.trim();
      }

      return result;
    } catch {
      return {};
    }
  }
}
