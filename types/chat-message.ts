import { Tables } from "@/supabase/types"

export interface ChatMessage {
  message: Tables<"messages">
  fileItems: Tables<"file_items">[]
  feedback?: Tables<"feedback">
  isFinal?: boolean
}

export interface ImageContent {
  type: "image_url"
  image_url: {
    url: string
  }
}

export interface DocumentContent {
  type: "document"
  source: {
    type: "base64"
    media_type: "application/pdf"
    data: string
  }
}

export interface TextContent {
  type: "text"
  text: string
}

export type MessageContent = ImageContent | TextContent | DocumentContent

export interface BuiltChatMessage {
  role: string
  content: string | MessageContent[]
}
