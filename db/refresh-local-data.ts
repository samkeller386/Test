import { getChatFilesByMultipleChatIds } from './chat-files';
import { localDB } from './local/db';
import { getFeedbackByMultipleChatIds } from './message-feedback';
import {
  getFileItemsByMultipleFileIds,
  getMessageFileItemsByMultipleMessageIds,
} from './message-file-items';
import { getMessagesByChatId, getMessagesByMultipleChatIds } from './messages';
import { Tables } from '@/supabase/types';

export const refreshLocalData = async (chats: Tables<'chats'>[]) => {
  console.log('Refreshing local data');
  const chatIds = chats.map((chat) => chat.id);

  const lastSync = await localDB.storage.getSyncData('lastSync');

  if (!lastSync) {
    await getMessagesByMultipleChatIds(chatIds);
    await getFeedbackByMultipleChatIds(chatIds);
    await refreshFiles(chatIds);
    await localDB.storage.setSyncData('lastSync', new Date().toISOString());
    return;
  }

  const lastSyncDate = new Date(lastSync);

  // for messages
  const chatsWithNewMessages = chats
    .filter((chat) => new Date(chat.last_message_update) > lastSyncDate)
    .map((chat) => chat.id);
  const messages = await getMessagesByMultipleChatIds(chatsWithNewMessages);
  await getMessageFileItemsByMultipleMessageIds(
    messages.map((message) => message.id),
  );

  // for feedback
  const chatsWithNewFeedback = chats
    .filter((chat) => new Date(chat.last_feedback_update) > lastSyncDate)
    .map((chat) => chat.id);
  await getFeedbackByMultipleChatIds(chatsWithNewFeedback);

  // for files
  const chatsWithNewFiles = chats
    .filter((chat) => new Date(chat.last_file_update) > lastSyncDate)
    .map((chat) => chat.id);
  await refreshFiles(chatsWithNewFiles);

  await localDB.storage.setSyncData('lastSync', new Date().toISOString());
};

const refreshFiles = async (chatIds: string[]) => {
  const uniqueChatIds = [...new Set(chatIds)];
  const files = await getChatFilesByMultipleChatIds(uniqueChatIds);
  await getFileItemsByMultipleFileIds(files.map((file) => file.id));
};
