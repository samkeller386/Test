import { supabase } from '@/lib/supabase/browser-client';
import { getStoredChatFilesByChatId } from './local/db';

export const getChatFilesByChatId = async (chatId: string) => {
  const storedChatFiles = await getStoredChatFilesByChatId(chatId);
  if (storedChatFiles) {
    console.log(
      'Returning stored chat files for chat:',
      chatId,
      storedChatFiles,
    );
    return { files: storedChatFiles };
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

  return { files: chatFiles };
};
