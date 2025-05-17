import type { BuiltChatMessage, MessageContent } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractTextContent } from '../message-utils';
import type { TablesInsert, Tables } from '@/supabase/types';
import type { LLMID, PluginID } from '@/types';
import { deleteMessagesIncludingAndAfter } from '@/db/messages';

// Find the last message with role 'user'
export async function getLastUserMessage(
  messages: BuiltChatMessage[],
): Promise<BuiltChatMessage | null> {
  const lastUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === 'user');
  return lastUserMessage || null;
}

export async function saveUserMessage({
  supabase,
  chatId,
  userId,
  content,
  sequence,
  model,
  plugin,
  thinkingEnabled = false,
  messageContent,
  newChatFiles,
  retrievedFileItems,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  content: string;
  sequence: number;
  model: LLMID;
  plugin: PluginID;
  thinkingEnabled?: boolean;
  messageContent: MessageContent[];
  newChatFiles?: { id: string }[];
  retrievedFileItems?: Tables<'file_items'>[];
}) {
  try {
    const message: TablesInsert<'messages'> = {
      chat_id: chatId,
      user_id: userId,
      content,
      thinking_content: null,
      thinking_enabled: thinkingEnabled,
      thinking_elapsed_secs: null,
      model,
      plugin,
      role: 'user',
      sequence_number: sequence,
      image_paths: [],
      citations: [],
      attachments: [],
    };

    const { data: createdMessage, error } = await supabase
      .from('messages')
      .insert([message])
      .select()
      .single();

    if (error) {
      throw error;
    }

    // Handle image paths if there are any
    const imageContents = messageContent.filter(
      (item) => item.type === 'image_url',
    );

    if (imageContents.length > 0 && createdMessage) {
      const imagePaths = imageContents.map(
        (imageContent) => imageContent.image_url.url,
      );

      if (imagePaths.length > 0) {
        // Create image relationships
        const relationships = imagePaths.map((path) => ({
          user_id: userId,
          message_id: createdMessage.id,
          image_path: path,
        }));

        const { error: relationshipError } = await supabase
          .from('message_image_relationships')
          .insert(relationships);

        if (relationshipError) {
          throw relationshipError;
        }

        // Update message with image paths
        const { error: updateError } = await supabase
          .from('messages')
          .update({ image_paths: imagePaths })
          .eq('id', createdMessage.id);

        if (updateError) {
          throw updateError;
        }
      }
    }

    // Handle file updates if there are any
    if (newChatFiles && newChatFiles.length > 0 && createdMessage) {
      const fileIds = newChatFiles
        .map((file) => file.id)
        .filter((id) => id !== undefined);

      if (fileIds.length > 0) {
        const { error: filesError } = await supabase
          .from('files')
          .update({ message_id: createdMessage.id, chat_id: chatId })
          .in('id', fileIds)
          .is('message_id', null)
          .select('*');

        if (filesError) {
          throw filesError;
        }
      }
    }

    // Handle file items if there are any
    if (retrievedFileItems && retrievedFileItems.length > 0 && createdMessage) {
      const fileItemRelationships = retrievedFileItems.map((fileItem) => ({
        user_id: userId,
        message_id: createdMessage.id,
        file_item_id: fileItem.id,
      }));

      const { error: fileItemsError } = await supabase
        .from('message_file_items')
        .insert(fileItemRelationships);

      if (fileItemsError) {
        throw fileItemsError;
      }
    }

    return createdMessage;
  } catch (error) {
    throw error;
  }
}

export async function getNextMessageSequence(
  supabase: SupabaseClient,
  chatId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('sequence_number')
      .eq('chat_id', chatId)
      .order('sequence_number', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data ? data.sequence_number + 1 : 1;
  } catch (error) {
    throw error;
  }
}

export async function handleUserMessage({
  supabase,
  chatId,
  userId,
  messages,
  model,
  plugin,
  editSequenceNumber,
  retrievedFileItems,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  messages: BuiltChatMessage[];
  model: LLMID;
  plugin: PluginID;
  editSequenceNumber?: number;
  retrievedFileItems?: Tables<'file_items'>[];
}) {
  try {
    // If editing, delete messages after the edited sequence
    if (editSequenceNumber !== undefined) {
      const { error } = await deleteMessagesIncludingAndAfter({
        supabase,
        userId,
        chatId,
        sequenceNumber: editSequenceNumber,
        retrieveFiles: true,
      });

      if (error) {
        throw new Error(`Failed to delete messages: ${error}`);
      }
    }

    const lastUserMessage = await getLastUserMessage(messages);
    if (!lastUserMessage) {
      throw new Error('No user message found');
    }

    const content = extractTextContent(lastUserMessage.content);

    // Extract file IDs from attachments if not provided directly
    const fileIdsFromAttachments = lastUserMessage.attachments?.map(
      (attachment) => ({ id: attachment.file_id }),
    );

    const finalNewChatFiles = fileIdsFromAttachments;

    const sequence =
      editSequenceNumber ?? (await getNextMessageSequence(supabase, chatId));
    const thinkingEnabled = model === 'reasoning-model';

    const savedMessage = await saveUserMessage({
      supabase,
      chatId,
      userId,
      content,
      sequence,
      model,
      plugin,
      thinkingEnabled,
      messageContent: Array.isArray(lastUserMessage.content)
        ? lastUserMessage.content
        : [],
      newChatFiles: finalNewChatFiles,
      retrievedFileItems,
    });

    return { success: true, sequence, message: savedMessage };
  } catch (error) {
    throw error;
  }
}
