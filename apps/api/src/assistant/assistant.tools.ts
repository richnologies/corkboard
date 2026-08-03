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
        'Search saved places by name or keyword. Supports partial names (e.g. "dish" for "Dishoom") and ignores filler words like "restaurant". Does not return wines — use search_wines for bottles.',
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
        'Find logged visits on a specific date or date range. Use for "what restaurant did I go to last Wednesday?", "where did I eat yesterday?", "what wine did we have last Wednesday?", etc. Prefer this over get_last_visit for date-based recall. Results include linked wines when present.',
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
        'Find when the user last visited a specific place, who they went with, notes, and any linked wines.',
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
            description: 'Overall score 1-5 stars — only if the user gave a rating',
          },
          wouldReturn: {
            type: 'boolean',
            description:
              'Whether they would come back. Infer from feedback when clear (e.g. "never again" → false, "loved it" → true). Ask if unsure.',
          },
          wineItemIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional saved wine Item ids to link to this visit',
          },
          wineNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional wine names tasted on this visit — will be searched/ensured then linked',
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
        'Log a visit to a saved place. Requires visitedAt, overallRating, and companions (use [] if alone). Ask the user for anything missing before calling. Can optionally link wines tasted on the visit.',
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
            description: 'Overall score 1-5 stars — only if the user gave a rating',
          },
          wouldReturn: {
            type: 'boolean',
            description:
              'Whether they would come back. Infer from feedback when clear (e.g. "never again" → false, "loved it" → true). Ask if unsure.',
          },
          wineItemIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional saved wine Item ids to link to this visit',
          },
          wineNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Optional wine names tasted on this visit — will be searched/ensured then linked',
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
        'Update an existing logged visit. Use when the user wants to change, fix, or correct a past visit (date, companions, notes, rating, wouldReturn, wines). Do NOT use for logging a new visit.',
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
              'The visit date as currently logged (or relative phrase like "ayer"/"yesterday"), used to identify which visit when experienceId is unknown. The server resolves relative phrases — do not ask the user to convert to an exact date.',
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
            description: 'Overall score 1-5 stars',
          },
          wouldReturn: {
            type: 'boolean',
            description: 'Whether they would come back',
          },
          wineItemIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Replacement list of linked wine Item ids',
          },
          wineNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Wine names to resolve and set as the linked wines for this visit',
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
        'Semantic and keyword search across logged visits. Finds matches in visit notes, companions, ratings, linked wines, and AI-generated photo descriptions — even fuzzy or poorly worded queries. For city-based questions ("restaurants in Brussels"), prefer list_visited_places instead. For "what wine did I drink at X / on date Y", use this or find_visits_by_date and read the wines field.',
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
  {
    type: 'function' as const,
    function: {
      name: 'identify_wine_from_photo',
      description:
        'Read a bottle/label photo the user attached and search for matching wines. REQUIRED whenever the user sends a wine bottle photo or asks to find/identify "this wine" / "ese vino" from an image. Do NOT use search_wines with vague phrases like "ese vino", "this wine", or "vino" when a photo is available.',
      parameters: {
        type: 'object',
        properties: {
          photoKey: {
            type: 'string',
            description:
              'S3 photo key from the attached photos list. Omit to use the latest attached photo.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'search_wines',
      description:
        'Search the user\'s wine library and Vivino catalog by text name. Use when the user types a wine/winery name. Do NOT use this for bottle photos — use identify_wine_from_photo instead.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Wine name, winery, grape, or region, e.g. "Opus One 2018" or "Laxas Albariño"',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_wine_details',
      description:
        'Get detailed wine info (region, winery, grapes, Vivino rating 1–5, year, style, description). Use after search_wines to answer "where is it from?", "is it good?", etc.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Saved wine Item id from search_wines (source local)',
          },
          wineId: {
            type: 'string',
            description: 'Vivino wine id from search_wines',
          },
          vintageId: {
            type: 'string',
            description: 'Vivino vintage id from search_wines (preferred when available)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_saved_wines',
      description:
        'Search wines already saved in the user\'s Malviviendo library, including provenance (who gifted/recommended them and source notes). Use for "what wine did X give me?", "wines from Pere", gifts, recommendations, or listing the cellar. Prefer this over search_visits when the question is about who gave/recommended a bottle rather than who was at a meal.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description:
              'Filter by wine name, winery, region, or text in provenance notes (e.g. "regalo", "Pere")',
          },
          referrerName: {
            type: 'string',
            description:
              'Person who gifted or recommended the wine (matches source.referrerName and also scans provenance notes)',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'ensure_wine',
      description:
        'Save a wine to the user\'s library. ONLY call this after the user explicitly asks to save/add the wine, or confirms when you offered to save it. Prefer Vivino ids from search_wines when available. Can also create a simple named wine when Vivino has no match.',
      parameters: {
        type: 'object',
        properties: {
          itemId: {
            type: 'string',
            description: 'Existing local wine Item id — use as-is',
          },
          wineId: { type: 'string', description: 'Vivino wine id' },
          vintageId: { type: 'string', description: 'Vivino vintage id' },
          name: {
            type: 'string',
            description:
              'Wine display name — required when creating without Vivino ids',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'link_wines_to_visit',
      description:
        'Attach one or more saved wines to an existing visit/experience. Resolve the visit with experienceId or place + date. Resolve wines with wineItemIds (from ensure_wine) or wineNames (will search/ensure).',
      parameters: {
        type: 'object',
        properties: {
          experienceId: {
            type: 'string',
            description: 'Visit id from find_visits_by_date, search_visits, or get_last_visit',
          },
          placeName: { type: 'string' },
          placeId: { type: 'string' },
          visitedAt: {
            type: 'string',
            description:
              'Visit date to identify the visit when experienceId is unknown. Accepts ISO (YYYY-MM-DD) or relative phrases like "ayer", "yesterday", "hoy", "today". The server resolves them — do not ask the user to convert to an exact date.',
          },
          wineItemIds: {
            type: 'array',
            items: { type: 'string' },
            description: 'Saved wine Item ids to link',
          },
          wineNames: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Wine names to resolve via search/ensure, then link',
          },
          replace: {
            type: 'boolean',
            description:
              'If true, replace existing linked wines. Default false (merge/add).',
          },
        },
      },
    },
  },
];
