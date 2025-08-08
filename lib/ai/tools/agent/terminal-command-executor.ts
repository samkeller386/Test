import { executeTerminalCommand } from '@/lib/ai/tools/agent/terminal-executor';
import { streamTerminalOutput } from '@/lib/ai/terminal-utils';
import type { SandboxManager } from './types';

interface TerminalCommandExecutorConfig {
  userID: string;
  writer: any;
  sandboxManager: SandboxManager;
  messages: any[];
}

export async function executeTerminalCommandWithConfig({
  userID,
  writer,
  sandboxManager,
  messages,
}: TerminalCommandExecutorConfig) {
  const lastAssistantMessageContent = messages[messages.length - 2]?.content;
  const isConfirmedCommand =
    lastAssistantMessageContent?.includes('<terminal-command');

  if (!isConfirmedCommand) {
    return { messages, output: null };
  }

  const confirmedCommandRegex =
    /<terminal-command(?:\s+exec-dir="([^"]*)")?>([\s\S]*?)<\/terminal-command>/g;

  const matches = Array.from(
    lastAssistantMessageContent.matchAll(confirmedCommandRegex),
  );
  const lastMatch = matches[matches.length - 1] as RegExpMatchArray | undefined;

  if (!lastMatch) {
    return { messages, output: null };
  }

  const [, exec_dir, command] = lastMatch;

  const { sandbox } = await sandboxManager.getSandbox();

  writer.write({
    type: 'data',

    value: [
      {
        type: 'agent-status',
        content: 'terminal',
      },
    ],
  });

  const terminalStream = await executeTerminalCommand({
    userID,
    command,
    exec_dir,
    sandbox,
  });

  const terminalOutput = await streamTerminalOutput(terminalStream, writer);

  const updatedMessages = [...messages];
  const lastMessage = updatedMessages[updatedMessages.length - 1];
  if (lastMessage) {
    lastMessage.content = `${lastMessage.content || ''}\n\n${terminalOutput}`;
  }

  return { messages: updatedMessages };
}
