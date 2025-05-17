import { createMessages, deleteMessage, updateMessage } from '@/db/messages';
import { lastSequenceNumber } from '@/lib/utils';
import type { Tables, TablesInsert } from '@/supabase/types';
import type {
  ChatMessage,
  LLM,
  MessageImage,
  FileAttachment,
  PluginID,
} from '@/types';
import { toast } from 'sonner';
import { v4 as uuidv4 } from 'uuid';
import { convertToJsonAttachments } from '@/lib/utils/type-converters';

export const handleCreateMessages = async (
  chatMessages: ChatMessage[],
  currentChat: Tables<'chats'> | null,
  profile: Tables<'profiles'>,
  modelData: LLM,
  messageContent: string | null,
  generatedText: string,
  newMessageImages: MessageImage[],
  isRegeneration: boolean,
  isContinuation: boolean,
  retrievedFileItems: Tables<'file_items'>[],
  setMessages: (messages: ChatMessage[]) => void,
  selectedPlugin: PluginID,
  editSequenceNumber?: number,
  isTemporary = false,
  citations?: string[],
  thinkingText?: string,
  thinkingElapsedSecs?: number | null,
  newChatFiles?: { id: string }[],
  setChatFiles?: React.Dispatch<React.SetStateAction<Tables<'files'>[]>>,
  fileAttachments?: FileAttachment[],
) => {
  try {
    const isEdit = editSequenceNumber !== undefined;

    // Create user message for UI state
    const userMessage: ChatMessage = {
      message: {
        id: isEdit
          ? chatMessages.find(
              (msg) => msg.message.sequence_number === editSequenceNumber,
            )?.message.id || uuidv4()
          : uuidv4(),
        chat_id: currentChat?.id || '',
        content: messageContent || '',
        thinking_content: null,
        thinking_enabled: modelData.modelId === 'reasoning-model',
        thinking_elapsed_secs: null,
        role: 'user',
        model: modelData.modelId,
        plugin: selectedPlugin,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sequence_number: lastSequenceNumber(chatMessages) + 1,
        user_id: profile.user_id,
        image_paths: newMessageImages.map((image) => image.path),
        attachments: [],
        citations: [],
      },
      fileItems: isEdit
        ? chatMessages.find(
            (msg) => msg.message.sequence_number === editSequenceNumber,
          )?.fileItems || []
        : retrievedFileItems,
    };

    // If it's a temporary chat, don't create messages in the database
    if (isTemporary || !currentChat) {
      const tempAssistantMessage: ChatMessage = {
        message: {
          id: uuidv4(),
          chat_id: '',
          content: generatedText,
          thinking_content: thinkingText || null,
          thinking_enabled: modelData.modelId === 'reasoning-model',
          thinking_elapsed_secs: thinkingElapsedSecs || null,
          model: modelData.modelId,
          plugin: selectedPlugin,
          role: 'assistant',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          sequence_number: lastSequenceNumber(chatMessages) + 2,
          user_id: profile.user_id,
          image_paths: [],
          citations: citations || [],
          attachments: fileAttachments
            ? convertToJsonAttachments(fileAttachments)
            : [],
        },
        fileItems: [],
      };

      setMessages([...chatMessages, userMessage, tempAssistantMessage]);
      return;
    }

    const finalAssistantMessage: TablesInsert<'messages'> = {
      chat_id: currentChat.id,
      user_id: profile.user_id,
      content: generatedText,
      thinking_content: thinkingText || null,
      thinking_enabled: modelData.modelId === 'reasoning-model',
      thinking_elapsed_secs: thinkingElapsedSecs || null,
      model: modelData.modelId,
      plugin: selectedPlugin,
      role: 'assistant',
      sequence_number: lastSequenceNumber(chatMessages) + 2,
      image_paths: [],
      citations: citations || [],
      attachments: fileAttachments
        ? convertToJsonAttachments(fileAttachments)
        : [],
    };

    let finalChatMessages: ChatMessage[] = [];

    if (isRegeneration) {
      const lastMessageId = chatMessages[chatMessages.length - 1].message.id;
      await deleteMessage(lastMessageId);

      const createdMessages = await createMessages(
        [finalAssistantMessage],
        [],
        userMessage.message.id,
        setChatFiles,
      );

      finalChatMessages = [
        ...chatMessages.slice(0, -1),
        {
          message: createdMessages[0],
          fileItems: retrievedFileItems,
        },
      ];

      setMessages(finalChatMessages);
    } else if (isContinuation) {
      const lastStartingMessage = chatMessages[chatMessages.length - 1].message;

      // Get existing attachments and append new ones
      const existingAttachments = lastStartingMessage.attachments || [];
      const newAttachments = fileAttachments
        ? convertToJsonAttachments(fileAttachments)
        : [];
      const combinedAttachments = [...existingAttachments, ...newAttachments];

      const updatedMessage = await updateMessage(lastStartingMessage.id, {
        content: lastStartingMessage.content + generatedText,
        attachments: combinedAttachments,
      });

      chatMessages[chatMessages.length - 1].message = updatedMessage;

      finalChatMessages = [...chatMessages];

      setMessages(finalChatMessages);
    } else {
      try {
        const createdMessages = await createMessages(
          [finalAssistantMessage],
          newChatFiles || [],
          userMessage.message.id,
          setChatFiles,
        );

        finalChatMessages = [
          ...(isEdit
            ? chatMessages.filter(
                (chatMessage) =>
                  chatMessage.message.sequence_number < editSequenceNumber,
              )
            : chatMessages),
          userMessage,
          {
            message: createdMessages[0],
            fileItems: [],
          },
        ];

        setMessages(finalChatMessages);
      } catch (error: any) {
        if (
          error.message.includes('chats') &&
          error.message.includes('23503')
        ) {
          toast.error('Error creating messages. Please try again.');
          console.error('Foreign key constraint error:', error);
          return;
        }
        throw error;
      }
    }
  } catch (error: any) {
    console.error('Error in handleCreateMessages:', error);
    toast.error('Error creating messages. Please try again.');
  }
};
