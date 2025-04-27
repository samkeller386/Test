import { CONTINUE_PROMPT } from '@/lib/models/llm-prompting';
import { lastSequenceNumber } from '@/lib/utils';
import type { ChatMessage, LLMID } from '@/types';
import { PluginID } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export const createTempMessages = ({
  messageContent,
  chatMessages,
  b64Images,
  isContinuation,
  selectedPlugin,
  model,
}: {
  messageContent: string | null;
  chatMessages: ChatMessage[];
  b64Images: string[];
  isContinuation: boolean;
  selectedPlugin: PluginID | null;
  model: LLMID;
}) => {
  const messageContentInternal = isContinuation
    ? CONTINUE_PROMPT
    : messageContent || CONTINUE_PROMPT;

  const tempUserChatMessage: ChatMessage = {
    message: {
      chat_id: '',
      content: messageContentInternal,
      reasoning: null,
      model,
      plugin: selectedPlugin,
      provider_metadata:
        selectedPlugin === PluginID.REASONING
          ? {
              thinking_enabled: true,
              thinking_elapsed_secs: null,
              citations: [],
            }
          : {},
      role: 'user',
      sequence_number: lastSequenceNumber(chatMessages) + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      id: uuidv4(),
      image_paths: b64Images,
      user_id: '',
      attachments: [],
    },
    fileItems: [],
  };

  const tempAssistantChatMessage: ChatMessage = {
    message: {
      chat_id: '',
      content: '',
      reasoning: null,
      model,
      plugin: selectedPlugin,
      provider_metadata:
        selectedPlugin === PluginID.REASONING
          ? {
              thinking_enabled: true,
              thinking_elapsed_secs: null,
              citations: [],
            }
          : {},
      role: 'assistant',
      sequence_number: lastSequenceNumber(chatMessages) + 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      id: uuidv4(),
      image_paths: [],
      user_id: '',
      attachments: [],
    },
    fileItems: [],
  };

  return {
    tempUserChatMessage,
    tempAssistantChatMessage,
  };
};
