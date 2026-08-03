import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAiService {
  private readonly apiKey: string | undefined;
  private readonly chatModel: string;
  private readonly enrichModel: string;
  private readonly embeddingModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('app.openai.apiKey');
    this.chatModel = config.get<string>('app.openai.model') ?? 'gpt-5.6-luna';
    this.enrichModel =
      config.get<string>('app.openai.enrichModel') ?? 'gpt-5.6-luna';
    this.embeddingModel =
      config.get<string>('app.openai.embeddingModel') ??
      'text-embedding-3-small';
  }

  assertConfigured() {
    if (!this.apiKey) {
      throw new ServiceUnavailableException(
        'OpenAI is not configured. Set OPENAI_API_KEY in your environment.',
      );
    }
  }

  async embed(text: string): Promise<number[]> {
    this.assertConfigured();
    const input = text.trim();
    if (!input) return [];

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.embeddingModel,
        input,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Embedding request failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      data: { embedding: number[] }[];
    };
    return data.data[0]?.embedding ?? [];
  }

  async describeVisitPhoto(imageUrl: string): Promise<string> {
    this.assertConfigured();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.chatModel,
        max_completion_tokens: 160,
        temperature: 0.2,
        reasoning_effort: 'none',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'Describe this visit photo in 1-2 concise sentences for a personal food & places journal search index. ' +
                  'Mention food, drinks, venue details, atmosphere, or people if visible. No preamble.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Vision request failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message?: { content?: string } }[];
    };
    return data.choices[0]?.message?.content?.trim() ?? '';
  }

  /**
   * Read a wine bottle / label photo into structured fields for catalog search.
   */
  async readWineBottleLabel(imageUrl: string): Promise<{
    name?: string;
    winery?: string;
    year?: string;
    region?: string;
    grapes?: string[];
    alcoholPercentage?: number;
    searchQuery: string;
  }> {
    this.assertConfigured();

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.chatModel,
        max_completion_tokens: 300,
        temperature: 0,
        reasoning_effort: 'none',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You extract wine label information from photos. Reply with JSON only. ' +
              'Keys: name (wine name without winery if possible), winery, year (vintage year as string or null), ' +
              'region, grapes (string array), alcoholPercentage (number or null), ' +
              'searchQuery (best short Vivino-style search string: winery + wine name + year when clear). ' +
              'Omit unknown fields or use null. If the image is not a wine bottle/label, still return searchQuery as empty string.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract wine label details from this photo.',
              },
              {
                type: 'image_url',
                image_url: { url: imageUrl },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Vision request failed (${response.status}): ${detail.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message?: { content?: string } }[];
    };
    const raw = data.choices[0]?.message?.content?.trim() ?? '{}';
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = {};
    }

    const grapes = Array.isArray(parsed['grapes'])
      ? parsed['grapes']
          .map((g) => (typeof g === 'string' ? g.trim() : ''))
          .filter(Boolean)
      : undefined;

    const name = typeof parsed['name'] === 'string' ? parsed['name'].trim() : undefined;
    const winery =
      typeof parsed['winery'] === 'string' ? parsed['winery'].trim() : undefined;
    const year =
      typeof parsed['year'] === 'string'
        ? parsed['year'].trim()
        : typeof parsed['year'] === 'number'
          ? String(parsed['year'])
          : undefined;
    const region =
      typeof parsed['region'] === 'string' ? parsed['region'].trim() : undefined;
    const alcohol =
      typeof parsed['alcoholPercentage'] === 'number'
        ? parsed['alcoholPercentage']
        : undefined;

    let searchQuery =
      typeof parsed['searchQuery'] === 'string'
        ? parsed['searchQuery'].trim()
        : '';
    if (!searchQuery) {
      searchQuery = [winery, name, year].filter(Boolean).join(' ').trim();
    }

    return {
      name: name || undefined,
      winery: winery || undefined,
      year: year || undefined,
      region: region || undefined,
      grapes: grapes?.length ? grapes : undefined,
      alcoholPercentage: alcohol,
      searchQuery,
    };
  }

  async generateConversationTitle(
    text: string,
    locale: 'en' | 'es',
  ): Promise<string> {
    this.assertConfigured();
    const input = text.trim().slice(0, 500);
    if (!input) return '';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.chatModel,
        temperature: 0.3,
        max_completion_tokens: 24,
        reasoning_effort: 'none',
        messages: [
          {
            role: 'system',
            content:
              locale === 'es'
                ? 'Genera un título corto (máximo 6 palabras) para esta conversación. Responde solo con el título, sin comillas ni puntuación final.'
                : 'Generate a short title (max 6 words) for this chat conversation. Reply with only the title, no quotes or trailing punctuation.',
          },
          { role: 'user', content: input },
        ],
      }),
    });

    if (!response.ok) return '';

    const data = (await response.json()) as {
      choices: { message?: { content?: string } }[];
    };
    return data.choices[0]?.message?.content?.trim().replace(/^["']|["']$/g, '') ?? '';
  }

  /**
   * Enrich wine metadata via Responses API + web_search, grounded on Vivino seed fields.
   * Returns partial WineDetails plus optional external image candidate URLs.
   * Text fields are returned in both English and Spanish.
   */
  async enrichWineFromWeb(seed: {
    name: string;
    winery?: string;
    year?: string;
    region?: string;
    country?: string;
    style?: string;
    grapes?: string[];
    vivinoUrl?: string;
    vivinoWineId?: string;
    vivinoVintageId?: string;
  }): Promise<{
    wine: Partial<{
      winery: string;
      grapes: string[];
      grapesEn: string[];
      grapesEs: string[];
      region: string;
      regionEn: string;
      regionEs: string;
      country: string;
      countryEn: string;
      countryEs: string;
      style: string;
      styleEn: string;
      styleEs: string;
      alcoholPercentage: number;
      allergens: string[];
      allergensEn: string[];
      allergensEs: string[];
      description: string;
      descriptionEn: string;
      descriptionEs: string;
      price: number;
      priceCurrency: string;
      rating: number;
      year: string;
    }>;
    imageCandidates: string[];
  }> {
    this.assertConfigured();

    const seedLines = [
      `Name: ${seed.name}`,
      seed.winery ? `Winery: ${seed.winery}` : null,
      seed.year ? `Vintage year: ${seed.year}` : null,
      seed.region ? `Region: ${seed.region}` : null,
      seed.country ? `Country: ${seed.country}` : null,
      seed.style ? `Style: ${seed.style}` : null,
      seed.grapes?.length ? `Grapes: ${seed.grapes.join(', ')}` : null,
      seed.vivinoUrl ? `Vivino URL: ${seed.vivinoUrl}` : null,
      seed.vivinoWineId ? `Vivino wine id: ${seed.vivinoWineId}` : null,
      seed.vivinoVintageId
        ? `Vivino vintage id: ${seed.vivinoVintageId}`
        : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt =
      'You are enriching a wine catalog record. Use web search to find current, accurate details for THIS specific wine/vintage.\n' +
      'Prefer official winery pages, Vivino, Wine-Searcher, and reputable merchants.\n' +
      'Return ONLY a JSON object (no markdown) with keys:\n' +
      '- winery (string|null; proper noun, keep original language)\n' +
      '- grapesEn (string array of grape variety names in English|null)\n' +
      '- grapesEs (same grapes in Spanish|null)\n' +
      '- regionEn (wine region in English|null)\n' +
      '- regionEs (same region in Spanish|null)\n' +
      '- countryEn (country in English|null)\n' +
      '- countryEs (same country in Spanish|null)\n' +
      '- styleEn (wine style in English, e.g. "Red wine"|null)\n' +
      '- styleEs (same style in Spanish|null)\n' +
      '- alcoholPercentage (number|null)\n' +
      '- allergensEn (string array in English|null)\n' +
      '- allergensEs (same allergens in Spanish|null)\n' +
      '- descriptionEn (1-3 sentence tasting/overview in English|null)\n' +
      '- descriptionEs (same overview translated into natural Spanish|null)\n' +
      '- price (typical retail number|null)\n' +
      '- priceCurrency (ISO code like EUR/USD|null)\n' +
      '- rating (1-5 community/critic style if available|null)\n' +
      '- year (vintage year string|null)\n' +
      '- imageUrls (array of direct https image URLs of THIS bottle/label, prefer clear label shots, max 3)\n' +
      'Always provide BOTH English and Spanish for every text field you can fill. Do not invent prices or ratings — use null when unsure. Match the vintage year when provided.\n\n' +
      `Seed data:\n${seedLines}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.enrichModel,
        tools: [{ type: 'web_search' }],
        temperature: 0.2,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Wine enrichment failed (${response.status}): ${detail.slice(0, 240)}`,
      );
    }

    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };

    let raw = data.output_text?.trim() ?? '';
    if (!raw && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            raw = part.text.trim();
            break;
          }
          if (part.type === 'text' && part.text) {
            raw = part.text.trim();
            break;
          }
        }
        if (raw) break;
      }
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as Record<string, unknown>)
      : {};

    const asString = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;
    const asNumber = (value: unknown) =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;
    const asStringArray = (value: unknown) =>
      Array.isArray(value)
        ? value
            .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
            .filter(Boolean)
        : undefined;

    const imageCandidates = (asStringArray(parsed['imageUrls']) ?? []).filter(
      (url) => url.startsWith('http://') || url.startsWith('https://'),
    );

    const grapesEn = asStringArray(parsed['grapesEn']) ?? asStringArray(parsed['grapes']);
    const grapesEs = asStringArray(parsed['grapesEs']);
    const regionEn = asString(parsed['regionEn']) ?? asString(parsed['region']);
    const regionEs = asString(parsed['regionEs']);
    const countryEn = asString(parsed['countryEn']) ?? asString(parsed['country']);
    const countryEs = asString(parsed['countryEs']);
    const styleEn = asString(parsed['styleEn']) ?? asString(parsed['style']);
    const styleEs = asString(parsed['styleEs']);
    const allergensEn =
      asStringArray(parsed['allergensEn']) ?? asStringArray(parsed['allergens']);
    const allergensEs = asStringArray(parsed['allergensEs']);
    const descriptionEn =
      asString(parsed['descriptionEn']) || asString(parsed['description']);
    const descriptionEs = asString(parsed['descriptionEs']);

    return {
      wine: {
        winery: asString(parsed['winery']),
        grapes: grapesEn,
        grapesEn,
        grapesEs,
        region: regionEn,
        regionEn,
        regionEs,
        country: countryEn,
        countryEn,
        countryEs,
        style: styleEn,
        styleEn,
        styleEs,
        alcoholPercentage: asNumber(parsed['alcoholPercentage']),
        allergens: allergensEn,
        allergensEn,
        allergensEs,
        descriptionEn,
        descriptionEs,
        description: descriptionEn,
        price: asNumber(parsed['price']),
        priceCurrency: asString(parsed['priceCurrency'])?.toUpperCase(),
        rating: asNumber(parsed['rating']),
        year: asString(parsed['year']),
      },
      imageCandidates,
    };
  }

  /**
   * Localize place name/address fields into English and Spanish.
   */
  async enrichPlaceFromWeb(seed: {
    name: string;
    address?: string;
    city?: string;
    region?: string;
    country?: string;
  }): Promise<{
    nameEn?: string;
    nameEs?: string;
    addressEn?: string;
    addressEs?: string;
    cityEn?: string;
    cityEs?: string;
    regionEn?: string;
    regionEs?: string;
    countryEn?: string;
    countryEs?: string;
  }> {
    this.assertConfigured();

    const seedLines = [
      `Name: ${seed.name}`,
      seed.address ? `Address: ${seed.address}` : null,
      seed.city ? `City: ${seed.city}` : null,
      seed.region ? `Region: ${seed.region}` : null,
      seed.country ? `Country: ${seed.country}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const prompt =
      'You are localizing a place/restaurant record for a bilingual (English/Spanish) travel app.\n' +
      'Use web search only if needed to confirm official names or translations.\n' +
      'Return ONLY a JSON object (no markdown) with keys:\n' +
      '- nameEn (place name in English; keep proper nouns when they are not translated|null)\n' +
      '- nameEs (place name in Spanish; keep proper nouns when they are not translated|null)\n' +
      '- addressEn (street address in English|null)\n' +
      '- addressEs (same address in Spanish|null)\n' +
      '- cityEn (city in English|null)\n' +
      '- cityEs (city in Spanish|null)\n' +
      '- regionEn (region/state in English|null)\n' +
      '- regionEs (region/state in Spanish|null)\n' +
      '- countryEn (country in English|null)\n' +
      '- countryEs (country in Spanish|null)\n' +
      'Always fill BOTH languages when the seed has a value. Do not invent a different place.\n\n' +
      `Seed data:\n${seedLines}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.enrichModel,
        tools: [{ type: 'web_search' }],
        temperature: 0.1,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Place enrichment failed (${response.status}): ${detail.slice(0, 240)}`,
      );
    }

    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };

    let raw = data.output_text?.trim() ?? '';
    if (!raw && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            raw = part.text.trim();
            break;
          }
          if (part.type === 'text' && part.text) {
            raw = part.text.trim();
            break;
          }
        }
        if (raw) break;
      }
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as Record<string, unknown>)
      : {};

    const asString = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;

    return {
      nameEn: asString(parsed['nameEn']),
      nameEs: asString(parsed['nameEs']),
      addressEn: asString(parsed['addressEn']),
      addressEs: asString(parsed['addressEs']),
      cityEn: asString(parsed['cityEn']),
      cityEs: asString(parsed['cityEs']),
      regionEn: asString(parsed['regionEn']),
      regionEs: asString(parsed['regionEs']),
      countryEn: asString(parsed['countryEn']),
      countryEs: asString(parsed['countryEs']),
    };
  }

  /**
   * Distill Google review texts into short bilingual tips for a place.
   */
  async summarizePlaceReviews(seed: {
    name: string;
    reviews: string[];
  }): Promise<{ tipsEn?: string; tipsEs?: string }> {
    this.assertConfigured();

    const reviewBlock = seed.reviews
      .map((text, index) => `${index + 1}. ${text}`)
      .join('\n\n');

    const prompt =
      'You summarize Google Maps reviews for a travel/dining app.\n' +
      'From the reviews, extract practical tips: recommended dishes or drinks to order, what to ask for, booking/timing notes, and caveats.\n' +
      'Write concise tips (2–4 short sentences or a short bullet-style paragraph). Do not invent facts not supported by the reviews.\n' +
      'If reviews lack actionable tips, return null for both tips.\n' +
      'Return ONLY a JSON object (no markdown) with keys:\n' +
      '- tipsEn (English tips|null)\n' +
      '- tipsEs (Spanish tips|null)\n\n' +
      `Place: ${seed.name}\n\nReviews:\n${reviewBlock}`;

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.enrichModel,
        temperature: 0.2,
        input: prompt,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new ServiceUnavailableException(
        `Place tips summarization failed (${response.status}): ${detail.slice(0, 240)}`,
      );
    }

    const data = (await response.json()) as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
    };

    let raw = data.output_text?.trim() ?? '';
    if (!raw && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type !== 'message' || !Array.isArray(item.content)) continue;
        for (const part of item.content) {
          if (part.type === 'output_text' && part.text) {
            raw = part.text.trim();
            break;
          }
          if (part.type === 'text' && part.text) {
            raw = part.text.trim();
            break;
          }
        }
        if (raw) break;
      }
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch
      ? (JSON.parse(jsonMatch[0]) as Record<string, unknown>)
      : {};

    const asString = (value: unknown) =>
      typeof value === 'string' && value.trim() ? value.trim() : undefined;

    return {
      tipsEn: asString(parsed['tipsEn']),
      tipsEs: asString(parsed['tipsEs']),
    };
  }
}
