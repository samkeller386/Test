import { tool } from "ai"
import { z } from "zod"
import { Sandbox } from "@e2b/code-interpreter"
import { uploadFilesToSandbox } from "@/lib/tools/e2b/file-handler"
import {
  createOrConnectTemporaryTerminal,
  createOrConnectPersistentTerminal
} from "../e2b/sandbox"
import { executeTerminalCommand } from "./terminal-executor"
import {
  streamTerminalOutput,
  reduceTerminalOutput
} from "@/lib/ai/terminal-utils"
import { PluginID } from "@/types/plugins"

/**
 * Interface for tools that need access to the data stream
 */
export interface ToolContext {
  dataStream: any
  sandbox?: Sandbox | null
  userID: string
  persistentSandbox?: boolean
  selectedPlugin?: PluginID
  terminalTemplate?: string
  setSandbox?: (sandbox: Sandbox) => void
  setPersistentSandbox?: (isPersistent: boolean) => void
}

// Constants for sandbox creation
const TEMPORARY_SANDBOX_TEMPLATE = "temporary-sandbox"
const PERSISTENT_SANDBOX_TEMPLATE = "persistent-sandbox"
const BASH_SANDBOX_TIMEOUT = 15 * 60 * 1000

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

/**
 * Creates and returns all agent tools with the provided context
 * @param context - The context needed for tool execution
 * @returns Object containing all available agent tools
 */
export function createAgentTools(context: ToolContext) {
  const {
    dataStream,
    sandbox: initialSandbox,
    userID,
    persistentSandbox: initialPersistentSandbox = false,
    selectedPlugin,
    terminalTemplate = TEMPORARY_SANDBOX_TEMPLATE,
    setSandbox,
    setPersistentSandbox
  } = context

  let sandbox = initialSandbox
  let persistentSandbox = initialPersistentSandbox

  return {
    /**
     * Execute commands in the sandbox environment
     */
    terminal: tool({
      description: "Execute commands in the sandbox environment.",
      parameters: z.object({
        command: z.string().describe("Command to execute"),
        ...(selectedPlugin
          ? {}
          : {
              usePersistentSandbox: z
                .boolean()
                .optional()
                .describe(
                  "Use persistent sandbox (30-day storage) instead of temporary"
                )
            })
      }),
      execute: async args => {
        const { command } = args
        // Handle usePersistentSandbox with type safety
        const usePersistentSandbox = selectedPlugin
          ? false
          : Boolean(args.usePersistentSandbox)

        // Validate plugin-specific commands
        if (selectedPlugin) {
          const expectedCommand = PLUGIN_COMMAND_MAP[selectedPlugin]
          if (expectedCommand && !command.trim().startsWith(expectedCommand)) {
            return `Command must start with "${expectedCommand}" for this plugin`
          }
        }

        // Set sandbox type
        persistentSandbox = usePersistentSandbox

        // Update the persistentSandbox value in the parent context if needed
        if (setPersistentSandbox) {
          setPersistentSandbox(persistentSandbox)
        }

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

          // Update the sandbox in the parent context if needed
          if (setSandbox) {
            setSandbox(sandbox)
          }
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

    /**
     * Sends a message to the user without requiring a response
     * Used for acknowledging receipt of messages, providing progress updates,
     * reporting task completion, or explaining changes in approach
     */
    message_notify_user: tool({
      description: `Send a message to user without requiring a response. Use for acknowledging receipt of messages, providing progress updates, reporting task completion, or explaining changes in approach.`,
      parameters: z.object({
        text: z.string().describe("Message text to display to user")
      }),
      execute: async ({ text }) => {
        dataStream.writeData({
          type: "text-delta",
          content: `${text}\n\n`
        })

        return text
      }
    }),

    /**
     * Asks the user a question and waits for a response
     * Used for requesting clarification, asking for confirmation,
     * or gathering additional information
     */
    message_ask_user: tool({
      description: `Ask user a question and wait for response. Use for requesting clarification, asking for confirmation, or gathering additional information.`,
      parameters: z.object({
        text: z.string().describe("Question text to present to user")
      })
      // no execute function - invoking it will terminate the agent
    }),

    /**
     * Writes content to a file in the sandbox
     * Used for creating new files
     */
    file_write: tool({
      description:
        "Upload files to the sandbox. Use for creating new files files.",
      parameters: z.object({
        files: z
          .array(
            z.object({
              fileId: z.string().describe("ID of the file to upload"),
              destination: z
                .string()
                .optional()
                .describe("Optional destination path in the sandbox")
            })
          )
          .max(3)
          .describe("Files to upload to sandbox (max 3 files)")
      }),
      execute: async ({ files }) => {
        // Create a temporary sandbox if one doesn't exist yet
        if (!sandbox) {
          try {
            // Use the provided terminalTemplate or fall back to the default
            const templateToUse = terminalTemplate || TEMPORARY_SANDBOX_TEMPLATE

            sandbox = await createOrConnectTemporaryTerminal(
              userID,
              templateToUse,
              BASH_SANDBOX_TIMEOUT
            )

            // Update the sandbox in the parent context if needed
            if (setSandbox) {
              setSandbox(sandbox)
            }

            dataStream.writeData({
              type: "sandbox-type",
              sandboxType: "temporary-sandbox"
            })
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error)
            return `Failed to create sandbox: ${errorMessage}`
          }
        }

        if (!sandbox) {
          return "Error: Unable to create or access a sandbox environment. Please try using the terminal tool first."
        }

        try {
          // Use the same uploadFilesToSandbox function that terminal uses
          const fileObjects = files.map(file => ({ fileId: file.fileId }))
          await uploadFilesToSandbox(fileObjects, sandbox, dataStream)

          // Create a summary of uploaded files
          const filesSummary = files
            .map((file, index) => {
              const destination = file.destination || "default location"
              return `${index + 1}. File ID: ${file.fileId} → ${destination}`
            })
            .join("\n")

          return `Successfully uploaded ${files.length} file(s) to the sandbox:\n${filesSummary}`
        } catch (error: unknown) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          return `Error uploading files: ${errorMessage}`
        }
      }
    }),

    /**
     * A special tool to indicate the agent has completed all tasks and is about to enter idle state
     */
    idle: tool({
      description:
        "A special tool to indicate you have completed all tasks and are about to enter idle state.",
      parameters: z.object({})
      // no execute function - invoking it will terminate the agent
    })
  }
}
