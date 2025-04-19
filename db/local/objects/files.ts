import {
  getObjectStore,
  getItemsByIndex,
  getItem,
  deleteItem,
  putItem,
} from '../core/indexedDB';
import { STORES } from '../schema/schema';
import { Tables } from '@/supabase/types';

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

const updateStoredChatFiles = async (
  chatFiles: Tables<'files'>[],
): Promise<void> => {
  for (const file of chatFiles) {
    await updateStoredFile(file);
  }
};

export const files = {
  getById: getStoredFileById,
  getByChatId: getStoredChatFilesByChatId,
  getCount: getStoredFilesCount,
  update: updateStoredFile,
  updateMany: updateStoredChatFiles,
  delete: deleteStoredFile,
};
