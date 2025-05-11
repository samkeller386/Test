import { PluginID } from '@/types/plugins';
import { executeReasonLLMTool } from '@/lib/ai/tools/reason-llm';
import { createStreamResponse } from '@/lib/ai-helper';
import type { ChatMetadata, BuiltChatMessage, LLMID } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

interface ToolHandlerConfig {
  messages: BuiltChatMessage[];
  profile: any;
  selectedPlugin: PluginID;
  isLargeModel: boolean;
  abortSignal: AbortSignal;
  chatMetadata: ChatMetadata;
  model: LLMID;
  supabase: SupabaseClient | null;
}

export async function handleToolExecution(config: ToolHandlerConfig) {
  const {
    messages,
    profile,
    selectedPlugin,
    isLargeModel,
    abortSignal,
    chatMetadata,
    model,
    supabase,
  } = config;

  switch (selectedPlugin) {
    case PluginID.REASONING:
      return createStreamResponse(async (dataStream) => {
        await executeReasonLLMTool({
          config: {
            messages,
            profile,
            dataStream,
            isLargeModel,
            abortSignal,
            chatMetadata,
            model,
            supabase,
          },
        });
      });
  }

  return null;
}
