import { tool } from 'ai';
import { z } from 'zod';
import type { ToolContext } from './types';
import { executeTerminalCommand } from '@/lib/ai/tools/agent/terminal-executor';
import { streamTerminalOutput } from '@/lib/ai/terminal-utils';

/**
 * Creates a terminal tool for executing commands in the sandbox environment
 * @param context - The context needed for tool execution
 * @returns The terminal tool
 */
export const createShellExecTool = (context: ToolContext) => {
  const { writer, userID, sandboxManager } = context;

  return tool({
    description:
      'Execute commands in the sandbox environment. Use for running code, installing packages, or managing files.',
    inputSchema: z.object({
      exec_dir: z
        .string()
        .describe(
          'Working directory for command execution (must use absolute path)',
        ),
      command: z.string().describe('Shell command to execute'),
    }),
    execute: async (args) => {
      const { exec_dir, command } = args as {
        exec_dir: string;
        command: string;
      };

      if (!sandboxManager) {
        throw new Error('Sandbox manager not initialized');
      }

      // Get sandbox from manager
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

      writer.write({
        type: 'data',

        value: [
          {
            type: 'text',
            content: `<pgptml:terminal_command exec-dir="${exec_dir}">${command}</pgptml:terminal_command>`,
          },
        ],
      });

      // Execute command
      const terminalStream = await executeTerminalCommand({
        userID,
        command,
        exec_dir,
        sandbox,
      });

      const terminalOutput = await streamTerminalOutput(terminalStream, writer);
      return terminalOutput;
    },
  });
};
