import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OpenAiService {
  private readonly apiKey: string | undefined;
  private readonly chatModel: string;
  private readonly embeddingModel: string;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('app.openai.apiKey');
    this.chatModel = config.get<string>('app.openai.model') ?? 'gpt-4o-mini';
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
        max_tokens: 160,
        temperature: 0.2,
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
}
