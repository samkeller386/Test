import { LLMID } from "@/types"

export const convertOldModelToNew = (model: string): LLMID => {
  if (model === "gpt-4-turbo-preview") {
    return "mistral-large"
  }
  return model as LLMID
}
