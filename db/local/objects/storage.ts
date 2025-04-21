import { Tables } from '@/supabase/types';
import { deleteAll, deleteItem, putItem } from '../core/indexedDB';
import { STORES } from '../schema/schema';
import { MessageWithFileItemsAndFeedback } from '../../messages';
import { chats as chatDb } from './chats';

const createStorage = async (
  chat: Tables<'chats'>,
  messages: MessageWithFileItemsAndFeedback[],
  chatFiles: Tables<'files'>[] | null,
) => {
  try {
    // Store chat
    await putItem(STORES.CHATS, chat);

    // Store messages and their related items
    for (const message of messages) {
      const { file_items = [], feedback = [], ...messageData } = message;

      // Store the message
      await putItem(STORES.MESSAGES, messageData);

      // Store file items and create message-file-item relationships
      for (const item of file_items) {
        await putItem(STORES.FILE_ITEMS, item);

        // Create the junction table entry
        await putItem(STORES.MESSAGE_FILE_ITEMS, {
          message_id: message.id,
          file_item_id: item.id,
          user_id: message.user_id,
          created_at: new Date().toISOString(),
          updated_at: null,
        });
      }

      // Store feedback
      for (const item of feedback) {
        await putItem(STORES.FEEDBACK, item);
      }
    }

    // Store files
    if (chatFiles) {
      for (const file of chatFiles) {
        await putItem(STORES.FILES, file);
      }
    }
  } catch (error) {
    console.error('Error creating storage:', error);
    throw error;
  }
};

const cleanStorage = async (userId: string, chatIds: string[]) => {
  const allChats = await chatDb.getByUserId(userId);
  const chatsToDelete = allChats.filter((chat) => !chatIds.includes(chat.id));
  for (const chat of chatsToDelete) {
    await chatDb.delete(chat.id);
  }
};

const clearAll = async () => {
  for (const store of Object.values(STORES)) {
    await deleteAll(store);
  }
};

export const storage = {
  create: createStorage,
  clean: cleanStorage,
  clearAll: clearAll,
};
