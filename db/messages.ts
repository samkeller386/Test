import { supabase } from '@/lib/supabase/browser-client';
import type { Tables, TablesInsert, TablesUpdate } from '@/supabase/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export const getMessagesByChatId = async (
  chatId: string,
  limit = 20,
  lastSequenceNumber?: number,
) => {
  let query = supabase
    .from('messages')
    .select('*, feedback(*), file_items (*)')
    .eq('chat_id', chatId)
    .order('sequence_number', { ascending: false })
    .limit(limit);

  if (lastSequenceNumber !== undefined) {
    query = query.lt('sequence_number', lastSequenceNumber);
  }

  const { data: messages } = await query;

  if (!messages) {
    throw new Error('Messages not found');
  }

  return messages.reverse();
};

export const createMessage = async (message: TablesInsert<'messages'>) => {
  const { data: createdMessage, error } = await supabase
    .from('messages')
    .insert([message])
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return createdMessage;
};

export const createMessages = async (
  messages: TablesInsert<'messages'>[],
  newChatFiles: { id: string }[],
  userMessageId: string | null,
  setChatFiles?: React.Dispatch<React.SetStateAction<Tables<'files'>[]>>,
) => {
  const { data: createdMessages, error } = await supabase
    .from('messages')
    .insert(messages)
    .select('*');

  if (error) {
    throw new Error(error.message);
  }

  const fileIds = newChatFiles
    .map((file) => file.id)
    .filter((id) => id !== undefined);

  if (fileIds.length > 0) {
    if (setChatFiles) {
      setChatFiles((prev) =>
        prev.map((file) =>
          fileIds.includes(file.id)
            ? { ...file, message_id: userMessageId }
            : file,
        ),
      );
    }
  }

  return createdMessages;
};

export const updateMessage = async (
  messageId: string,
  message: TablesUpdate<'messages'>,
) => {
  const { data: updatedMessage, error } = await supabase
    .from('messages')
    .update(message)
    .eq('id', messageId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return updatedMessage;
};

export const deleteMessage = async (messageId: string) => {
  const { error } = await supabase
    .from('messages')
    .delete()
    .eq('id', messageId);

  if (error) {
    throw new Error(error.message);
  }

  return true;
};

export const deleteMessagesIncludingAndAfter = async ({
  supabase,
  userId,
  chatId,
  sequenceNumber,
  retrieveFiles = false,
}: {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
  sequenceNumber: number;
  retrieveFiles?: boolean;
}) => {
  let files: Tables<'files'>[] = [];

  if (retrieveFiles) {
    try {
      // Get messages at the sequence number
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', chatId)
        .eq('sequence_number', sequenceNumber);

      if (messagesError) {
        console.error(
          '[deleteMessagesIncludingAndAfter] Error fetching messages:',
          messagesError,
        );
        throw messagesError;
      }

      // Get files associated with these messages
      const { data: filesData, error: filesError } = await supabase
        .from('files')
        .select('*')
        .in(
          'message_id',
          messagesData.map((message: Tables<'messages'>) => message.id),
        );

      if (filesError) {
        console.error(
          '[deleteMessagesIncludingAndAfter] Error fetching files:',
          filesError,
        );
        throw filesError;
      }

      // Update files to remove message_id
      if (filesData.length > 0) {
        const { error: updateError } = await supabase
          .from('files')
          .update({ message_id: null })
          .in(
            'id',
            filesData.map((file: Tables<'files'>) => file.id),
          );

        if (updateError) {
          console.error(
            '[deleteMessagesIncludingAndAfter] Error updating files:',
            updateError,
          );
          throw updateError;
        }
      }

      files = filesData;
    } catch (error) {
      console.error(
        '[deleteMessagesIncludingAndAfter] Error handling files:',
        error,
      );
      throw error;
    }
  }

  try {
    const { error } = await supabase.rpc(
      'delete_messages_including_and_after',
      {
        p_user_id: userId,
        p_chat_id: chatId,
        p_sequence_number: sequenceNumber,
      },
    );

    if (error) {
      console.error(
        '[deleteMessagesIncludingAndAfter] Error deleting messages:',
        error,
      );
      return {
        files,
        success: false,
        error: 'Failed to delete messages.',
      };
    }

    return {
      files,
      success: true,
      error: null,
    };
  } catch (error) {
    console.error('[deleteMessagesIncludingAndAfter] Error:', error);
    throw error;
  }
};
