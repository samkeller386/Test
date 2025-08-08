import { getSystemPrompt } from '@/lib/ai/prompts';
import { toVercelChatMessages } from '@/lib/ai/message-utils';
import { stepCountIs, streamText } from 'ai';
import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID, RateLimitInfo, ModelParams } from '@/types';
import {
  handleFinalChatAndAssistantMessage,
  generateTitleFromUserMessage,
} from '@/lib/ai/actions';
import { myProvider } from '../providers';
import { v4 as uuidv4 } from 'uuid';
import type { Doc } from '@/convex/_generated/dataModel';
import { createToolSchemas } from './toolSchemas';

interface ReasonLLMConfig {
  chat: Doc<'chats'> | null;
  messages: any[];
  profile: any;
  modelParams: ModelParams;
  writer: any;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  rateLimitInfo: RateLimitInfo;
  initialChatPromise: Promise<void>;
}

async function getProviderConfig(profile: any) {
  const selectedModel = 'chat-model-reasoning';
  const systemPrompt = getSystemPrompt({
    selectedChatModel: selectedModel,
    profileContext: profile.profile_context,
  });

  return {
    systemPrompt,
    model: myProvider.languageModel(selectedModel),
  };
}

export async function executeReasonLLMTool({
  config,
}: {
  config: ReasonLLMConfig;
}) {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OpenRouter API key is not set for reason LLM');
  }

  const {
    chat,
    messages,
    modelParams,
    profile,
    writer,
    abortSignal,
    chatMetadata,
    model,
    initialChatPromise,
  } = config;
  const { systemPrompt, model: selectedModel } =
    await getProviderConfig(profile);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'reason_llm_executed',
    });
  }

  writer.write({
    type: 'data',

    value: [
      {
        type: 'ratelimit',
        content: config.rateLimitInfo,
      },
    ],
  });

  let generatedTitle: string | undefined;
  let thinkingStartTime: number | null = null;
  let isThinking = false;
  const assistantMessageId = uuidv4();
  let titleGenerationPromise: Promise<void> | null = null;
  const citations: string[] = [];
  let assistantMessage = '';
  let reasoningText = '';

  abortSignal.addEventListener('abort', async () => {
    console.log('reason llm request aborted');

    // Save the assistant message if we have content and chat context
    if (
      (assistantMessage.trim() || reasoningText.trim()) &&
      (chat || chatMetadata.id)
    ) {
      try {
        // Wait for initial chat handling to complete if it's in progress
        await initialChatPromise;

        // Calculate thinking elapsed time if we were thinking
        let thinkingElapsedSecs = null;
        if (isThinking && thinkingStartTime) {
          thinkingElapsedSecs = Math.round(
            (Date.now() - thinkingStartTime) / 1000,
          );
        }

        // Deduplicate citations
        const uniqueCitations =
          citations.length > 0 ? [...new Set(citations)] : undefined;

        await handleFinalChatAndAssistantMessage({
          modelParams,
          chatMetadata,
          profile,
          model,
          chat,
          finishReason: 'stop',
          title: generatedTitle,
          assistantMessage,
          citations: uniqueCitations,
          thinkingText: reasoningText || undefined,
          thinkingElapsedSecs,
          assistantMessageId,
        });

        console.log('Reason LLM assistant message saved on abort');
      } catch (error) {
        console.error(
          'Failed to save reason LLM assistant message on abort:',
          error,
        );
      }
    }
  });

  try {
    // Start title generation if needed
    if (chatMetadata.id && !chat) {
      titleGenerationPromise = (async () => {
        generatedTitle = await generateTitleFromUserMessage({
          messages,
          abortSignal: config.abortSignal,
        });
        writer.write({
          type: 'data',
          value: [{ chatTitle: generatedTitle }],
        });
      })();
    }

    const result = streamText({
      model: selectedModel,
      providerOptions: {
        xai: { reasoningEffort: 'high' },
      },
      system: systemPrompt,
      messages: toVercelChatMessages(messages),
      maxOutputTokens: 8192,
      abortSignal,
      stopWhen: stepCountIs(5),
      tools: createToolSchemas({
        profile,
        writer,
        abortSignal,
      }).getSelectedSchemas(['webSearch', 'browser']),
      onChunk: async (chunk) => {
        if (chunk.chunk.type === 'text-delta') {
          assistantMessage += chunk.chunk.text;
        } else if (chunk.chunk.type === 'tool-call') {
          writer.write({
            type: 'data',

            value: [
              {
                type: 'agent-status',
                content: 'none',
              },
            ],
          });

          writer.write({
            type: 'data',

            value: [
              {
                type: 'reasoning',
                content: '\n\n',
              },
            ],
          });

          writer.write({
            type: 'data',

            value: [
              {
                type: 'text',
                content: '\n\n',
              },
            ],
          });
        } else if (chunk.chunk.type === 'tool-result') {
          // Handle tool results and extract citations
          const { toolName, output } = chunk.chunk;

          if (
            toolName === 'browser' &&
            output &&
            typeof output === 'object' &&
            'url' in output
          ) {
            // For browser tool, add the URL as citation
            citations.push(output.url as string);
          } else if (toolName === 'webSearch' && Array.isArray(output)) {
            // For web search tool, extract URLs from results
            const searchCitations = output
              .map((item: any) => item.url)
              .filter((url: string) => url);

            citations.push(...searchCitations);
          }
        } else if (chunk.chunk.type === 'reasoning-delta') {
          reasoningText += chunk.chunk.text;
          if (!isThinking) {
            isThinking = true;
            thinkingStartTime = Date.now();
          }
        }
      },
      onError: async (error) => {
        console.error('[ReasonLLM] Stream Error:', error);
      },
      onFinish: async ({
        finishReason,
        text,
        reasoningText,
      }: {
        finishReason: string;
        text: string;
        reasoningText: string | undefined;
      }) => {
        let thinkingElapsedSecs = null;
        if (isThinking && thinkingStartTime) {
          isThinking = false;
          thinkingElapsedSecs = Math.round(
            (Date.now() - thinkingStartTime) / 1000,
          );
          writer.write({
            type: 'data',

            value: [
              {
                type: 'thinking-time',
                elapsed_secs: thinkingElapsedSecs,
              },
            ],
          });
        }

        // Wait for both title generation and initial chat handling to complete
        await Promise.all([titleGenerationPromise, initialChatPromise]);

        // Deduplicate citations
        const uniqueCitations =
          citations.length > 0 ? [...new Set(citations)] : undefined;

        await handleFinalChatAndAssistantMessage({
          modelParams,
          chatMetadata,
          profile,
          model,
          chat,
          finishReason,
          title: generatedTitle,
          assistantMessage: text,
          citations: uniqueCitations,
          thinkingText: reasoningText || undefined,
          thinkingElapsedSecs,
          assistantMessageId,
        });
      },
    });

    result.toUIMessageStreamResponse({
      generateMessageId: () => assistantMessageId,
    });

    return 'Reason LLM execution completed';
  } catch (error) {
    // Skip logging for terminated errors
    if (!(error instanceof Error && error.message === 'terminated')) {
      console.error('[ReasonLLM] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        model,
      });
    }
    throw error;
  }
}
