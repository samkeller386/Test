import type { ContentBlock } from './types';

export const parseContent = (content: string): ContentBlock[] => {
  const blocks: ContentBlock[] = [];
  const blockRegex =
    /((?:<terminal-command[^>]*>[\s\S]*?<\/terminal-command>|```terminal\n[\s\S]*?```|<file-content[^>]*>[\s\S]*?<\/file-content>|<file-write[^>]*>[\s\S]*?<\/file-write>|<shell-wait[^>]*>[\s\S]*?<\/shell-wait>|<ask-terminal-command[^>]*>[\s\S]*?<\/ask-terminal-command>|<confirmed-terminal-command[^>]*>[\s\S]*?<\/confirmed-terminal-command>)(?:\n```(?:stdout)[\s\S]*?(?:```|$))*(?:\s*<terminal-error>[\s\S]*?<\/terminal-error>)?)/g;
  const terminalXmlRegex =
    /<terminal-command(?:\s+[^>]*)?>([\s\S]*?)<\/terminal-command>/;
  const confirmedTerminalXmlRegex =
    /<confirmed-terminal-command(?:\s+[^>]*)?>([\s\S]*?)<\/confirmed-terminal-command>/;
  const terminalMarkdownRegex = /```terminal\n([\s\S]*?)```/;
  const fileContentRegex =
    /<file-content(?:\s+path="([^"]*)")?>([\s\S]*?)<\/file-content>/;
  const fileWriteRegex =
    /<file-write(?:\s+file="([^"]*)")?>([\s\S]*?)<\/file-write>/;
  const shellWaitRegex = /<shell-wait[^>]*>([\s\S]*?)<\/shell-wait>/;
  const askTerminalCommandRegex =
    /<ask-terminal-command(?:\s+exec-dir="([^"]*)")?>([\s\S]*?)<\/ask-terminal-command>/;
  const stdoutRegex = /```stdout\n([\s\S]*?)(?:```|$)/;
  const errorRegex = /<terminal-error>([\s\S]*?)<\/terminal-error>/;
  const execDirRegex = /exec-dir="([^"]*)"/;

  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: 'text',
        content: content.slice(lastIndex, match.index).trim(),
      });
    }

    const block = match[1];
    const terminalXmlMatch = block.match(terminalXmlRegex);
    const confirmedTerminalXmlMatch = block.match(confirmedTerminalXmlRegex);
    const terminalMarkdownMatch = block.match(terminalMarkdownRegex);
    const fileContentMatch = block.match(fileContentRegex);
    const fileWriteMatch = block.match(fileWriteRegex);
    const shellWaitMatch = block.match(shellWaitRegex);
    const askTerminalCommandMatch = block.match(askTerminalCommandRegex);
    const stdoutMatch = block.match(stdoutRegex);
    const errorMatch = block.match(errorRegex);
    const execDirMatch =
      terminalXmlMatch || confirmedTerminalXmlMatch
        ? block.match(execDirRegex)
        : null;

    if (shellWaitMatch) {
      blocks.push({
        type: 'shell-wait',
        content: {
          seconds: shellWaitMatch[1].trim(),
        },
      });
    } else if (askTerminalCommandMatch) {
      blocks.push({
        type: 'ask-terminal-command',
        content: {
          command: askTerminalCommandMatch[2].trim(),
          execDir: askTerminalCommandMatch[1] || '/',
        },
      });
    } else if (
      terminalXmlMatch ||
      confirmedTerminalXmlMatch ||
      terminalMarkdownMatch
    ) {
      blocks.push({
        type: 'terminal',
        content: {
          command: (
            terminalXmlMatch?.[1] ||
            confirmedTerminalXmlMatch?.[1] ||
            terminalMarkdownMatch?.[1] ||
            ''
          ).trim(),
          stdout: stdoutMatch ? stdoutMatch[1].trim() : '',
          error: errorMatch ? errorMatch[1].trim() : undefined,
          exec_dir: execDirMatch ? execDirMatch[1] : undefined,
        },
      });
    } else if (fileContentMatch) {
      blocks.push({
        type: 'file-content',
        content: {
          path: fileContentMatch[1] || '',
          content: fileContentMatch[2].trim(),
          isWrite: false,
        },
      });
    } else if (fileWriteMatch) {
      blocks.push({
        type: 'file-content',
        content: {
          path: fileWriteMatch[1] || '',
          content: fileWriteMatch[2].trim(),
          isWrite: true,
        },
      });
    }

    lastIndex = blockRegex.lastIndex;
  }

  if (lastIndex < content.length) {
    blocks.push({ type: 'text', content: content.slice(lastIndex).trim() });
  }

  return blocks;
};
