import { Conversation, ConversationMessage, ConversationSummary } from '@org/domain';
import { ConversationDocument } from './conversation.schema.js';

export function mapConversationSummary(doc: ConversationDocument): ConversationSummary {
  return {
    id: doc.id,
    title: doc.title,
    messageCount: doc.messages?.length ?? 0,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export function mapConversation(doc: ConversationDocument): Conversation {
  return {
    ...mapConversationSummary(doc),
    messages: (doc.messages ?? []).map((message) => mapConversationMessage(message)),
  };
}

function mapConversationMessage(message: ConversationDocument['messages'][number]): ConversationMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    photoKeys: message.photoKeys?.length ? message.photoKeys : undefined,
    metadata: message.metadata as ConversationMessage['metadata'],
    createdAt: message.createdAt.toISOString(),
  };
}
