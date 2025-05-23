import {
  toVercelChatMessages,
  validateWebSearchMessages,
} from '@/lib/ai/message-utils';
import PostHogClient from '@/app/posthog';
import type { ChatMetadata, LLMID, ModelParams } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  generateTitleFromUserMessage,
  handleFinalChatAndAssistantMessage,
} from '@/lib/ai/actions';
import { removePdfContentFromMessages } from '@/lib/build-prompt-backend';
import { ChatSDKError } from '@/lib/errors';

interface DeepResearchConfig {
  messages: any[];
  profile: any;
  dataStream: any;
  modelParams: ModelParams;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
  userCountryCode: string | null;
  originalMessages: any[];
  systemPrompt: string;
  initialChatPromise: Promise<void>;
}

interface DeepResearchResponse {
  id: string;
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  citations: string[];
  object: string;
  choices: Array<{
    index: number;
    finish_reason: string | null;
    message?: {
      role: string;
      content: string;
    };
    delta?: {
      role?: string;
      content?: string;
    };
  }>;
}

interface StreamDelta {
  type: 'text-delta' | 'citations' | 'reasoning' | 'thinking-time';
  textDelta?: string;
  citations?: string[];
  content?: string;
  elapsed_secs?: number | null;
}

async function* streamDeepResearchResponse(
  response: Response,
  dataStream: any,
): AsyncGenerator<StreamDelta> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';
  let citationsSent = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;

          try {
            const parsed: DeepResearchResponse = JSON.parse(data);

            // Handle citations from the first message
            if (!citationsSent && parsed.citations?.length > 0) {
              yield { type: 'citations', citations: parsed.citations };
              citationsSent = true;
            }

            // Handle content from delta
            const delta = parsed.choices[0]?.delta;
            if (delta?.content) {
              const content = delta.content;

              if (content.includes('<think>')) {
                dataStream.isThinking = true;
                dataStream.thinkingStartTime = Date.now();

                const [beforeThink, thinkingContent] = content.split('<think>');
                if (beforeThink) {
                  yield { type: 'text-delta', textDelta: beforeThink };
                }
                if (thinkingContent) {
                  yield { type: 'reasoning', content: thinkingContent };
                }
                continue;
              }

              if (dataStream.isThinking) {
                if (content.includes('</think>')) {
                  const thinkingElapsedSecs = calculateThinkingElapsedSecs(
                    true,
                    dataStream.thinkingStartTime,
                  );

                  dataStream.isThinking = false;

                  const [finalThinking, afterThink] = content.split('</think>');
                  if (finalThinking) {
                    yield { type: 'reasoning', content: finalThinking };
                  }

                  yield {
                    type: 'thinking-time',
                    elapsed_secs: thinkingElapsedSecs,
                  };

                  if (afterThink) {
                    yield { type: 'text-delta', textDelta: afterThink };
                  }
                } else {
                  yield { type: 'reasoning', content };
                }
              } else {
                yield { type: 'text-delta', textDelta: content };
              }
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function getResponseBody(response: Response): Promise<string> {
  try {
    const clone = response.clone();
    const text = await clone.text();
    return text;
  } catch (e) {
    return 'Unable to read response body';
  }
}

async function makeDeepResearchRequest(payload: any, abortSignal: AbortSignal) {
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: abortSignal,
  });

  if (!response.ok) {
    const responseBody = await getResponseBody(response);
    let errorData;
    try {
      errorData = JSON.parse(responseBody);
    } catch (e) {
      // If parsing fails, create a ChatSDKError with the raw response body
      throw new ChatSDKError('bad_request:api', responseBody);
    }
    return { error: errorData, response };
  }

  return { response };
}

function calculateThinkingElapsedSecs(
  isThinking: boolean,
  thinkingStartTime: number | null,
): number | null {
  return isThinking && thinkingStartTime
    ? Math.round((Date.now() - thinkingStartTime) / 1000)
    : null;
}

export async function executeDeepResearchTool({
  config,
}: {
  config: DeepResearchConfig;
}) {
  if (!process.env.PERPLEXITY_API_KEY) {
    throw new Error('Perplexity API key is not set for deep research');
  }

  const {
    messages,
    profile,
    dataStream,
    modelParams,
    chatMetadata,
    supabase,
    userCountryCode,
    abortSignal,
    model,
    originalMessages,
    systemPrompt,
    initialChatPromise,
  } = config;

  // Filter out PDF content from messages
  const filteredMessages = removePdfContentFromMessages(messages);

  // Validate messages for proper alternating roles
  const validatedMessages = validateWebSearchMessages(filteredMessages);

  const posthog = PostHogClient();
  if (posthog) {
    posthog.capture({
      distinctId: profile.user_id,
      event: 'deep_research_executed',
    });
  }

  dataStream.writeData({
    type: 'tool-call',
    content: 'deep-research',
  });

  let generatedTitle: string | undefined;
  let assistantMessage = '';
  let reasoning = '';
  const citations: string[] = [];
  dataStream.isThinking = false;
  dataStream.thinkingStartTime = null;
  let finalThinkingTime: number | null = null;

  try {
    await Promise.all([
      (async () => {
        const requestPayload = {
          model: 'sonar-deep-research',
          system: systemPrompt,
          messages: toVercelChatMessages(validatedMessages),
          stream: true,
          max_tokens: 8192,
          web_search_options: {
            search_context_size: 'medium',
            ...(userCountryCode && {
              user_location: { country: userCountryCode },
            }),
          },
        };

        let { response, error } = await makeDeepResearchRequest(
          requestPayload,
          abortSignal,
        );

        // If we get a country code error, retry without user location
        if (error?.error?.type === 'invalid_country_code') {
          const retryPayload = {
            ...requestPayload,
            web_search_options: { search_context_size: 'medium' },
          };
          ({ response, error } = await makeDeepResearchRequest(
            retryPayload,
            abortSignal,
          ));
        }

        if (error) {
          console.error('[DeepResearch] Error Details:', {
            status: response.status,
            statusText: response.statusText,
            requestPayload: {
              model: requestPayload.model,
              messageCount: requestPayload.messages.length,
            },
            responseBody: error,
            headers: Object.fromEntries(response.headers.entries()),
          });
          throw new Error(
            `Deep research failed: ${response.status} ${response.statusText}`,
          );
        }

        let hasFirstTextDelta = false;

        for await (const delta of streamDeepResearchResponse(
          response,
          dataStream,
        )) {
          if (delta.type === 'citations' && delta.citations) {
            citations.push(...delta.citations);
          }

          if (delta.type === 'text-delta' && delta.textDelta) {
            if (!hasFirstTextDelta) {
              dataStream.writeData({ citations });
              hasFirstTextDelta = true;
            }

            assistantMessage += delta.textDelta;
            dataStream.writeData({
              type: 'text-delta',
              content: delta.textDelta,
            });
          } else if (delta.type === 'reasoning' && delta.content) {
            reasoning += delta.content;
            dataStream.writeData({
              type: 'reasoning',
              content: delta.content,
            });
          } else if (
            delta.type === 'thinking-time' &&
            delta.elapsed_secs !== undefined
          ) {
            finalThinkingTime = delta.elapsed_secs;
            dataStream.writeData({
              type: 'thinking-time',
              elapsed_secs: delta.elapsed_secs,
            });
          }
        }

        if (supabase) {
          // Wait for initial chat handling to complete before final handling
          await initialChatPromise;

          await handleFinalChatAndAssistantMessage({
            supabase,
            modelParams,
            chatMetadata,
            profile,
            model,
            messages: originalMessages,
            finishReason: 'stop',
            title: generatedTitle,
            assistantMessage,
            citations,
            thinkingText: reasoning || undefined,
            thinkingElapsedSecs: finalThinkingTime,
          });
        }
      })(),
      (async () => {
        if (chatMetadata.id && chatMetadata.newChat) {
          generatedTitle = await generateTitleFromUserMessage({
            messages: originalMessages,
            abortSignal,
          });
          dataStream.writeData({ chatTitle: generatedTitle });
        }
      })(),
    ]);

    return 'Deep research completed';
  } catch (error) {
    if (!(error instanceof Error && error.message === 'terminated')) {
      console.error('[DeepResearch] Error:', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
    throw error;
  }
}
