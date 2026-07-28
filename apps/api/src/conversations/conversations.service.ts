import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConversationMessage } from '@org/domain';
import { Model, Types } from 'mongoose';
import { OpenAiService } from '../openai/openai.service.js';
import { Conversation, ConversationDocument } from './conversation.schema.js';
import { mapConversation, mapConversationSummary } from './conversations.mapper.js';

export interface PersistAssistantMessageInput {
  content: string;
  metadata?: ConversationMessage['metadata'];
}

export interface PersistUserMessageInput {
  content: string;
  photoKeys?: string[];
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    private readonly openAi: OpenAiService,
  ) {}

  async listForUser(userId: string) {
    const conversations = await this.conversationModel
      .find({ ownerId: new Types.ObjectId(userId) })
      .sort({ updatedAt: -1 })
      .exec();
    return conversations.map(mapConversationSummary);
  }

  async findById(userId: string, conversationId: string) {
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation || String(conversation.ownerId) !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    return mapConversation(conversation);
  }

  async remove(userId: string, conversationId: string) {
    const conversation = await this.conversationModel.findById(conversationId).exec();
    if (!conversation || String(conversation.ownerId) !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    await this.conversationModel.findByIdAndDelete(conversationId).exec();
  }

  async create(userId: string, title: string) {
    const conversation = await this.conversationModel.create({
      ownerId: new Types.ObjectId(userId),
      title,
      messages: [],
    });
    return mapConversation(conversation);
  }

  async appendMessages(
    userId: string,
    conversationId: string | undefined,
    userMessage: PersistUserMessageInput | null,
    assistantMessage: PersistAssistantMessageInput,
    titleSeed?: string,
    locale: 'en' | 'es' = 'en',
  ) {
    let conversation: ConversationDocument;
    if (conversationId) {
      const existing = await this.conversationModel.findById(conversationId).exec();
      if (!existing || String(existing.ownerId) !== userId) {
        throw new NotFoundException('Conversation not found');
      }
      conversation = existing;
    } else {
      conversation = await this.conversationModel.create({
        ownerId: new Types.ObjectId(userId),
        title: this.defaultTitle(titleSeed, locale),
        messages: [],
      });
    }

    const now = new Date();
    if (userMessage) {
      conversation.messages.push({
        id: new Types.ObjectId().toString(),
        role: 'user',
        content: userMessage.content,
        photoKeys: userMessage.photoKeys ?? [],
        createdAt: now,
      });
    }

    conversation.messages.push({
      id: new Types.ObjectId().toString(),
      role: 'assistant',
      content: assistantMessage.content,
      photoKeys: [],
      metadata: assistantMessage.metadata as Record<string, unknown> | undefined,
      createdAt: new Date(),
    });

    await conversation.save();

    if (titleSeed && conversation.messages.filter((m) => m.role === 'user').length === 1) {
      void this.refineTitle(userId, conversation.id, titleSeed, locale);
    }

    return mapConversation(conversation);
  }

  private defaultTitle(seed?: string, locale: 'en' | 'es' = 'en') {
    const cleaned = seed?.trim().replace(/\s+/g, ' ') ?? '';
    if (!cleaned) {
      return locale === 'es' ? 'Nueva conversación' : 'New chat';
    }
    if (cleaned.length <= 48) return cleaned;
    return `${cleaned.slice(0, 45)}…`;
  }

  private async refineTitle(
    userId: string,
    conversationId: string,
    seed: string,
    locale: 'en' | 'es',
  ) {
    try {
      const title = await this.openAi.generateConversationTitle(seed, locale);
      if (!title) return;
      const conversation = await this.conversationModel.findById(conversationId).exec();
      if (!conversation || String(conversation.ownerId) !== userId) return;
      conversation.title = title;
      await conversation.save();
    } catch {
      // Keep the default truncated title.
    }
  }
}
