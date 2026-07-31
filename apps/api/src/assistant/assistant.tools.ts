export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_visited_places',
      description:
        'List places the user has visited, optionally filtered by city, country, or category. Use for questions like "restaurants I went to in Brussels" — never guess location from the place name.',
      parameters: {
        type: 'object',
        properties: {
          city: {
            type: 'string',
            description:
              'City or area to filter by, e.g. "Brussels", "Bruselas", "Madrid"',
          },
          country: {
            type: 'string',
            description: 'Country to filter by, e.g. "Belgium", "Spain"',
          },
          category: {
            type: 'string',
            enum: ['restaurant', 'cafe', 'bar', 'hotel', 'other'],
            description: 'Optional place category filter',
          },
          query: {
            type: 'string',
            description: 'Optional place name keyword',
          },
        },
      },
    },
  },
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
          city: {
            type: 'string',
            description: 'Optional city filter',
          },
          country: {
            type: 'string',
            description: 'Optional country filter',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'find_visits_by_date',
      description:
        'Find logged visits on a specific date or date range. Use for "what restaurant did I go to last Wednesday?", "where did I eat yesterday?", etc. Prefer this over get_last_visit for date-based recall.',
      parameters: {
        type: 'object',
        properties: {
          fromDate: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD',
          },
          toDate: {
            type: 'string',
            description: 'End date in YYYY-MM-DD (defaults to fromDate)',
          },
          relativeDate: {
            type: 'string',
            description:
              'Natural date phrase to resolve server-side, e.g. "yesterday", "last wednesday", "el miercoles pasado"',
          },
          category: {
            type: 'string',
            enum: ['restaurant', 'cafe', 'bar', 'hotel', 'other'],
            description: 'Optional place category filter',
          },
        },
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
            description:
              'When they went — ISO 8601 (YYYY-MM-DD) or a relative phrase like "today", "yesterday", "last Tuesday"',
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
          wouldReturn: {
            type: 'boolean',
            description:
              'Whether they would come back. Infer from feedback when clear (e.g. "never again" → false, "loved it" → true). Ask if unsure.',
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
            description:
              'When they went — ISO 8601 (YYYY-MM-DD) or a relative phrase like "today", "yesterday", "last Tuesday"',
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
          wouldReturn: {
            type: 'boolean',
            description:
              'Whether they would come back. Infer from feedback when clear (e.g. "never again" → false, "loved it" → true). Ask if unsure.',
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
        'Update an existing logged visit. Use when the user wants to change, fix, or correct a past visit (date, companions, notes, rating, wouldReturn). Do NOT use for logging a new visit.',
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
            description:
              'New visit date — ISO 8601 or relative phrase like "yesterday"',
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
          wouldReturn: {
            type: 'boolean',
            description: 'Whether they would come back',
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
        'Semantic and keyword search across logged visits. Finds matches in visit notes, companions, ratings, and AI-generated photo descriptions — even fuzzy or poorly worded queries. For city-based questions ("restaurants in Brussels"), prefer list_visited_places instead.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query about past visits',
          },
          city: {
            type: 'string',
            description:
              'Optional city filter — only return visits to places in this city',
          },
          country: {
            type: 'string',
            description: 'Optional country filter',
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
