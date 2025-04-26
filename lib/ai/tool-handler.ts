import { PluginID } from '@/types/plugins';
import { executeTerminalAgent } from '@/lib/ai/tools/terminal-agent';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { createStreamResponse } from '@/lib/ai-helper';
import type {
  ChatMetadata,
  BuiltChatMessage,
  LLMID,
  ModelParams,
} from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ToolHandlerConfig {
  model: LLMID;
  messages: BuiltChatMessage[];
  modelParams: ModelParams;
  chatMetadata: ChatMetadata;
  profile: any;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  supabase: SupabaseClient | null;
  isPremiumUser: boolean;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    model,
    messages,
    modelParams,
    chatMetadata,
    profile,
    isLargeModel,
    abortSignal,
    supabase,
    isPremiumUser,
  } = config;

  switch (modelParams.selectedPlugin) {
    case PluginID.REASONING:
      return createStreamResponse(async (dataStream) => {
        await executeReasonLLMTool({
          config: {
            messages,
            modelParams,
            chatMetadata,
            profile,
            dataStream,
            abortSignal,
            model,
            supabase,
            isLargeModel,
          },
        });
      });

    default:
      if (
        modelParams.isTerminalContinuation ||
        modelParams.confirmTerminalCommand ||
        modelParams.selectedPlugin === PluginID.TERMINAL
      ) {
        return createStreamResponse(async (dataStream) => {
          await executeTerminalAgent({
            config: {
              messages,
              modelParams,
              chatMetadata,
              profile,
              dataStream,
              abortSignal,
              model,
              supabase,
              isPremiumUser,
            },
          });
        });
      }
  }

  return null;
}
