import { toVercelChatMessages } from "@/lib/ai/message-utils"
import { streamText, tool } from "ai"
import { z } from "zod"
import { executeTerminalCommand } from "./terminal-executor"
import {
  streamTerminalOutput,
  reduceTerminalOutput
} from "@/lib/ai/terminal-utils"
import { ratelimit } from "@/lib/server/ratelimiter"
import { epochTimeToNaturalLanguage } from "@/lib/utils"
import { Sandbox } from "@e2b/code-interpreter"
import {
  createOrConnectPersistentTerminal,
  createOrConnectTemporaryTerminal,
  pauseSandbox
} from "../e2b/sandbox"
import { uploadFilesToSandbox } from "@/lib/tools/e2b/file-handler"
import { createAgentTools } from "./agent-tools"
import { PENTESTGPT_AGENT_SYSTEM_PROMPT } from "./agent-prompts"
import { getSubscriptionInfo } from "@/lib/server/subscription-utils"
import { PluginID } from "@/types/plugins"
import { isFreePlugin } from "../tool-store/tools-helper"
import { getToolsWithAnswerPrompt } from "../tool-store/prompts/system-prompt"
import { getTerminalTemplate } from "@/lib/tools/tool-store/tools-helper"
import { myProvider } from "@/lib/ai/providers"

// Constants
const BASH_SANDBOX_TIMEOUT = 15 * 60 * 1000
const PERSISTENT_SANDBOX_TEMPLATE = "persistent-sandbox"
const TEMPORARY_SANDBOX_TEMPLATE = "temporary-sandbox"

// Plugin command mapping
const PLUGIN_COMMAND_MAP: Partial<Record<PluginID, string>> = {
  [PluginID.SQLI_EXPLOITER]: "sqlmap",
  [PluginID.SSL_SCANNER]: "testssl.sh",
  [PluginID.DNS_SCANNER]: "dnsrecon",
  [PluginID.PORT_SCANNER]: "naabu",
  [PluginID.WAF_DETECTOR]: "wafw00f",
  [PluginID.WHOIS_LOOKUP]: "whois",
  [PluginID.SUBDOMAIN_FINDER]: "subfinder",
  [PluginID.CVE_MAP]: "cvemap",
  [PluginID.URL_FUZZER]: "ffuf",
  [PluginID.WORDPRESS_SCANNER]: "wpscan",
  [PluginID.XSS_EXPLOITER]: "dalfox"
}

interface TerminalToolConfig {
  messages: any[]
  profile: any
  dataStream: any
  isTerminalContinuation?: boolean
  selectedPlugin?: PluginID
}

export async function executeTerminalTool({
  config
}: {
  config: TerminalToolConfig
}) {
  const {
    messages,
    profile,
    dataStream,
    isTerminalContinuation,
    selectedPlugin
  } = config
  let sandbox: Sandbox | null = null
  let persistentSandbox = false
  const userID = profile.user_id
  let systemPrompt = PENTESTGPT_AGENT_SYSTEM_PROMPT
  let terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE
  let selectedChatModel = "chat-model-gpt-large"

  try {
    // Check rate limit
    const rateLimitResult = await ratelimit(userID, "terminal")
    if (!rateLimitResult.allowed) {
      const waitTime = epochTimeToNaturalLanguage(
        rateLimitResult.timeRemaining!
      )
      dataStream.writeData({
        type: "error",
        content: `⚠️ You've reached the limit for terminal usage.\n\nTo ensure fair usage for all users, please wait ${waitTime} before trying again.`
      })
      return "Rate limit exceeded"
    }

    // Handle plugin-specific setup
    if (selectedPlugin) {
      const subscriptionInfo = await getSubscriptionInfo(userID)

      if (!isFreePlugin(selectedPlugin) && !subscriptionInfo.isPremium) {
        dataStream.writeData({
          type: "error",
          content: `Access Denied to ${selectedPlugin}: The plugin you are trying to use is exclusive to Pro and Team members. Please upgrade to access this plugin.`
        })
        return "Access Denied to plugin"
      }

      if (!subscriptionInfo.isPremium)
        selectedChatModel = "chat-model-gpt-small"

      systemPrompt = getToolsWithAnswerPrompt(selectedPlugin)
      terminalTemplate = getTerminalTemplate(selectedPlugin)
    }

    // Continue assistant message from previous terminal call
    const cleanedMessages = isTerminalContinuation
      ? messages.slice(0, -1)
      : messages

    const { fullStream, finishReason } = streamText({
      model: myProvider.languageModel(selectedChatModel),
      maxTokens: 2048,
      system: systemPrompt,
      messages: toVercelChatMessages(cleanedMessages, true),
      tools: {
        terminal: tool({
          description: "Execute commands in the sandbox environment.",
          parameters: z.object({
            command: z.string().describe("Command to execute"),
            ...(selectedPlugin
              ? {}
              : {
                  usePersistentSandbox: z
                    .boolean()
                    .describe(
                      "Use persistent sandbox (30-day storage) instead of temporary"
                    )
                }),
            files: z
              .array(
                z.object({
                  fileId: z.string().describe("ID of the file to upload")
                })
              )
              .max(3)
              .optional()
              .describe(
                "Files to upload to sandbox before executing command (max 3 files)"
              )
          }),
          execute: async args => {
            const { command, files = [] } = args
            // Handle usePersistentSandbox with type safety
            const usePersistentSandbox = selectedPlugin
              ? false
              : Boolean(args.usePersistentSandbox)

            // Validate plugin-specific commands
            if (selectedPlugin) {
              const expectedCommand = PLUGIN_COMMAND_MAP[selectedPlugin]
              if (
                expectedCommand &&
                !command.trim().startsWith(expectedCommand)
              ) {
                return `Command must start with "${expectedCommand}" for this plugin`
              }
            }

            // Set sandbox type
            persistentSandbox = usePersistentSandbox

            dataStream.writeData({
              type: "sandbox-type",
              sandboxType: persistentSandbox
                ? "persistent-sandbox"
                : "temporary-sandbox"
            })

            // Create or connect to sandbox
            if (!sandbox) {
              sandbox = persistentSandbox
                ? await createOrConnectPersistentTerminal(
                    userID,
                    PERSISTENT_SANDBOX_TEMPLATE,
                    BASH_SANDBOX_TIMEOUT
                  )
                : await createOrConnectTemporaryTerminal(
                    userID,
                    terminalTemplate,
                    BASH_SANDBOX_TIMEOUT
                  )
            }

            // Upload requested files
            if (files.length > 0) {
              await uploadFilesToSandbox(files, sandbox, dataStream)
            }

            // Execute command
            const terminalStream = await executeTerminalCommand({
              userID,
              command,
              usePersistentSandbox: persistentSandbox,
              sandbox
            })

            let terminalOutput = ""
            await streamTerminalOutput(terminalStream, chunk => {
              dataStream.writeData({
                type: "text-delta",
                content: chunk
              })
              terminalOutput += chunk
            })

            return reduceTerminalOutput(terminalOutput)
          }
        }),
        ...createAgentTools({ dataStream })
      },
      maxSteps: 5,
      toolChoice: "required"
    })

    // Handle stream
    let shouldStop = false
    for await (const chunk of fullStream) {
      if (chunk.type === "text-delta") {
        dataStream.writeData({
          type: "text-delta",
          content: chunk.textDelta
        })
      } else if (chunk.type === "tool-call") {
        if (chunk.toolName === "idle" || chunk.toolName === "message_ask_user") {
          dataStream.writeData({ finishReason: "stop" })
          shouldStop = true

          if (chunk.toolName === "message_ask_user") {
            dataStream.writeData({
              type: "text-delta",
              content: chunk.args.text
            })
          }
        }

        dataStream.writeData({
          type: "tool-call",
          content: chunk.toolName,
        })
      }
    }

    // Send finish reason if not already sent
    if (!shouldStop) {
      const originalFinishReason = await finishReason
      dataStream.writeData({ finishReason: originalFinishReason })
    }
  } finally {
    // Pause sandbox at the end of the API request
    if (sandbox && persistentSandbox) {
      await pauseSandbox(sandbox)
    }
  }

  return "Terminal execution completed"
}
