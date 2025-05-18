import type { BuiltChatMessage, MessageContent, ModelParams } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { extractTextContent } from '../message-utils';
import type { TablesInsert, Tables } from '@/supabase/types';
import type { LLMID, PluginID } from '@/types';
import {
  deleteMessagesIncludingAndAfter,
  getNextMessageSequence,
  deleteLastMessage,
  insertMessages,
  insertImageRelationships,
  insertFileItemRelationships,
  updateLastAssistantMessage,
} from './message-db-actions';

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
}

export async function handleUserMessage({
  supabase,
  chatId,
  userId,
  messages,
  modelParams,
  model,
  editSequenceNumber,
  retrievedFileItems,
  assistantMessage,
  citations,
  thinkingText,
  thinkingElapsedSecs,
  fileAttachments,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  messages: BuiltChatMessage[];
  modelParams: ModelParams;
  model: LLMID;
  editSequenceNumber?: number;
  retrievedFileItems?: Tables<'file_items'>[];
  assistantMessage?: string;
  citations?: string[];
  thinkingText?: string;
  thinkingElapsedSecs?: number | null;
  fileAttachments?: any[];
}) {
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

  // If regeneration, delete the last message
  if (modelParams.isRegeneration) {
    await deleteLastMessage(supabase, chatId);
  }

  const lastUserMessage = await getLastUserMessage(messages);
  if (!lastUserMessage) {
    throw new Error('No user message found');
  }

  const content = extractTextContent(lastUserMessage.content);
  const sequence =
    editSequenceNumber ?? (await getNextMessageSequence(supabase, chatId));
  const thinkingEnabled = model === 'reasoning-model';

  // Only save user message if not in continuation/regeneration mode
  const shouldSaveUserMessage =
    !modelParams.isContinuation &&
    !modelParams.isTerminalContinuation &&
    !modelParams.isRegeneration;

  // Prepare messages for insertion
  const messagesToInsert: TablesInsert<'messages'>[] = [];

  if (shouldSaveUserMessage) {
    // Extract image paths before creating message
    const imageContents = Array.isArray(lastUserMessage.content)
      ? lastUserMessage.content.filter((item) => item.type === 'image_url')
      : [];

    const imagePaths = imageContents.map(
      (imageContent) => imageContent.image_url.url,
    );

    const userMessageData: TablesInsert<'messages'> = {
      chat_id: chatId,
      user_id: userId,
      content,
      thinking_content: null,
      thinking_enabled: thinkingEnabled,
      thinking_elapsed_secs: null,
      model,
      plugin: modelParams.selectedPlugin,
      role: 'user',
      sequence_number: sequence,
      image_paths: imagePaths,
      citations: [],
      attachments: [],
    };
    messagesToInsert.push(userMessageData);
  }

  if (modelParams.isContinuation || modelParams.isTerminalContinuation) {
    const updatedAssistantMessage = await updateLastAssistantMessage(
      supabase,
      chatId,
      {
        assistantMessage,
        thinkingText,
        thinkingElapsedSecs,
        citations,
        fileAttachments,
      },
    );

    return {
      success: true,
      sequence: updatedAssistantMessage.sequence_number,
      userMessage: null,
      assistantMessage: updatedAssistantMessage,
    };
  }

  const assistantMessageData: TablesInsert<'messages'> = {
    chat_id: chatId,
    user_id: userId,
    content: assistantMessage || '',
    thinking_content: thinkingText || null,
    thinking_enabled: thinkingEnabled,
    thinking_elapsed_secs: thinkingElapsedSecs || null,
    model,
    plugin: modelParams.selectedPlugin,
    role: 'assistant',
    sequence_number: shouldSaveUserMessage ? sequence + 1 : sequence,
    image_paths: [],
    citations: citations || [],
    attachments: fileAttachments || [],
  };
  messagesToInsert.push(assistantMessageData);

  // Insert messages
  const createdMessages = await insertMessages(supabase, messagesToInsert);

  const savedAssistantMessage = createdMessages[createdMessages.length - 1];
  const savedUserMessage = shouldSaveUserMessage ? createdMessages[0] : null;

  // Handle image relationships if we saved the user message
  if (shouldSaveUserMessage && savedUserMessage) {
    const imageContents = Array.isArray(lastUserMessage.content)
      ? lastUserMessage.content.filter((item) => item.type === 'image_url')
      : [];

    if (imageContents.length > 0) {
      const imagePaths = imageContents.map(
        (imageContent) => imageContent.image_url.url,
      );

      if (imagePaths.length > 0) {
        await insertImageRelationships(
          supabase,
          userId,
          savedUserMessage.id,
          imagePaths,
        );
      }
    }

    // Handle file items if there are any
    if (retrievedFileItems && retrievedFileItems.length > 0) {
      await insertFileItemRelationships(
        supabase,
        userId,
        savedUserMessage.id,
        retrievedFileItems,
      );
    }
  }

  return {
    success: true,
    sequence,
    userMessage: savedUserMessage,
    assistantMessage: savedAssistantMessage,
  };
}
