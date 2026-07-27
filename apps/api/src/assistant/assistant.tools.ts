export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_places',
      description:
        'Search saved places by name or keyword. Supports partial names (e.g. "dish" for "Dishoom") and ignores filler words like "restaurant".',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Place name or search term' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_last_visit',
      description:
        'Find when the user last visited a specific place, who they went with, and any notes.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string' },
          placeId: { type: 'string' },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_google_places',
      description:
        'Search Google Maps when a place is not saved in Malviviendo yet. If exactly one match is returned, use it directly with ensure_place_from_google — do not ask the user to confirm.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Place name and optional location hint, e.g. "Dishoom Covent Garden London"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ensure_place_from_google',
      description:
        'Save a Google Maps place to Malviviendo without logging a visit. Use when you need the place on file to answer a question (last visit, history, etc.) or before get_last_visit when search_places found nothing.',
      parameters: {
        type: 'object',
        properties: {
          googlePlaceId: {
            type: 'string',
            description: 'Google place id from search_google_places',
          },
        },
        required: ['googlePlaceId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'create_place_and_log_visit',
      description:
        'Create a Google Maps place in Malviviendo AND log a new visit. Only when the user is reporting a new visit. Requires visitedAt, overallRating, and companions (use [] if alone). Ask the user for anything missing before calling.',
      parameters: {
        type: 'object',
        properties: {
          googlePlaceId: {
            type: 'string',
            description: 'Google place id (ChIJ...) from a confirmed candidate',
          },
          visitedAt: {
            type: 'string',
            description: 'ISO 8601 date — only if the user stated when they went',
          },
          companions: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Who they went with. Required — use [] if they went alone',
          },
          notes: { type: 'string' },
          overallRating: {
            type: 'number',
            description: 'Overall score 0-10 — only if the user gave a rating',
          },
        },
        required: ['googlePlaceId', 'visitedAt', 'overallRating', 'companions'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'log_visit',
      description:
        'Log a visit to a saved place. Requires visitedAt, overallRating, and companions (use [] if alone). Ask the user for anything missing before calling.',
      parameters: {
        type: 'object',
        properties: {
          placeName: { type: 'string' },
          placeId: { type: 'string' },
          visitedAt: {
            type: 'string',
            description: 'ISO 8601 date — only if the user stated when they went',
          },
          companions: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Who they went with. Required — use [] if they went alone',
          },
          notes: { type: 'string' },
          overallRating: {
            type: 'number',
            description: 'Overall score 0-10 — only if the user gave a rating',
          },
        },
        required: ['visitedAt', 'overallRating', 'companions'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'update_visit',
      description:
        'Update an existing logged visit. Use when the user wants to change, fix, or correct a past visit (date, companions, notes, rating). Do NOT use for logging a new visit.',
      parameters: {
        type: 'object',
        properties: {
          experienceId: {
            type: 'string',
            description: 'Visit id from search_visits or get_last_visit',
          },
          placeName: { type: 'string' },
          placeId: { type: 'string' },
          visitedAt: {
            type: 'string',
            description:
              'The visit date as currently logged, used to identify which visit when experienceId is unknown',
          },
          newVisitedAt: {
            type: 'string',
            description: 'New ISO 8601 date if the user wants to change the visit date',
          },
          companions: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replacement list of companions (replaces existing)',
          },
          notes: { type: 'string' },
          overallRating: {
            type: 'number',
            description: 'Overall score 0-10',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_visits',
      description:
        'Semantic and keyword search across logged visits. Finds matches in visit notes, companions, ratings, and AI-generated photo descriptions — even fuzzy or poorly worded queries.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query about past visits',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_people',
      description: 'Search people in the user address book by name.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
];
