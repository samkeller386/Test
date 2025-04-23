import type {
  BuiltChatMessage,
  ChatMessage,
  ChatPayload,
  MessageImage,
  LLMID,
} from '@/types';
import { countTokens } from 'gpt-tokenizer';
import { SmallModel, LargeModel } from './models/hackerai-llm-list';
import { toast } from 'sonner';

// Helper function to find the last user message
function findLastUserMessage(
  chatMessages: ChatMessage[],
): ChatMessage | undefined {
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i].message.role === 'user') {
      return chatMessages[i];
    }
  }
  return undefined;
}

export async function buildFinalMessages(
  payload: ChatPayload,
  model: LLMID,
  chatImages: MessageImage[],
): Promise<BuiltChatMessage[]> {
  const { chatMessages, retrievedFileItems } = payload;

  let CHUNK_SIZE = 12000;
  if (model === LargeModel.modelId) {
    CHUNK_SIZE = 32000;
  } else if (model === SmallModel.modelId) {
    CHUNK_SIZE = 12000;
  }

  let remainingTokens = CHUNK_SIZE;

  // Find the last user message
  const lastUserMessage = findLastUserMessage(chatMessages);
  if (!lastUserMessage) {
    throw new Error('No user message found in chat');
  }

  const lastUserMessageContent = Array.isArray(lastUserMessage.message.content)
    ? lastUserMessage.message.content
        .map((item) => (item.type === 'text' ? item.text : ''))
        .join(' ')
    : lastUserMessage.message.content;
  const lastUserMessageTokens = countTokens(lastUserMessageContent);

  if (lastUserMessageTokens > CHUNK_SIZE) {
    const errorMessage =
      'The message you submitted was too long, please submit something shorter.';
    toast.error(errorMessage);
    throw new Error(errorMessage);
  }

  const truncatedMessages: any[] = [];

  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const message = chatMessages[i].message;
    const fileItems = chatMessages[i].fileItems;
    const isLastUserMessage = chatMessages[i] === lastUserMessage;

    let messageTokens = countTokens(message.content);

    // Add tokens from file items if they exist
    if (fileItems && fileItems.length > 0) {
      messageTokens += fileItems.reduce(
        (acc, item) => acc + (item.tokens || 0),
        0,
      );
    }

    // Add tokens from retrieved file items for the last user message
    if (
      isLastUserMessage &&
      retrievedFileItems &&
      retrievedFileItems.length > 0
    ) {
      messageTokens += retrievedFileItems.reduce(
        (acc, item) => acc + (item.tokens || 0),
        0,
      );
    }

    if (messageTokens <= remainingTokens) {
      remainingTokens -= messageTokens;
      truncatedMessages.unshift({
        ...message,
        // Transform fileItems to attachments format
        ...(fileItems && fileItems.length > 0
          ? {
              attachments: fileItems.map((item) => ({ file_id: item.file_id })),
            }
          : {}),
        // Add retrievedFileItems to last user message if they exist
        ...(isLastUserMessage &&
        retrievedFileItems &&
        retrievedFileItems.length > 0
          ? {
              attachments: [
                ...(fileItems || []).map((item) => ({ file_id: item.file_id })),
                ...retrievedFileItems.map((item) => ({
                  file_id: item.file_id,
                })),
              ],
            }
          : {}),
      });
    } else {
      break;
    }
  }

  const finalMessages: BuiltChatMessage[] = truncatedMessages.map((message) => {
    let content;

    if (
      message.image_paths &&
      message.image_paths.length > 0 &&
      message.role !== 'assistant'
    ) {
      content = [
        {
          type: 'text',
          text: message.content,
        },
        ...message.image_paths.map((path: string) => {
          let formedUrl = '';

          if (path.startsWith('data')) {
            formedUrl = path;
          } else {
            const chatImage = chatImages.find((image) => image.path === path);

            if (chatImage) {
              formedUrl = chatImage.base64;
            }
          }

          return {
            type: 'image_url',
            image_url: {
              url: formedUrl,
            },
          };
        }),
      ];
    } else {
      content = message.content;
    }

    return {
      role: message.role,
      content,
      ...(message.attachments ? { attachments: message.attachments } : {}),
    };
  });

  return finalMessages;
}
