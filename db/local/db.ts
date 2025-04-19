import { Tables } from '@/supabase/types';
import { MessageWithFileItemsAndFeedback } from '../messages';
import { MessageImage } from '@/types/images/message-image';

// IndexedDB setup
const DB_NAME = 'pentest_gpt_db';
const DB_VERSION = 5;
const STORES = {
  CHATS: 'chats',
  MESSAGES: 'messages',
  FILE_ITEMS: 'fileItems',
  FEEDBACK: 'feedback',
  FILES: 'files',
  MESSAGE_FILE_ITEMS: 'messageFileItems',
  MESSAGE_IMAGES: 'messageImages',
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

      // Create MessageImages store if it doesn't exist
      if (!db.objectStoreNames.contains(STORES.MESSAGE_IMAGES)) {
        const messageImagesStore = db.createObjectStore(STORES.MESSAGE_IMAGES, {
          keyPath: 'path', // Use image path as the key
        });
        messageImagesStore.createIndex('message_id', 'messageId', {
          unique: false,
        });
        messageImagesStore.createIndex('path', 'path', { unique: true });
      } else if (transaction) {
        const messageImagesStore = transaction.objectStore(
          STORES.MESSAGE_IMAGES,
        );
        if (!messageImagesStore.indexNames.contains('message_id')) {
          messageImagesStore.createIndex('message_id', 'messageId', {
            unique: false,
          });
        }
        if (!messageImagesStore.indexNames.contains('path')) {
          messageImagesStore.createIndex('path', 'path', { unique: true });
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
  const allChats = await getStoredChatsByUserId(userId);
  const chatsToDelete = allChats.filter((chat) => !chatIds.includes(chat.id));
  for (const chat of chatsToDelete) {
    await deleteStoredChat(chat.id);
  }
};

const getStoredMessageById = async (
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

const getStoredMessageFileItemsByMessageId = async (
  messageId: string,
): Promise<Tables<'file_items'>[] | null> => {
  const message = await getItem<Tables<'messages'>>(STORES.MESSAGES, messageId);
  if (!message) return null;

  const messageFileItems = await getItemsByIndex<Tables<'message_file_items'>>(
    STORES.MESSAGE_FILE_ITEMS,
    'message_id',
    messageId,
  );
  const fileItems = [];
  for (const mfi of messageFileItems) {
    const fileItem = await getStoredFileItemById(mfi.file_item_id);
    if (fileItem) {
      fileItems.push(fileItem);
    }
  }

  return fileItems;
};

const getStoredMessagesByChatId = async (
  chatId: string,
  limit = 20,
  lastSequenceNumber?: number,
): Promise<MessageWithFileItemsAndFeedback[] | undefined> => {
  try {
    const chat = await getItem<Tables<'chats'>>(STORES.CHATS, chatId);
    if (!chat) return undefined;

    // Get all messages for this chat
    const messages = await getItemsByIndex<Tables<'messages'>>(
      STORES.MESSAGES,
      'chat_id',
      chatId,
    );

    // Filter messages by sequence number if needed
    let filteredMessages = messages;
    if (lastSequenceNumber !== undefined) {
      filteredMessages = messages.filter(
        (message) => message.sequence_number < lastSequenceNumber,
      );
    }

    // For each message, get its file items and feedback
    const result: MessageWithFileItemsAndFeedback[] = [];
    for (const message of filteredMessages) {
      const messageWithItems = await getStoredMessageById(message.id);
      if (messageWithItems) {
        result.push(messageWithItems);
      }
    }

    // Sort messages by sequence number and limit the results
    result.sort((a, b) => b.sequence_number - a.sequence_number);
    return result.slice(0, limit).reverse();
  } catch (error) {
    console.error('Error getting messages:', error);
    throw error;
  }
};

const deleteStoredMessageImagesByMessageId = async (
  messageId: string,
): Promise<void> => {
  await deleteItem(STORES.MESSAGE_IMAGES, messageId);
};

const deleteStoredMessage = async (messageId: string): Promise<void> => {
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

    // Delete the message-image relationships
    const messageImages = await getItemsByIndex<MessageImage>(
      STORES.MESSAGE_IMAGES,
      'message_id',
      messageId,
    );
    for (const image of messageImages) {
      await deleteItem(STORES.MESSAGE_IMAGES, image.path);
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

    // Delete related images
    await deleteStoredMessageImagesByMessageId(messageId);
  } catch (error) {
    console.error('Error deleting message:', error);
    throw error;
  }
};

const updateStoredFileItem = async (
  fileItem: Tables<'file_items'>,
): Promise<void> => {
  await putItem(STORES.FILE_ITEMS, fileItem);
};

const updateStoredMessage = async (
  message: Tables<'messages'>,
): Promise<void> => {
  await putItem(STORES.MESSAGES, message);
};

const deleteStoredMessagesIncludingAndAfter = async (
  userId: string,
  chatId: string,
  sequenceNumber: number,
): Promise<void> => {
  try {
    // Get all messages for this chat
    const messages = await getItemsByIndex<Tables<'messages'>>(
      STORES.MESSAGES,
      'chat_id',
      chatId,
    );

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
      await deleteStoredMessage(message.id);
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

const getStoredChatFilesByChatId = async (
  chatId: string,
): Promise<Tables<'files'>[]> => {
  return await getItemsByIndex<Tables<'files'>>(
    STORES.FILES,
    'chat_id',
    chatId,
  );
};

const getStoredFileById = async (
  fileId: string,
): Promise<Tables<'files'> | undefined> => {
  return await getItem<Tables<'files'>>(STORES.FILES, fileId);
};

const getStoredFilesCount = async (): Promise<number> => {
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

const updateStoredFile = async (file: Tables<'files'>): Promise<void> => {
  await putItem(STORES.FILES, file);
};

const deleteStoredFile = async (fileId: string): Promise<void> => {
  await deleteItem(STORES.FILES, fileId);
};

const updateStoredFeedback = async (
  feedback: Tables<'feedback'>,
): Promise<void> => {
  await putItem(STORES.FEEDBACK, feedback);
};

const updateStoredFeedbacks = async (
  feedbacks: Tables<'feedback'>[],
): Promise<void> => {
  for (const feedback of feedbacks) {
    await updateStoredFeedback(feedback);
  }
};

const updateStoredMessageFileItems = async (
  messageFileItems: Tables<'message_file_items'>[],
): Promise<void> => {
  for (const messageFileItem of messageFileItems) {
    await putItem(STORES.MESSAGE_FILE_ITEMS, messageFileItem);
  }
};

// New image storage functions
const storeMessageImage = async (image: MessageImage): Promise<void> => {
  try {
    await putItem(STORES.MESSAGE_IMAGES, image);
  } catch (error) {
    console.error('Error storing message image:', error);
    throw error;
  }
};

const getStoredMessageImageByPath = async (
  path: string,
): Promise<MessageImage | undefined> => {
  return await getItem(STORES.MESSAGE_IMAGES, path);
};

const updateStoredFileItems = async (
  fileItems: Tables<'file_items'>[],
): Promise<void> => {
  for (const fileItem of fileItems) {
    await updateStoredFileItem(fileItem);
  }
};

const updateStoredChatFiles = async (
  chatFiles: Tables<'files'>[],
): Promise<void> => {
  for (const file of chatFiles) {
    await updateStoredFile(file);
  }
};

const getStoredFileItemById = async (
  fileItemId: string,
): Promise<Tables<'file_items'> | undefined> => {
  return await getItem<Tables<'file_items'>>(STORES.FILE_ITEMS, fileItemId);
};

const getStoredFileItemsByFileId = async (
  fileId: string,
  sortBy?: 'sequence_number',
): Promise<Tables<'file_items'>[]> => {
  const fileItems = await getItemsByIndex<Tables<'file_items'>>(
    STORES.FILE_ITEMS,
    'file_id',
    fileId,
  );
  if (sortBy === 'sequence_number') {
    return fileItems.sort((a, b) => a.sequence_number - b.sequence_number);
  } else {
    return fileItems;
  }
};

// Create an organized database interface object
export const db = {
  // General storage functions
  storage: {
    create: createStorage,
    clean: cleanStorage,
  },

  // Chat related functions
  chats: {
    getById: getStoredChatById,
    getByUserId: getStoredChatsByUserId,
    update: updateStoredChat,
    updateMany: updateStoredChats,
    delete: deleteStoredChat,
    deleteAll: deleteAllStoredChats,
  },

  // Message related functions
  messages: {
    getById: getStoredMessageById,
    getByChatId: getStoredMessagesByChatId,
    update: updateStoredMessage,
    delete: deleteStoredMessage,
    deleteIncludingAndAfter: deleteStoredMessagesIncludingAndAfter,
  },

  // File related functions
  files: {
    getById: getStoredFileById,
    getByChatId: getStoredChatFilesByChatId,
    getCount: getStoredFilesCount,
    update: updateStoredFile,
    updateMany: updateStoredChatFiles,
    delete: deleteStoredFile,
  },

  // File items related functions
  fileItems: {
    getById: getStoredFileItemById,
    getByFileId: getStoredFileItemsByFileId,
    getByMessageId: getStoredMessageFileItemsByMessageId,
    update: updateStoredFileItem,
    updateMany: updateStoredFileItems,
  },

  // Feedback related functions
  feedback: {
    update: updateStoredFeedback,
    updateMany: updateStoredFeedbacks,
  },

  // Message-FileItem junction related functions
  messageFileItems: {
    getByMessageId: getStoredMessageFileItemsByMessageId,
    updateMany: updateStoredMessageFileItems,
  },

  // Message images related functions
  messageImages: {
    store: storeMessageImage,
    getByPath: getStoredMessageImageByPath,
  },
};
