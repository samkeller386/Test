import type { Tables } from '@/supabase/types';
import {
  PluginID,
  type ProviderMetadata,
  type MessageModelParams,
} from '@/types';
import type { FC } from 'react';
import { MessageMarkdown } from './message-markdown';
import { MessageTerminal } from './terminal-messages/message-terminal';
import { MessageCitations } from './message-citations';
import { MessageThinking } from './message-thinking';

interface MessageTypeResolverProps {
  message: Tables<'messages'>;
  isLastMessage: boolean;
  toolInUse: string;
}

export const allTerminalPlugins: string[] = [
  PluginID.TERMINAL,
  PluginID.WAF_DETECTOR,
  PluginID.WHOIS_LOOKUP,
  PluginID.SUBDOMAIN_FINDER,
  'persistent-sandbox',
  'temporary-sandbox',
];

const isTerminalPlugin = (plugin: string | null | undefined): boolean => {
  return (
    plugin !== null &&
    plugin !== undefined &&
    allTerminalPlugins.includes(plugin)
  );
};

const hasCitations = (metadata: ProviderMetadata | null): boolean => {
  return metadata?.citations !== undefined && metadata.citations.length > 0;
};

export const MessageTypeResolver: FC<MessageTypeResolverProps> = ({
  message,
  isLastMessage,
  toolInUse,
}) => {
  const metadata = message.provider_metadata as ProviderMetadata | null;

  const isPluginOutput =
    message.plugin !== null &&
    message.plugin !== PluginID.NONE.toString() &&
    message.role === 'assistant';

  // console.log({
  //   isPluginOutput,
  //   plugin: message.plugin,
  //   role: message.role
  // })

  if (
    (isPluginOutput && isTerminalPlugin(message.plugin)) ||
    isTerminalPlugin(toolInUse)
  ) {
    return (
      <MessageTerminal
        content={message.content}
        isAssistant={message.role === 'assistant'}
        isLastMessage={isLastMessage}
      />
    );
  }

  if (
    toolInUse === PluginID.REASONING ||
    toolInUse === PluginID.REASONING_WEB_SEARCH ||
    message.reasoning
  ) {
    return (
      <MessageThinking
        content={message.content}
        thinking_content={message.reasoning}
        thinking_elapsed_secs={metadata?.thinking_elapsed_secs}
        isAssistant={message.role === 'assistant'}
        citations={metadata?.citations || []}
      />
    );
  }

  if (
    message.plugin === PluginID.WEB_SEARCH ||
    toolInUse === PluginID.WEB_SEARCH ||
    hasCitations(metadata)
  ) {
    return (
      <MessageCitations
        content={message.content}
        isAssistant={message.role === 'assistant'}
        citations={metadata?.citations || []}
      />
    );
  }

  return (
    <MessageMarkdown
      content={message.content}
      isAssistant={message.role === 'assistant'}
    />
  );
};
