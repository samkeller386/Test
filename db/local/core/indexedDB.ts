import { initDB } from '../schema/schema';

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

export { getObjectStore, getItem, putItem, deleteItem, getItemsByIndex };
