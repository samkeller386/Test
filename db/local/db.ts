import { Tables } from '@/supabase/types';
import { MessageWithFileItemsAndFeedback } from '../messages';

// IndexedDB setup
const DB_NAME = 'pentest_gpt_db';
const DB_VERSION = 4;
const STORES = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  FILE_ITEMS: 'fileItems',
  FEEDBACK: 'feedback',
  FILES: 'files',
  MESSAGE_FILE_ITEMS: 'messageFileItems',
};

// Initialize database
const initDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      reject('IndexedDB error: ' + (event.target as IDBOpenDBRequest).error);
    };

    request.onsuccess = (event) => {
      resolve((event.target as IDBOpenDBRequest).result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const transaction = request.transaction as IDBTransaction;

      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(STORES.CHATS)) {
        const chatsStore = db.createObjectStore(STORES.CHATS, {
          keyPath: 'id',
        });
        chatsStore.createIndex('user_id', 'user_id', { unique: false });
      } else if (transaction) {
        const chatsStore = transaction.objectStore(STORES.CHATS);
        if (!chatsStore.indexNames.contains('user_id')) {
          chatsStore.createIndex('user_id', 'user_id', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
        const messagesStore = db.createObjectStore(STORES.MESSAGES, {
          keyPath: 'id',
        });
        messagesStore.createIndex('chat_id', 'chat_id', { unique: false });
      } else if (transaction) {
        const messagesStore = transaction.objectStore(STORES.MESSAGES);
        if (!messagesStore.indexNames.contains('chat_id')) {
          messagesStore.createIndex('chat_id', 'chat_id', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.FILE_ITEMS)) {
        const fileItemsStore = db.createObjectStore(STORES.FILE_ITEMS, {
          keyPath: 'id',
        });
        fileItemsStore.createIndex('file_id', 'file_id', { unique: false });
      } else if (transaction) {
        const fileItemsStore = transaction.objectStore(STORES.FILE_ITEMS);
        if (!fileItemsStore.indexNames.contains('file_id')) {
          fileItemsStore.createIndex('file_id', 'file_id', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.FEEDBACK)) {
        const feedbackStore = db.createObjectStore(STORES.FEEDBACK, {
          keyPath: 'id',
        });
        feedbackStore.createIndex('message_id', 'message_id', {
          unique: false,
        });
        feedbackStore.createIndex('chat_id', 'chat_id', { unique: false });
      } else if (transaction) {
        const feedbackStore = transaction.objectStore(STORES.FEEDBACK);
        if (!feedbackStore.indexNames.contains('message_id')) {
          feedbackStore.createIndex('message_id', 'message_id', {
            unique: false,
          });
        }
        if (!feedbackStore.indexNames.contains('chat_id')) {
          feedbackStore.createIndex('chat_id', 'chat_id', { unique: false });
        }
      }

      if (!db.objectStoreNames.contains(STORES.FILES)) {
        const filesStore = db.createObjectStore(STORES.FILES, {
          keyPath: 'id',
        });
        filesStore.createIndex('chat_id', 'chat_id', { unique: false });
        filesStore.createIndex('message_id', 'message_id', { unique: false });
        filesStore.createIndex('id', 'id', { unique: true });
      } else if (transaction) {
        const filesStore = transaction.objectStore(STORES.FILES);
        if (!filesStore.indexNames.contains('chat_id')) {
          filesStore.createIndex('chat_id', 'chat_id', { unique: false });
        }
        if (!filesStore.indexNames.contains('message_id')) {
          filesStore.createIndex('message_id', 'message_id', { unique: false });
        }
        if (!filesStore.indexNames.contains('id')) {
          filesStore.createIndex('id', 'id', { unique: true });
        }
      }

      if (!db.objectStoreNames.contains(STORES.MESSAGE_FILE_ITEMS)) {
        const messageFileItemsStore = db.createObjectStore(
          STORES.MESSAGE_FILE_ITEMS,
          { keyPath: ['message_id', 'file_item_id'] },
        );
        messageFileItemsStore.createIndex('message_id', 'message_id', {
          unique: false,
        });
        messageFileItemsStore.createIndex('file_item_id', 'file_item_id', {
          unique: false,
        });
      } else if (transaction) {
        const messageFileItemsStore = transaction.objectStore(
          STORES.MESSAGE_FILE_ITEMS,
        );
        if (!messageFileItemsStore.indexNames.contains('message_id')) {
          messageFileItemsStore.createIndex('message_id', 'message_id', {
            unique: false,
          });
        }
        if (!messageFileItemsStore.indexNames.contains('file_item_id')) {
          messageFileItemsStore.createIndex('file_item_id', 'file_item_id', {
            unique: false,
          });
        }
      }

      console.log('IndexedDB upgraded to version', DB_VERSION);
    };
  });
};

// Helper functions for database operations
const getObjectStore = async (
  storeName: string,
  mode: IDBTransactionMode = 'readonly',
): Promise<IDBObjectStore> => {
  const db = await initDB();
  const transaction = db.transaction(storeName, mode);
  return transaction.objectStore(storeName);
};

const getItem = async <T>(
  storeName: string,
  key: string,
): Promise<T | undefined> => {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await getObjectStore(storeName);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result as T);
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

const putItem = async <T>(storeName: string, item: T): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await getObjectStore(storeName, 'readwrite');
      const request = store.put(item);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

const deleteItem = async (
  storeName: string,
  key: string | [string, string],
): Promise<void> => {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await getObjectStore(storeName, 'readwrite');
      const request = store.delete(key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

const getItemsByIndex = async <T>(
  storeName: string,
  indexName: string,
  key: string,
): Promise<T[]> => {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await getObjectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(key);

      request.onsuccess = () => {
        resolve(request.result as T[]);
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      reject(error);
    }
  });
};

// Reimplemented database functions using IndexedDB

export const createStorage = async (
  chat: Tables<'chats'>,
  messages: MessageWithFileItemsAndFeedback[],
  chatFiles: { files: Tables<'files'>[] } | null,
) => {
  try {
    // Store chat
    await putItem(STORES.CHATS, chat);

    // Store messages and their related items
    for (const message of messages) {
      const { file_items = [], feedback = [], ...messageData } = message;

      // Store the message
      console.log('Storing message:', messageData);
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
    if (chatFiles?.files) {
      for (const file of chatFiles.files) {
        await putItem(STORES.FILES, file);
      }
    }
  } catch (error) {
    console.error('Error creating storage:', error);
    throw error;
  }
};

export const getStoredMessageById = async (
  messageId: string,
): Promise<MessageWithFileItemsAndFeedback | undefined> => {
  try {
    const message = await getItem<Tables<'messages'>>(
      STORES.MESSAGES,
      messageId,
    );
    if (!message) return undefined;

    // Get message-file-item relationships
    const messageFileItems = await getItemsByIndex<{
      message_id: string;
      file_item_id: string;
      user_id: string;
    }>(STORES.MESSAGE_FILE_ITEMS, 'message_id', messageId);

    // Get file items using the relationships
    const file_items: Tables<'file_items'>[] = [];
    for (const relationship of messageFileItems) {
      const fileItem = await getItem<Tables<'file_items'>>(
        STORES.FILE_ITEMS,
        relationship.file_item_id,
      );
      if (fileItem) {
        file_items.push(fileItem);
      }
    }

    // Get feedback
    const feedback = await getItemsByIndex<Tables<'feedback'>>(
      STORES.FEEDBACK,
      'message_id',
      messageId,
    );

    return {
      ...message,
      file_items,
      feedback,
    };
  } catch (error) {
    console.error('Error getting message:', error);
    throw error;
  }
};

export const getStoredMessagesByChatId = async (
  chatId: string,
): Promise<MessageWithFileItemsAndFeedback[]> => {
  try {
    const chat = await getItem<Tables<'chats'>>(STORES.CHATS, chatId);
    if (!chat) return [];

    // Get all messages for this chat
    const messages = await getItemsByIndex<Tables<'messages'>>(
      STORES.MESSAGES,
      'chat_id',
      chatId,
    );

    // For each message, get its file items and feedback
    const result: MessageWithFileItemsAndFeedback[] = [];
    for (const message of messages) {
      const messageWithItems = await getStoredMessageById(message.id);
      if (messageWithItems) {
        result.push(messageWithItems);
      }
    }

    // Sort messages by sequence number
    result.sort((a, b) => a.sequence_number - b.sequence_number);
    return result;
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
};

export const updateStoredChatData = async (
  chatId: string,
  args: {
    chat?: Tables<'chats'>;
    messages?: MessageWithFileItemsAndFeedback[];
    chatFiles?: Tables<'files'>[];
  },
) => {
  try {
    // Update chat if provided
    if (args.chat) {
      await putItem(STORES.CHATS, args.chat);
    }

    // Update messages if provided
    if (args.messages) {
      for (const message of args.messages) {
        await updateStoredMessage({
          message,
          fileItems: message.file_items,
          feedback: message.feedback,
        });
      }
    }

    // Update files if provided
    if (args.chatFiles) {
      for (const file of args.chatFiles) {
        await putItem(STORES.FILES, file);
      }
    }
  } catch (error) {
    console.error('Error updating chat data:', error);
    throw error;
  }
};

export const deleteStoredMessage = async (messageId: string): Promise<void> => {
  try {
    const message = await getItem<Tables<'messages'>>(
      STORES.MESSAGES,
      messageId,
    );
    if (!message) return;

    // Get message-file-item relationships
    const messageFileItems = await getItemsByIndex<{
      message_id: string;
      file_item_id: string;
    }>(STORES.MESSAGE_FILE_ITEMS, 'message_id', messageId);

    // Delete the message-file-item relationships
    for (const relationship of messageFileItems) {
      await deleteItem(STORES.MESSAGE_FILE_ITEMS, [
        relationship.message_id,
        relationship.file_item_id,
      ]);
    }

    // Delete the message
    await deleteItem(STORES.MESSAGES, messageId);

    // Delete related feedback
    const feedback = await getItemsByIndex<Tables<'feedback'>>(
      STORES.FEEDBACK,
      'message_id',
      messageId,
    );
    for (const item of feedback) {
      await deleteItem(STORES.FEEDBACK, item.id);
    }
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

export const updateStoredMessage = async ({
  message,
  fileItems,
  feedback,
}: {
  message: Tables<'messages'>;
  fileItems?: Tables<'file_items'>[];
  feedback?: Tables<'feedback'>[];
}): Promise<void> => {
  try {
    const messageId = message.id;

    // Update message
    await putItem(STORES.MESSAGES, message);

    // Update file items if provided
    if (fileItems) {
      // Get existing message-file-item relationships
      const existingRelationships = await getItemsByIndex<{
        message_id: string;
        file_item_id: string;
      }>(STORES.MESSAGE_FILE_ITEMS, 'message_id', messageId);

      const existingFileItemIds = new Set(
        existingRelationships.map((rel) => rel.file_item_id),
      );
      const newFileItemIds = new Set(fileItems.map((item) => item.id));

      // Delete relationships that no longer exist
      for (const relationship of existingRelationships) {
        if (!newFileItemIds.has(relationship.file_item_id)) {
          await deleteItem(STORES.MESSAGE_FILE_ITEMS, [
            relationship.message_id,
            relationship.file_item_id,
          ]);
        }
      }

      // Add new file items and relationships
      for (const item of fileItems) {
        // Add or update the file item
        await putItem(STORES.FILE_ITEMS, item);

        // Add relationship if it doesn't exist
        if (!existingFileItemIds.has(item.id)) {
          await putItem(STORES.MESSAGE_FILE_ITEMS, {
            message_id: messageId,
            file_item_id: item.id,
            user_id: message.user_id,
            created_at: new Date().toISOString(),
            updated_at: null,
          });
        }
      }
    }

    // Update feedback if provided
    if (feedback) {
      // Get existing feedback to determine what to delete
      const existingFeedback = await getItemsByIndex<Tables<'feedback'>>(
        STORES.FEEDBACK,
        'message_id',
        messageId,
      );
      const existingFeedbackIds = new Set(
        existingFeedback.map((item) => item.id),
      );
      const newFeedbackIds = new Set(feedback.map((item) => item.id));

      // Delete feedback that no longer exists
      for (const item of existingFeedback) {
        if (!newFeedbackIds.has(item.id)) {
          await deleteItem(STORES.FEEDBACK, item.id);
        }
      }

      // Add or update new feedback
      for (const item of feedback) {
        await putItem(STORES.FEEDBACK, item);
      }
    }
  } catch (error) {
    console.error('Error updating message:', error);
    throw error;
  }
};

export const deleteStoredMessagesIncludingAndAfter = async (
  userId: string,
  chatId: string,
  sequenceNumber: number,
): Promise<void> => {
  try {
    // Get all messages for this chat
    const messages = await getStoredMessagesByChatId(chatId);

    // Filter messages to delete
    const messagesToDelete = messages.filter(
      (m) => m.sequence_number >= sequenceNumber,
    );

    // Delete each message
    for (const message of messagesToDelete) {
      await deleteStoredMessage(message.id);
    }
  } catch (error) {
    console.error('Error deleting messages:', error);
    throw error;
  }
};

export const getStoredChatById = async (
  chatId: string,
): Promise<Tables<'chats'> | undefined> => {
  return await getItem<Tables<'chats'>>(STORES.CHATS, chatId);
};

export const updateStoredChat = async (
  chat: Tables<'chats'>,
): Promise<void> => {
  await putItem(STORES.CHATS, chat);
};

export const deleteStoredChat = async (chatId: string): Promise<void> => {
  await deleteItem(STORES.CHATS, chatId);
};

export const deleteAllStoredChats = async (userId: string): Promise<void> => {
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

export const getStoredChatsByUserId = async (
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

export const updateStoredChats = async (
  chats: Tables<'chats'>[],
): Promise<void> => {
  for (const chat of chats) {
    await updateStoredChat(chat);
  }
};

export const getStoredChatFilesByChatId = async (
  chatId: string,
): Promise<Tables<'files'>[]> => {
  return await getItemsByIndex<Tables<'files'>>(
    STORES.FILES,
    'chat_id',
    chatId,
  );
};

export const getStoredFileById = async (
  fileId: string,
): Promise<Tables<'files'> | undefined> => {
  return await getItem<Tables<'files'>>(STORES.FILES, fileId);
};

export const getStoredFilesCount = async (): Promise<number> => {
  return new Promise(async (resolve, reject) => {
    try {
      const store = await getObjectStore(STORES.FILES);
      const request = store.count();

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        reject(request.error);
      };
    } catch (error) {
      console.error('Error counting files:', error);
      reject(error);
    }
  });
};

export const updateStoredFile = async (
  file: Tables<'files'>,
): Promise<void> => {
  await putItem(STORES.FILES, file);
};

export const deleteStoredFile = async (fileId: string): Promise<void> => {
  await deleteItem(STORES.FILES, fileId);
};

export const updateStoredFeedback = async (
  feedback: Tables<'feedback'>,
): Promise<void> => {
  await putItem(STORES.FEEDBACK, feedback);
};

export const updateStoredFeedbacks = async (
  feedbacks: Tables<'feedback'>[],
): Promise<void> => {
  for (const feedback of feedbacks) {
    await updateStoredFeedback(feedback);
  }
};

export const getStoredMessageFileItemsByMessageId = async (
  messageId: string,
): Promise<Tables<'message_file_items'>[]> => {
  return await getItemsByIndex<Tables<'message_file_items'>>(
    STORES.MESSAGE_FILE_ITEMS,
    'message_id',
    messageId,
  );
};

export const updateStoredMessageFileItems = async (
  messageFileItems: Tables<'message_file_items'>[],
): Promise<void> => {
  for (const messageFileItem of messageFileItems) {
    await putItem(STORES.MESSAGE_FILE_ITEMS, messageFileItem);
  }
};
