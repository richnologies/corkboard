import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Item, ItemCategory, ItemStatus, CompanionAmbiguity, Person, formatLocationSummary, locationMatchesQuery, resolveRelativeVisitDate, todayIsoInTimeZone } from '@org/domain';
import { ItemsService } from '../items/items.service.js';
import { ExperiencesService } from '../experiences/experiences.service.js';
import { ExperienceSearchService } from '../experiences/experience-search.service.js';
import { PeopleService } from '../people/people.service.js';
import { PlacesService } from '../places/places.service.js';
import { ConversationsService } from '../conversations/conversations.service.js';
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

export interface VisitPhotoAttachment {
  key: string;
  thumbKey?: string;
}

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

export interface AssistantChatResult {
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

@Injectable()
export class AssistantService {
  constructor(
    private readonly config: ConfigService,
    private readonly itemsService: ItemsService,
    private readonly experiencesService: ExperiencesService,
    private readonly experienceSearchService: ExperienceSearchService,
    private readonly peopleService: PeopleService,
    private readonly placesService: PlacesService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async chat(userId: string, dto: AssistantChatDto): Promise<AssistantChatResult> {
    const apiKey = this.config.get<string>('app.openai.apiKey');
    const model = this.config.get<string>('app.openai.model') ?? 'gpt-4o-mini';

    if (!apiKey) {
      throw new ServiceUnavailableException(
        'Assistant is not configured. Set OPENAI_API_KEY in your environment.',
      );
    }

    const skipUserMessage = !!(
      dto.pendingVisit && dto.confirmedCompanions?.length
    );

    let result: AssistantChatResult;
    if (dto.confirmedMapPlace?.googlePlaceId) {
      result = await this.resumeAfterMapPlaceConfirmation(
        userId,
        dto,
        apiKey,
        model,
      );
    } else if (skipUserMessage) {
      result = await this.resumeAfterCompanionConfirmation(userId, dto);
    } else {
      result = await this.runAssistantLoop(userId, dto, apiKey, model);
    }

    return this.persistAndReturn(userId, dto, result, skipUserMessage);
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
    let companionAmbiguities: CompanionAmbiguity[] = [];
    let pendingVisit: PendingVisitAction | undefined;
    let loggedVisit = false;
    const locale = dto.locale ?? 'en';
    const timeZone = dto.timeZone?.trim() || 'UTC';
    const today = todayIsoInTimeZone(new Date(), timeZone);
    const weekdayLabel = new Date(`${today}T12:00:00.000Z`).toLocaleDateString(
      locale === 'es' ? 'es-ES' : 'en-US',
      { weekday: 'long', timeZone: 'UTC' },
    );
    const photos = await this.resolveVisitPhotos(userId, dto);
    const photoNote =
      photos.length > 0
        ? `The user has ${photos.length} photo(s) ready to attach to a visit (including any shared earlier in this chat). Always save them with the visit when you log it.`
        : 'The user has not attached photos for this visit yet.';

    const replyLanguage =
      locale === 'es' ? 'Spanish' : 'English';

    const messages: OpenAiMessage[] = [
      {
        role: 'system',
        content: [
          'You are Ambrosio, Malviviendo\'s friendly personal food & places assistant.',
          'The user tracks restaurants and places they visit, with ratings, companions, and photos.',
          `Today is ${weekdayLabel}, ${today} (YYYY-MM-DD) in the user's local timezone (${timeZone}). Interpret relative dates like "today", "yesterday", or "last Tuesday" accordingly. You may pass either an ISO date or the relative phrase as visitedAt — the server resolves phrases.`,
          'For questions about what/where the user ate on a specific day ("last Wednesday", "ayer", "el miércoles pasado"), use find_visits_by_date with relativeDate or an ISO fromDate. Never use get_last_visit unless asking about one named place.',
          'get_last_visit only answers when the user last went to a specific saved place by name — not for date-based recall.',
          `Always reply in ${replyLanguage}, matching the language the user writes in.`,
          'Use tools to look up real data before answering — never invent visits or places.',
          'For questions about where the user has been (city, country, neighborhood), use list_visited_places with a city or country filter. Never infer location from the place name alone.',
          'If list_visited_places returns places without a saved city, say so and suggest adding location in the place details.',
          'Prefer search_visits for questions about companions, visit notes, food/atmosphere memories, or fuzzy visit recall.',
          'Use search_places or get_last_visit when the user names a specific saved place.',
          'When a place is not saved yet: search_places first, then search_google_places if needed.',
          'If search_google_places returns exactly one match, call ensure_place_from_google with that googlePlaceId and continue — never ask the user to confirm a single match.',
          'If search_google_places returns multiple matches, present numbered options and wait for the user to pick one.',
          'Use ensure_place_from_google to save a Google match without logging a visit — especially before answering questions about visit history.',
          'Only call create_place_and_log_visit when the user is reporting a new visit they went on.',
          'Before calling log_visit or create_place_and_log_visit, you must have ALL of: when (visitedAt), overall rating (0-10), and companions (use an empty array if they went alone).',
          'If any of those are missing, ask the user in one friendly message — never guess a date, never default a rating, never log until they answer.',
          'Also capture wouldReturn (whether they would come back). Infer it from their feedback when clear ("never again" → false, "can\'t wait to return" / "loved it" → true). If their feedback is ambiguous, ask briefly — yes/no is fine.',
          'Before logging companions by name, call search_people for each name. Use the exact saved name when there is a clear match.',
          'If a companion name is ambiguous (e.g. "Pi" vs "Pili"), the app will ask the user to pick — do not create a new person until they confirm.',
          'When several saved places match a name, list them and ask the user to clarify.',
          'When logging a visit to an existing saved place, use log_visit.',
          'When the user wants to change, fix, or correct an existing visit, use search_visits or get_last_visit to find it, then update_visit. Never use log_visit or create_place_and_log_visit for edits.',
          'Use log_visit or create_place_and_log_visit only when the user is explicitly logging a new visit.',
          'When several Google Maps candidates are returned, ask which one they mean by number or name — do not create a visit until they confirm.',
          resolvedPlace
            ? `The user already confirmed "${resolvedPlace.name}" (placeId: ${resolvedPlace.id}). Answer their original question using get_last_visit or search_visits. Do NOT log a new visit.`
            : null,
          'Keep replies short and conversational (2-4 sentences unless listing matches).',
          'When you ask a clarifying question with short, tap-friendly answers (dates like today/yesterday, ratings 0–10, alone vs with someone, yes/no for coming back, etc.), end your message with exactly one machine line: <<<replies: Option1 | Option2 | Option3>>> in the user\'s language. Include 2–5 options. Only add that line when you are waiting for the user to answer — never on confirmations, finished logs, or lookup answers.',
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
        let roundCompanionAmbiguities: CompanionAmbiguity[] = [];
        let roundPendingVisit: PendingVisitAction | undefined;
        let roundMissingFields: VisitLogMissingField[] | undefined;
        for (const toolCall of choice.tool_calls) {
          let result: unknown;
          try {
            result = await this.runTool(
              userId,
              toolCall,
              photos,
              timeZone,
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
          if (this.isCompanionAmbiguityResult(result)) {
            roundCompanionAmbiguities = result.companionAmbiguities;
            roundPendingVisit = result.pendingVisit;
          }
          if (this.isVisitNeedsInputResult(result)) {
            roundMissingFields = result.missingFields;
          }
          if (this.isSuccessfulVisitLogResult(result)) {
            loggedVisit = true;
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
        if (roundCompanionAmbiguities.length) {
          companionAmbiguities = roundCompanionAmbiguities;
          pendingVisit = roundPendingVisit;
          return this.companionAmbiguityResponse(
            companionAmbiguities,
            pendingVisit!,
            relatedItems,
            locale,
          );
        }
        if (roundMissingFields?.length) {
          return {
            message: this.formatMissingVisitPrompt(roundMissingFields, locale),
            relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
              id,
              name,
            })),
            suggestedReplies: this.suggestedRepliesForMissing(
              roundMissingFields,
              locale,
            ),
            placeCandidates:
              placeCandidates.length > 1 ? placeCandidates : undefined,
          };
        }
        continue;
      }

      const text = choice.content?.trim();
      if (!text) {
        throw new BadRequestException('Assistant returned an empty response');
      }

      const parsed = this.parseAssistantReply(text, locale);
      return {
        message: parsed.message,
        relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
          id,
          name,
        })),
        placeCandidates:
          placeCandidates.length > 1 ? placeCandidates : undefined,
        suggestedReplies: parsed.suggestedReplies,
        loggedVisit: loggedVisit || undefined,
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
    photos: VisitPhotoAttachment[],
    timeZone: string,
    relatedItems: Map<string, string>,
    onPlaceCandidates: (candidates: MapPlaceCandidate[]) => void,
  ): Promise<unknown> {
    const args = JSON.parse(toolCall.function.arguments || '{}') as Record<
      string,
      unknown
    >;

    switch (toolCall.function.name) {
      case 'list_visited_places':
        return this.toolListVisitedPlaces(userId, args, relatedItems);
      case 'search_places':
        return this.toolSearchPlaces(userId, args, relatedItems);
      case 'find_visits_by_date':
        return this.toolFindVisitsByDate(userId, args, relatedItems, timeZone);
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
          photos,
          timeZone,
          relatedItems,
        );
      case 'ensure_place_from_google':
        return this.toolEnsurePlaceFromGoogle(userId, args, relatedItems);
      case 'log_visit':
        return this.toolLogVisit(userId, args, photos, timeZone, relatedItems);
      case 'update_visit':
        return this.toolUpdateVisit(userId, args, timeZone, relatedItems);
      case 'search_visits':
        return this.toolSearchVisits(userId, args, relatedItems);
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
    photos: VisitPhotoAttachment[],
    timeZone: string,
    relatedItems: Map<string, string>,
  ) {
    const googlePlaceId = String(args['googlePlaceId'] ?? '').trim();
    if (!googlePlaceId) {
      return { error: 'googlePlaceId is required' };
    }

    const validated = this.validateVisitLogArgs(args, timeZone);
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

    const { visitedAt, overallRating, companions, notes, wouldReturn } =
      validated;

    const companionResult = await this.peopleService.prepareCompanions(
      userId,
      companions,
    );
    if (!companionResult.ok) {
      return this.companionAmbiguityToolResult(
        companionResult.ambiguities,
        this.pendingVisitWithPhotos(
          {
            type: 'create_place_and_log_visit',
            googlePlaceId,
            visitedAt,
            overallRating,
            notes,
            wouldReturn,
            companions,
          },
          photos,
        ),
      );
    }

    const experience = await this.experiencesService.create(
      userId,
      place.item.id,
      {
        visitedAt,
        companionPersonIds: companionResult.companionPersonIds,
        notes,
        wouldReturn,
        rating: {
          food: overallRating,
          service: overallRating,
          atmosphere: overallRating,
          valueForMoney: overallRating,
          overall: overallRating,
        },
        photos: photos.map((photo) => ({
          key: photo.key,
          thumbKey: photo.thumbKey,
        })),
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
        wouldReturn: experience.wouldReturn,
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

  private async toolListVisitedPlaces(
    userId: string,
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
  ) {
    const city = args['city'] ? String(args['city']).trim() : undefined;
    const country = args['country'] ? String(args['country']).trim() : undefined;
    const query = args['query'] ? String(args['query']).trim() : undefined;
    const categoryRaw = args['category'] ? String(args['category']) : undefined;
    const category = categoryRaw
      ? (Object.values(ItemCategory).includes(categoryRaw as ItemCategory)
          ? (categoryRaw as ItemCategory)
          : undefined)
      : undefined;

    if (!city && !country && !query && !category) {
      return {
        error:
          'Provide at least one filter: city, country, category, or query.',
      };
    }

    const places = await this.itemsService.findVisitedPlaces(userId, {
      city,
      country,
      category,
      q: query,
    });

    for (const place of places.slice(0, 12)) {
      relatedItems.set(place.id, place.name);
    }

    const withoutLocation = places.filter(
      (place) => !formatLocationSummary(place.location),
    ).length;

    return {
      count: places.length,
      withoutLocationCount: withoutLocation,
      places: places.slice(0, 12).map((place) => this.placeSummary(place)),
      message:
        withoutLocation && (city || country)
          ? `${withoutLocation} visited place(s) have no saved city — they are excluded from this location filter.`
          : undefined,
    };
  }

  private async toolSearchPlaces(
    userId: string,
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
  ) {
    const query = String(args['query'] ?? '').trim();
    if (!query) {
      return { error: 'query is required' };
    }

    const city = args['city'] ? String(args['city']).trim() : undefined;
    const country = args['country'] ? String(args['country']).trim() : undefined;

    let places = await this.itemsService.findAll(userId, { q: query });

    if (city) {
      places = places.filter((place) =>
        locationMatchesQuery(place.location, city),
      );
    }
    if (country) {
      places = places.filter((place) =>
        locationMatchesQuery(place.location, country),
      );
    }

    const limited = places.slice(0, 4);
    for (const place of limited) {
      relatedItems.set(place.id, place.name);
    }
    return {
      count: places.length,
      places: limited.map((place) => this.placeSummary(place)),
    };
  }

  private async toolFindVisitsByDate(
    userId: string,
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
    timeZone: string,
  ) {
    let fromDate = args['fromDate'] ? String(args['fromDate']).trim() : undefined;
    let toDate = args['toDate'] ? String(args['toDate']).trim() : undefined;
    const relativeDate = args['relativeDate']
      ? String(args['relativeDate']).trim()
      : undefined;
    const categoryRaw = args['category'] ? String(args['category']) : undefined;
    const category = categoryRaw
      ? (Object.values(ItemCategory).includes(categoryRaw as ItemCategory)
          ? (categoryRaw as ItemCategory)
          : undefined)
      : undefined;

    if (relativeDate) {
      const resolved = resolveRelativeVisitDate(
        relativeDate,
        new Date(),
        timeZone,
      );
      if (!resolved) {
        return {
          error: `Could not parse date phrase "${relativeDate}". Use YYYY-MM-DD in fromDate instead.`,
        };
      }
      fromDate = resolved.fromDate;
      toDate = resolved.toDate;
    }

    if (!fromDate) {
      return { error: 'Provide fromDate (YYYY-MM-DD) or relativeDate.' };
    }
    toDate = toDate ?? fromDate;

    let visits = await this.experiencesService.findForCalendar(
      userId,
      fromDate,
      toDate,
    );

    if (category) {
      const filtered = [];
      for (const visit of visits) {
        try {
          const item = await this.itemsService.findOne(userId, visit.itemId);
          if (item.category === category) filtered.push(visit);
        } catch {
          continue;
        }
      }
      visits = filtered;
    }

    for (const visit of visits.slice(0, 12)) {
      relatedItems.set(visit.itemId, visit.itemName);
    }

    return {
      fromDate,
      toDate,
      count: visits.length,
      visits: visits.map((visit) => ({
        experienceId: visit.id,
        place: visit.itemName,
        itemId: visit.itemId,
        visitedAt: visit.visitedAt,
        companions: visit.companions ?? [],
        notes: visit.notes,
        overallRating: visit.rating?.overall,
        photoCount: visit.photoCount,
      })),
      message:
        visits.length === 0
          ? `No visits logged between ${fromDate} and ${toDate}.`
          : undefined,
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
    timeZone: string,
    relatedItems: Map<string, string>,
  ) {
    const resolved = await this.resolveExperience(userId, args);
    if ('error' in resolved || 'matches' in resolved) {
      return resolved;
    }

    const { experienceId, itemId, itemName } = resolved;
    const updates: Record<string, unknown> = {};

    if (args['newVisitedAt']) {
      const parsed = this.parseVisitedAt(String(args['newVisitedAt']), timeZone);
      if (!parsed) {
        return { error: 'Could not parse the new visit date.' };
      }
      updates['visitedAt'] = parsed;
    }
    if (args['notes'] !== undefined) {
      updates['notes'] = String(args['notes']);
    }
    if (typeof args['wouldReturn'] === 'boolean') {
      updates['wouldReturn'] = args['wouldReturn'];
    }
    if (Array.isArray(args['companions'])) {
      const companionNames = args['companions'].map(String);
      const companionResult = await this.peopleService.prepareCompanions(
        userId,
        companionNames,
      );
      if (!companionResult.ok) {
        return this.companionAmbiguityToolResult(
          companionResult.ambiguities,
          {
            type: 'update_visit',
            experienceId,
            companions: companionNames,
          },
        );
      }
      updates['companionPersonIds'] = companionResult.companionPersonIds;
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
        wouldReturn: experience.wouldReturn,
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
    photos: VisitPhotoAttachment[],
    timeZone: string,
    relatedItems: Map<string, string>,
  ) {
    const validated = this.validateVisitLogArgs(args, timeZone);
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

    const { visitedAt, overallRating, companions, notes, wouldReturn } =
      validated;

    const companionResult = await this.peopleService.prepareCompanions(
      userId,
      companions,
    );
    if (!companionResult.ok) {
      return this.companionAmbiguityToolResult(
        companionResult.ambiguities,
        this.pendingVisitWithPhotos(
          {
            type: 'log_visit',
            placeId: place.id,
            visitedAt,
            overallRating,
            notes,
            wouldReturn,
            companions,
          },
          photos,
        ),
      );
    }

    const experience = await this.experiencesService.create(userId, place.id, {
      visitedAt,
      companionPersonIds: companionResult.companionPersonIds,
      notes,
      wouldReturn,
      rating: {
        food: overallRating,
        service: overallRating,
        atmosphere: overallRating,
        valueForMoney: overallRating,
        overall: overallRating,
      },
      photos: photos.map((photo) => ({
        key: photo.key,
        thumbKey: photo.thumbKey,
      })),
    });

    return {
      success: true,
      place: this.placeSummary(place),
      visit: {
        id: experience.id,
        visitedAt: experience.visitedAt,
        companions: experience.companions ?? [],
        wouldReturn: experience.wouldReturn,
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
    args: Record<string, unknown>,
    relatedItems: Map<string, string>,
  ) {
    const query = String(args['query'] ?? '').trim();
    if (!query) {
      return { error: 'query is required' };
    }

    const city = args['city'] ? String(args['city']).trim() : undefined;
    const country = args['country'] ? String(args['country']).trim() : undefined;

    let hits = await this.experienceSearchService.search(userId, query, 12);

    if (city || country) {
      const filtered: typeof hits = [];
      for (const hit of hits) {
        try {
          const item = await this.itemsService.findOne(
            userId,
            hit.experience.itemId,
          );
          if (city && !locationMatchesQuery(item.location, city)) continue;
          if (country && !locationMatchesQuery(item.location, country)) {
            continue;
          }
          filtered.push(hit);
        } catch {
          continue;
        }
      }
      hits = filtered;
    }

    const topHits = hits.slice(0, hits.length <= 2 ? hits.length : 1);
    for (const hit of topHits) {
      relatedItems.set(
        hit.experience.itemId,
        hit.itemName ?? hit.experience.itemId,
      );
    }
    return {
      count: hits.length,
      visits: hits.slice(0, 8).map((hit) => ({
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
            'That id is a map reference, not a saved Malviviendo place. Use ensure_place_from_google first.',
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
        location: formatLocationSummary(place.location) ?? null,
        latestVisit: place.latestVisit?.visitedAt,
      })),
    };
  }

  private placeSummary(place: Item & { latestVisit?: { visitedAt: string } }) {
    const location = formatLocationSummary(place.location);
    return {
      id: place.id,
      name: place.name,
      category: place.category,
      location: location ?? null,
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
      const timeZone = dto.timeZone?.trim() || 'UTC';
      const photos = await this.resolveVisitPhotos(userId, dto);
      const visitDetails = await this.extractVisitDetailsFromMessages(
        apiKey,
        model,
        dto.messages,
        timeZone,
      );
      const validated = this.validateVisitLogArgs(visitDetails, timeZone);
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
          suggestedReplies: this.suggestedRepliesForMissing(
            validated.missingFields,
            locale,
          ),
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
          wouldReturn: validated.wouldReturn,
        },
        photos,
        timeZone,
        relatedItems,
      );
      if (this.isCompanionAmbiguityResult(result)) {
        return this.companionAmbiguityResponse(
          result.companionAmbiguities,
          result.pendingVisit,
          relatedItems,
          locale,
        );
      }
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
        loggedVisit: true,
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

  private validateVisitLogArgs(
    args: Record<string, unknown>,
    timeZone = 'UTC',
  ):
    | {
        ok: true;
        visitedAt: string;
        overallRating: number;
        companions: string[];
        notes?: string;
        wouldReturn?: boolean;
      }
    | { ok: false; missingFields: VisitLogMissingField[] } {
    const missingFields: VisitLogMissingField[] = [];

    const visitedAtRaw = args['visitedAt'];
    let visitedAt: string | undefined;
    if (typeof visitedAtRaw === 'string' && visitedAtRaw.trim()) {
      visitedAt = this.parseVisitedAt(visitedAtRaw, timeZone);
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

    const ratingValue = overallRating as number;

    return {
      ok: true,
      visitedAt: visitedAt!,
      overallRating: ratingValue,
      companions: (args['companions'] as unknown[]).map(String),
      notes:
        typeof args['notes'] === 'string'
          ? args['notes'].trim() || undefined
          : undefined,
      wouldReturn:
        typeof args['wouldReturn'] === 'boolean'
          ? args['wouldReturn']
          : undefined,
    };
  }

  private parseVisitedAt(raw: string, timeZone = 'UTC'): string | undefined {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString();
      }
    }

    const resolved = resolveRelativeVisitDate(trimmed, new Date(), timeZone);
    if (resolved) {
      return `${resolved.fromDate}T12:00:00.000Z`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }

    return undefined;
  }

  private visitLogNeedsInput(missingFields: VisitLogMissingField[]) {
    return {
      needsInput: true,
      missingFields,
      message: `Cannot log the visit yet. Ask the user for: ${missingFields.join(', ')}. Do not guess or use defaults.`,
    };
  }

  private isVisitNeedsInputResult(
    result: unknown,
  ): result is { needsInput: true; missingFields: VisitLogMissingField[] } {
    return (
      typeof result === 'object' &&
      result !== null &&
      'needsInput' in result &&
      (result as { needsInput?: unknown }).needsInput === true &&
      Array.isArray((result as { missingFields?: unknown }).missingFields)
    );
  }

  private isSuccessfulVisitLogResult(result: unknown): boolean {
    return (
      typeof result === 'object' &&
      result !== null &&
      'success' in result &&
      (result as { success?: unknown }).success === true &&
      'visit' in result
    );
  }

  private suggestedRepliesForMissing(
    missingFields: VisitLogMissingField[],
    locale: 'en' | 'es',
  ): string[] | undefined {
    const replies: string[] = [];
    if (missingFields.includes('visitedAt')) {
      replies.push(...(locale === 'es' ? ['Hoy', 'Ayer'] : ['Today', 'Yesterday']));
    }
    if (missingFields.includes('overallRating')) {
      replies.push('10', '8', '7', '5', '3');
    }
    if (missingFields.includes('companions')) {
      replies.push(locale === 'es' ? 'Solo/a' : 'Alone');
    }
    return replies.length ? replies : undefined;
  }

  /** Pull <<<replies: A | B>>> from Ambrosio's text; fall back to heuristics for questions. */
  private parseAssistantReply(
    text: string,
    locale: 'en' | 'es',
  ): { message: string; suggestedReplies?: string[] } {
    const marker =
      /(?:\r?\n)?<<<\s*replies\s*:\s*([^>]+?)\s*>>>/i;
    const match = text.match(marker);
    if (match) {
      const suggestedReplies = match[1]
        .split('|')
        .map((option) => option.trim())
        .filter(Boolean)
        .slice(0, 6);
      const message = text.replace(marker, '').trim();
      return {
        message,
        suggestedReplies: suggestedReplies.length ? suggestedReplies : undefined,
      };
    }

    return {
      message: text,
      suggestedReplies: this.inferSuggestedReplies(text, locale),
    };
  }

  private inferSuggestedReplies(
    message: string,
    locale: 'en' | 'es',
  ): string[] | undefined {
    // Only attach chips when Ambrosio is clearly waiting for an answer.
    if (!/[?？]|¿/.test(message) && !/\b(please|por favor|dime|tell me|could you|me dices)\b/i.test(message)) {
      return undefined;
    }

    const lower = message.toLowerCase();
    const replies: string[] = [];

    const asksReturn =
      /would you|come back|go back|return|volver|volver[ií]as|regresar|otra vez/.test(
        lower,
      ) &&
      /(back|return|volver|regres|again|otra)/.test(lower);
    if (asksReturn) {
      replies.push(...(locale === 'es' ? ['Sí', 'No'] : ['Yes', 'No']));
    }

    const asksRating =
      /(rating|score|out of|\/\s*10|puntuaci|nota|del 0|de 0 a|0\s*[-–]\s*10|overall)/.test(
        lower,
      );
    if (asksRating) {
      replies.push('10', '8', '7', '5', '3');
    }

    const asksDate =
      /(when|what day|which day|cu[aá]ndo|qu[eé] d[ií]a|fecha|visited|fuiste|fue)/.test(
        lower,
      ) &&
      /(when|day|date|cu[aá]ndo|d[ií]a|fecha|went|fuiste)/.test(lower);
    if (asksDate && !asksReturn) {
      replies.push(
        ...(locale === 'es' ? ['Hoy', 'Ayer'] : ['Today', 'Yesterday']),
      );
    }

    const asksCompanions =
      /(who|with|alone|solo|sola|acompa|compa[nñ]|con qui[eé]n)/.test(lower);
    if (asksCompanions && !asksReturn) {
      replies.push(locale === 'es' ? 'Solo/a' : 'Alone');
    }

    // Generic yes/no questions (confirmation) when nothing more specific matched.
    if (
      !replies.length &&
      /\b(yes or no|s[ií] o no|did you|do you|is that|was that|¿(es|fue|quieres|vas|te))\b/i.test(
        lower,
      )
    ) {
      replies.push(...(locale === 'es' ? ['Sí', 'No'] : ['Yes', 'No']));
    }

    return replies.length ? [...new Set(replies)].slice(0, 6) : undefined;
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
    timeZone = 'UTC',
  ): Promise<Record<string, unknown>> {
    const today = todayIsoInTimeZone(new Date(), timeZone);
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
              `Today is ${today} in timezone ${timeZone}.`,
              'Extract visit details ONLY when the user is logging a new visit.',
              'Return JSON: { "visitedAt": "ISO date, relative phrase like today/yesterday/last Tuesday, or null", "companions": ["name"] or null, "notes": "optional", "overallRating": number or null, "wentAlone": boolean or null, "wouldReturn": boolean or null }.',
              'Use null for any field the user did not clearly state. Do not guess dates or ratings.',
              'Prefer keeping relative phrases (today, yesterday, last Tuesday) when the user used them.',
              'If the user said they went alone/solo, set wentAlone: true and companions: [].',
              'If they named companions, set companions to those names.',
              'Set wouldReturn from clear feedback ("never again" → false, "would go back" / "loved it" → true). Leave null if unsure.',
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
        wouldReturn?: boolean | null;
      };

      const result: Record<string, unknown> = {};

      if (parsed.visitedAt) {
        const resolved = this.parseVisitedAt(parsed.visitedAt, timeZone);
        if (resolved) {
          result['visitedAt'] = resolved;
        } else {
          result['visitedAt'] = parsed.visitedAt;
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

      if (typeof parsed.wouldReturn === 'boolean') {
        result['wouldReturn'] = parsed.wouldReturn;
      }

      return result;
    } catch {
      return {};
    }
  }

  private isCompanionAmbiguityResult(
    result: unknown,
  ): result is {
    companionAmbiguities: CompanionAmbiguity[];
    pendingVisit: PendingVisitAction;
  } {
    return (
      typeof result === 'object' &&
      result !== null &&
      'companionAmbiguities' in result &&
      Array.isArray((result as { companionAmbiguities: unknown }).companionAmbiguities) &&
      'pendingVisit' in result
    );
  }

  private companionAmbiguityToolResult(
    ambiguities: { query: string; candidates: Person[] }[],
    pendingVisit: PendingVisitAction,
  ) {
    return {
      needsInput: true,
      companionAmbiguities: ambiguities.map((ambiguity) => ({
        query: ambiguity.query,
        candidates: ambiguity.candidates.map((person) => ({
          id: person.id,
          name: person.name,
          type: person.type,
        })),
      })),
      pendingVisit,
      message:
        'Companion names are ambiguous. The app will ask the user to pick existing people or confirm new ones. Do not create people yet.',
    };
  }

  private companionAmbiguityResponse(
    companionAmbiguities: CompanionAmbiguity[],
    pendingVisit: PendingVisitAction,
    relatedItems: Map<string, string>,
    locale: 'en' | 'es',
  ): AssistantChatResult {
    return {
      message: this.formatCompanionAmbiguityPrompt(companionAmbiguities, locale),
      relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
        id,
        name,
      })),
      companionAmbiguities,
      pendingVisit,
    };
  }

  private formatCompanionAmbiguityPrompt(
    ambiguities: CompanionAmbiguity[],
    locale: 'en' | 'es',
  ): string {
    if (locale === 'es') {
      if (ambiguities.length === 1) {
        const name = ambiguities[0].query;
        return `Antes de guardar la visita, ¿te refieres a alguien que ya tienes como "${name}"? Elige abajo o confirma que quieres crear una persona nueva.`;
      }
      return 'Antes de guardar la visita, aclara a quién te refieres con estos nombres. Elige abajo para cada uno.';
    }

    if (ambiguities.length === 1) {
      const name = ambiguities[0].query;
      return `Before I save this visit, did you mean someone you already have as "${name}"? Pick below or confirm a new person.`;
    }
    return 'Before I save this visit, please clarify who you mean for these names. Pick an option below for each.';
  }

  private async resumeAfterCompanionConfirmation(
    userId: string,
    dto: AssistantChatDto,
  ): Promise<AssistantChatResult> {
    const locale = dto.locale ?? 'en';
    const pending = dto.pendingVisit!;
    const resolutions = dto.confirmedCompanions ?? [];
    const relatedItems = new Map<string, string>();
    const photos = await this.resolveVisitPhotos(userId, dto);

    const companionResult = await this.peopleService.prepareCompanions(
      userId,
      pending.companions,
      resolutions,
    );

    if (!companionResult.ok) {
      return this.companionAmbiguityResponse(
        companionResult.ambiguities.map((ambiguity) => ({
          query: ambiguity.query,
          candidates: ambiguity.candidates.map((person) => ({
            id: person.id,
            name: person.name,
            type: person.type,
          })),
        })),
        this.pendingVisitWithPhotos(pending, photos),
        relatedItems,
        locale,
      );
    }

    const rating =
      pending.overallRating != null
        ? {
            food: pending.overallRating,
            service: pending.overallRating,
            atmosphere: pending.overallRating,
            valueForMoney: pending.overallRating,
            overall: pending.overallRating,
          }
        : undefined;

    if (pending.type === 'update_visit') {
      if (!pending.experienceId) {
        throw new BadRequestException('Missing experience for visit update');
      }
      const experience = await this.experiencesService.update(
        userId,
        pending.experienceId,
        { companionPersonIds: companionResult.companionPersonIds },
      );
      const item = await this.itemsService.getAccessibleItem(
        userId,
        String(experience.itemId),
      );
      relatedItems.set(item.id, item.name);
      return {
        message:
          locale === 'es'
            ? `Listo, actualicé los acompañantes de tu visita a ${item.name}.`
            : `Done — I updated the companions on your visit to ${item.name}.`,
        relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
          id,
          name,
        })),
      };
    }

    let placeId = pending.placeId;
    let placeName = '';

    if (pending.type === 'create_place_and_log_visit') {
      if (!pending.googlePlaceId) {
        throw new BadRequestException('Missing place for visit');
      }
      const place = await this.ensurePlaceFromGoogle(
        userId,
        pending.googlePlaceId,
        relatedItems,
        { forNewVisit: true },
      );
      if ('error' in place) {
        throw new BadRequestException(place.error);
      }
      placeId = place.item.id;
      placeName = place.item.name;
    } else if (pending.type === 'log_visit') {
      if (!pending.placeId) {
        throw new BadRequestException('Missing place for visit');
      }
      const item = await this.itemsService.getAccessibleItem(userId, pending.placeId);
      placeId = item.id;
      placeName = item.name;
      relatedItems.set(item.id, item.name);
    }

    if (!placeId || !pending.visitedAt || pending.overallRating == null) {
      throw new BadRequestException('Incomplete visit details');
    }

    await this.experiencesService.create(userId, placeId, {
      visitedAt: pending.visitedAt,
      companionPersonIds: companionResult.companionPersonIds,
      notes: pending.notes,
      wouldReturn: pending.wouldReturn,
      rating: rating!,
      photos: photos.map((photo) => ({
        key: photo.key,
        thumbKey: photo.thumbKey,
      })),
    });

    const companionText =
      companionResult.companions.length
        ? locale === 'es'
          ? ` con ${companionResult.companions.join(', ')}`
          : ` with ${companionResult.companions.join(', ')}`
        : '';

    return {
      message:
        locale === 'es'
          ? `¡Listo! Registré tu visita a ${placeName}${companionText}.`
          : `Done! I logged your visit to ${placeName}${companionText}.`,
      relatedItems: [...relatedItems.entries()].map(([id, name]) => ({
        id,
        name,
      })),
      loggedVisit: true,
    };
  }

  private pendingVisitWithPhotos(
    pending: PendingVisitAction,
    photos: VisitPhotoAttachment[],
  ): PendingVisitAction {
    if (!photos.length) return pending;
    return {
      ...pending,
      photoKeys: photos.map((photo) => photo.key),
      photoThumbKeys: photos.map((photo) => photo.thumbKey ?? ''),
    };
  }

  private async resolveVisitPhotos(
    _userId: string,
    dto: AssistantChatDto,
  ): Promise<VisitPhotoAttachment[]> {
    const photos: VisitPhotoAttachment[] = [];
    const seen = new Set<string>();

    const add = (key?: string, thumbKey?: string) => {
      const trimmed = key?.trim();
      if (!trimmed || seen.has(trimmed)) return;
      seen.add(trimmed);
      photos.push({
        key: trimmed,
        thumbKey: thumbKey?.trim() || undefined,
      });
    };

    const currentKeys = dto.photoKeys ?? [];
    const currentThumbs = dto.photoThumbKeys ?? [];
    currentKeys.forEach((key, index) => add(key, currentThumbs[index]));

    const pendingKeys = dto.pendingVisit?.photoKeys ?? [];
    const pendingThumbs = dto.pendingVisit?.photoThumbKeys ?? [];
    pendingKeys.forEach((key, index) => add(key, pendingThumbs[index]));

    return photos;
  }

  private async persistAndReturn(
    userId: string,
    dto: AssistantChatDto,
    result: AssistantChatResult,
    skipUserMessage: boolean,
  ): Promise<AssistantChatResult> {
    const userMessage = skipUserMessage
      ? null
      : this.extractLastUserMessage(dto);

    const conversation = await this.conversationsService.appendMessages(
      userId,
      dto.conversationId,
      userMessage,
      {
        content: result.message,
        metadata: {
          relatedItems: result.relatedItems,
          placeCandidates: result.placeCandidates,
          companionAmbiguities: result.companionAmbiguities,
          pendingVisit: result.pendingVisit,
          suggestedReplies: result.suggestedReplies,
        },
      },
      userMessage?.content,
      dto.locale ?? 'en',
    );

    return {
      ...result,
      conversationId: conversation.id,
      title: conversation.title,
    };
  }

  private extractLastUserMessage(dto: AssistantChatDto) {
    for (let index = dto.messages.length - 1; index >= 0; index--) {
      const message = dto.messages[index];
      if (message.role === 'user' && message.content.trim()) {
        return {
          content: message.content.trim(),
          photoKeys: dto.photoKeys,
        };
      }
    }
    return null;
  }
}
