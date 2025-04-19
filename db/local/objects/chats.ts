import { Tables } from '@/supabase/types';
import {
  deleteItem,
  getItem,
  getItemsByIndex,
  putItem,
} from '../core/indexedDB';
import { STORES } from '../schema/schema';
import { messages as messageDb } from './messages';

const getStoredChatById = async (
  chatId: string,
): Promise<Tables<'chats'> | undefined> => {
  return await getItem<Tables<'chats'>>(STORES.CHATS, chatId);
};

const updateStoredChat = async (chat: Tables<'chats'>): Promise<void> => {
  await putItem(STORES.CHATS, chat);
};

const deleteStoredChat = async (chatId: string): Promise<void> => {
  try {
    // Delete all messages associated with this chat
    const messages = await getItemsByIndex<Tables<'messages'>>(
      STORES.MESSAGES,
      'chat_id',
      chatId,
    );

    // Delete each message and its related items
    for (const message of messages) {
      await messageDb.delete(message.id);
    }

    // Delete any files associated with this chat
    const files = await getItemsByIndex<Tables<'files'>>(
      STORES.FILES,
      'chat_id',
      chatId,
    );

    for (const file of files) {
      await deleteItem(STORES.FILES, file.id);
    }

    // Finally delete the chat itself
    await deleteItem(STORES.CHATS, chatId);
  } catch (error) {
    console.error('Error deleting chat:', error);
    throw error;
  }
};

const deleteAllStoredChats = async (userId: string): Promise<void> => {
  try {
    // Get all chats for this user
    const chats = await getStoredChatsByUserId(userId);

    // Delete each chat
    for (const chat of chats) {
      await deleteStoredChat(chat.id);
    }
  } catch (error) {
    console.error('Error deleting all chats:', error);
    throw error;
  }
};

const getStoredChatsByUserId = async (
  userId: string,
): Promise<Tables<'chats'>[]> => {
  try {
    const chats = await getItemsByIndex<Tables<'chats'>>(
      STORES.CHATS,
      'user_id',
      userId,
    );

    // Ensure uniqueness by chat ID
    const uniqueChats = Array.from(
      new Map(chats.map((chat) => [chat.id, chat])).values(),
    );

    // Sort by updated_at (most recent first)
    uniqueChats.sort((a, b) => {
      const dateA = a.updated_at
        ? new Date(a.updated_at).getTime()
        : new Date(a.created_at).getTime();
      const dateB = b.updated_at
        ? new Date(b.updated_at).getTime()
        : new Date(b.created_at).getTime();
      return dateB - dateA;
    });

    return uniqueChats;
  } catch (error) {
    console.error('Error getting chats by user ID:', error);
    throw error;
  }
};

const updateStoredChats = async (chats: Tables<'chats'>[]): Promise<void> => {
  for (const chat of chats) {
    await updateStoredChat(chat);
  }
};

export const chats = {
  getById: getStoredChatById,
  getByUserId: getStoredChatsByUserId,
  update: updateStoredChat,
  updateMany: updateStoredChats,
  delete: deleteStoredChat,
  deleteAll: deleteAllStoredChats,
};
