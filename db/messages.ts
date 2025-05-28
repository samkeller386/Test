import { supabase } from '@/lib/supabase/browser-client';
import { getFeedbackForMessages } from '@/lib/feedback-client';
import type { Feedback } from '@/types/feedback';
// import type { Tables, TablesInsert, TablesUpdate } from '@/supabase/types';

export const getMessagesByChatId = async (
  chatId: string,
  limit = 20,
  lastSequenceNumber?: number,
) => {
  let query = supabase
    .from('messages')
    .select('*, file_items (*)')
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

  // Get feedback for all messages in one query
  const messageIds = messages.map((message) => message.id);
  const feedbackResults = await getFeedbackForMessages(messageIds);

  // Create a map of message ID to feedback
  const feedbackMap = new Map<string, Feedback | null>(
    feedbackResults.map((feedback: Feedback | null, index: number) => [
      messageIds[index],
      feedback,
    ]),
  );

  // Combine messages with their feedback
  const messagesWithFeedback = messages.map((message) => ({
    ...message,
    feedback: feedbackMap.get(message.id) ? [feedbackMap.get(message.id)] : [],
  }));

  return messagesWithFeedback.reverse();
};

// export const createMessage = async (message: TablesInsert<'messages'>) => {
//   const { data: createdMessage, error } = await supabase
//     .from('messages')
//     .insert([message])
//     .select('*')
//     .single();

//   if (error) {
//     throw new Error(error.message);
//   }

//   return createdMessage;
// };

// export const createMessages = async (
//   messages: TablesInsert<'messages'>[],
//   newChatFiles: { id: string }[],
//   userMessageId: string | null,
//   setChatFiles?: React.Dispatch<React.SetStateAction<Tables<'files'>[]>>,
// ) => {
//   const { data: createdMessages, error } = await supabase
//     .from('messages')
//     .insert(messages)
//     .select('*');

//   if (error) {
//     throw new Error(error.message);
//   }

//   const fileIds = newChatFiles
//     .map((file) => file.id)
//     .filter((id) => id !== undefined);

//   if (fileIds.length > 0) {
//     if (setChatFiles) {
//       setChatFiles((prev) =>
//         prev.map((file) =>
//           fileIds.includes(file.id)
//             ? { ...file, message_id: userMessageId }
//             : file,
//         ),
//       );
//     }
//   }

//   return createdMessages;
// };

// export const updateMessage = async (
//   messageId: string,
//   message: TablesUpdate<'messages'>,
// ) => {
//   const { data: updatedMessage, error } = await supabase
//     .from('messages')
//     .update(message)
//     .eq('id', messageId)
//     .select('*')
//     .single();

//   if (error) {
//     throw new Error(error.message);
//   }

//   return updatedMessage;
// };

// export const deleteMessage = async (messageId: string) => {
//   const { error } = await supabase
//     .from('messages')
//     .delete()
//     .eq('id', messageId);

//   if (error) {
//     throw new Error(error.message);
//   }

//   return true;
// };
