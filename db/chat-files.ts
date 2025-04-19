import { supabase } from '@/lib/supabase/browser-client';
import { db } from './local/db';

export const getChatFilesByChatId = async (
  chatId: string,
  useStored = true,
) => {
  const storedChatFiles = await db.files.getByChatId(chatId);
  if (useStored && storedChatFiles) {
    console.log(
      'Returning stored chat files for chat:',
      chatId,
      storedChatFiles,
    );
    return storedChatFiles;
  }

  const { data: chatFiles, error } = await supabase
    .from('files')
    .select('*')
    .eq('chat_id', chatId);

  if (error) {
    if (error.code === 'PGRST116') {
      // No rows returned, chat not found
      return null;
    }
    // For other types of errors, we still throw
    throw new Error(`Error fetching chat files: ${error.message}`);
  }

  await db.files.updateMany(chatFiles);

  return chatFiles;
};
