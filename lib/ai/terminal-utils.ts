import { encode, decode } from 'gpt-tokenizer';
import { PluginID } from '@/types/plugins';

const STREAM_MAX_TOKENS = 2048;
const AGENT_MAX_TOKENS = 32000;

export async function streamTerminalOutput(
  terminalStream: ReadableStream<Uint8Array>,
  enqueueChunk: (chunk: string) => void,
): Promise<string> {
  const reader = terminalStream.getReader();
  let terminalOutput = '';
  let truncationMessageSent = false;
  const maxTokens = STREAM_MAX_TOKENS;
  let currentTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = new TextDecoder().decode(value);
    const newTokens = encode(chunk).length;

    if (currentTokens >= maxTokens) {
      if (!truncationMessageSent) {
        enqueueChunk('...\n\n[Output truncated because too long]\n```');
        truncationMessageSent = true;
      }
      continue;
    }

    const remainingTokens = maxTokens - currentTokens;
    if (newTokens > remainingTokens) {
      // Truncate the chunk to fit within remaining tokens
      const tokens = encode(chunk);
      const truncatedTokens = tokens.slice(0, remainingTokens);
      const truncatedChunk = decode(truncatedTokens);

      enqueueChunk(truncatedChunk);
      terminalOutput += truncatedChunk;
      currentTokens += truncatedTokens.length;

      if (!truncationMessageSent) {
        enqueueChunk('...\n\n[Output truncated because too long]\n```');
        truncationMessageSent = true;
      }
    } else {
      enqueueChunk(chunk);
      terminalOutput += chunk;
      currentTokens += newTokens;
    }
  }

  return terminalOutput;
}

export function reduceTerminalOutput(output: string): string {
  const tokens = encode(output);
  if (tokens.length > AGENT_MAX_TOKENS) {
    const initial = tokens.slice(0, AGENT_MAX_TOKENS);
    return `${decode(initial)}...\n\n[Output truncated because too long]\n\`\`\``;
  }
  return output;
}

export const terminalPlugins = [
  PluginID.WAF_DETECTOR,
  PluginID.WHOIS_LOOKUP,
  PluginID.SUBDOMAIN_FINDER,
];
