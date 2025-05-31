import type { LLMID } from '@/types';
import { api } from '@/convex/_generated/api';
import { ConvexHttpClient } from 'convex/browser';

if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL environment variable is not defined. Please check your environment configuration.',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export async function createChat({
  chatId,
  userId,
  model,
  title,
  content,
  finishReason,
}: {
  chatId: string;
  userId: string;
  model: LLMID;
  content: string;
  finishReason: string;
  title?: string;
}) {
  try {
    const chatData = {
      id: chatId,
      user_id: userId,
      model,
      name: title || content.substring(0, 100),
      finish_reason: finishReason,
      sharing: 'private' as const,
      updated_at: Date.now(),
    };

    const { success, error } = await convex.mutation(api.chats.createChat, {
      chat: chatData,
    });

    if (!success) {
      console.error('Error creating chat:', error);
      return;
    }
  } catch (error) {
    console.error('Error creating chat:', error);
  }
}

export async function updateChat({
  chatId,
  model,
  finishReason,
  newChat,
  title,
}: {
  chatId: string;
  model: LLMID;
  finishReason: string;
  newChat: boolean;
  title?: string;
}) {
  try {
    const updateData = {
      ...(newChat && title ? { name: title } : {}),
      updated_at: Date.now(),
      finish_reason: finishReason,
      model,
    };

    const { success, error } = await convex.mutation(api.chats.updateChat, {
      chatId,
      updates: updateData,
    });

    if (!success) {
      console.error('Error updating chat:', error);
      return;
    }
  } catch (error) {
    console.error('Error updating chat:', error);
  }
}
