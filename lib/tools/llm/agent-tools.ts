import { tool } from "ai"
import { z } from "zod"

/**
 * Interface for tools that need access to the data stream
 */
export interface ToolContext {
  dataStream: any
}

/**
 * Creates and returns all agent tools with the provided context
 * @param context - The context needed for tool execution
 * @returns Object containing all available agent tools
 */
export function createAgentTools(context: ToolContext) {
  const { dataStream } = context

  return {
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
