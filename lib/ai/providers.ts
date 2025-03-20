import {
  customProvider,
  wrapLanguageModel,
  extractReasoningMiddleware
} from "ai"
import { mistral } from "@ai-sdk/mistral"
import { openai } from "@ai-sdk/openai"
// import { openrouter } from "@openrouter/ai-sdk-provider"
import { perplexity } from "@ai-sdk/perplexity"
import { anthropic } from "@ai-sdk/anthropic"

export const myProvider = customProvider({
  languageModels: {
    "chat-model-small": mistral("mistral-small-latest"),
    "chat-model-large": mistral("mistral-large-latest"),
    "chat-model-gpt-small": openai("gpt-4o-mini"),
    "chat-model-gpt-large": openai("gpt-4o", { parallelToolCalls: false }),
    "chat-model-agent": anthropic("claude-3-7-sonnet-20250219"),
    "chat-model-reasoning": wrapLanguageModel({
      model: perplexity("r1-1776"),
      middleware: extractReasoningMiddleware({ tagName: "think" })
    }),
    "deep-research": perplexity("sonar-deep-research"),
    "vision-model": mistral("pixtral-large-latest"),
    "title-model": mistral("mistral-small-latest"),
    "standalone-question-model": mistral("mistral-small-latest")
  }
})
