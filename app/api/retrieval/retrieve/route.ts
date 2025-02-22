import llmConfig from "@/lib/models/llm/llm-config"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database, Tables } from "@/supabase/types"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import OpenAI from "openai"

const MINIMUM_SIMILARITY = 0
const CHUNKS_PER_QUERY = 4

type FileItems =
  Database["public"]["Functions"]["match_file_items_openai"]["Returns"]

const cosineSimilarity = (embedding1: number[], embedding2: number[]) => {
  const dotProduct = embedding1.reduce(
    (acc, val, index) => acc + val * embedding2[index],
    0
  )
  const magnitude1 = Math.sqrt(
    embedding1.reduce((acc, val) => acc + val * val, 0)
  )
  const magnitude2 = Math.sqrt(
    embedding2.reduce((acc, val) => acc + val * val, 0)
  )
  return dotProduct / (magnitude1 * magnitude2)
}

const handleRetrieval = async (
  openai: OpenAI,
  supabaseAdmin: SupabaseClient,
  fileId: string,
  query: string,
  keywords: string[]
): Promise<FileItems> => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  })

  let fileItemsToAnalyze: Tables<"file_items">[] = []

  if (keywords.length > 0) {
    const { data: keywordsSearch, error: keywordsSearchError } =
      await supabaseAdmin
        .from("file_items")
        .select("*")
        .in("file_id", [fileId])
        .or(`content.ilike.%${keywords.join("%,content.ilike.%")}%`)

    if (keywordsSearchError) {
      throw new Error(
        `Failed to retrieve keywords search: ${keywordsSearchError.message}`
      )
    }

    if (keywordsSearch.length < CHUNKS_PER_QUERY && keywordsSearch.length > 0) {
      return keywordsSearch.map(item => ({
        id: item.id,
        file_id: item.file_id,
        content: item.content,
        tokens: item.tokens,
        similarity: 1
      }))
    }

    fileItemsToAnalyze = keywordsSearch
  }

  const openaiEmbedding = response.data.map(item => item.embedding)[0]

  if (fileItemsToAnalyze.length > 0) {
    const cosineSimilarities = fileItemsToAnalyze.map(item => {
      const embedding = JSON.parse(item.openai_embedding || "[]") as number[]
      return {
        id: item.id,
        file_id: item.file_id,
        content: item.content,
        tokens: item.tokens,
        similarity: cosineSimilarity(openaiEmbedding, embedding)
      }
    })

    return cosineSimilarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, CHUNKS_PER_QUERY)
  }

  const { data: openaiFileItems } = (await supabaseAdmin.rpc(
    "match_file_items_openai",
    {
      query_embedding: openaiEmbedding as any,
      match_count: CHUNKS_PER_QUERY,
      file_ids: [fileId]
    }
  )) as {
    data: FileItems
  }

  return openaiFileItems.filter(item => item.similarity > MINIMUM_SIMILARITY)
}

const handleQueryFiles =
  (openai: OpenAI, supabaseAdmin: SupabaseClient, chunks: FileItems) =>
  async (inputString: string) => {
    console.log({ inputString })
    const request = JSON.parse(inputString) as {
      queries: {
        file_id: string
        query_for_semantic_search: string
        keywords: string[]
      }[]
    }

    const results = await Promise.all(
      request.queries.map(async queryPair => {
        const { file_id, query_for_semantic_search, keywords } = queryPair
        return handleRetrieval(
          openai,
          supabaseAdmin,
          file_id,
          query_for_semantic_search,
          keywords
        )
      })
    )

    chunks.push(...results.flat())

    return JSON.stringify(results)
  }

const queryFilesTool = (
  openai: OpenAI,
  supabaseAdmin: SupabaseClient,
  chunks: FileItems
) => ({
  type: "function" as const,
  function: {
    name: "queryFiles",
    description: "Query the files for the answer to the question",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file_id: { type: "string" },
              query_for_semantic_search: {
                type: "string",
                description:
                  "An atomic query contextualized to the file. This should be a single question that can be answered with the content of the file."
              },
              keywords: {
                type: "array",
                items: { type: "string" },
                description:
                  "A list of keywords that MUST be present in the file. If multiple keywords are provided, at least ONE of them must be present (OR condition). Leave this array empty if you don't need to filter by specific keywords."
              }
            },
            required: ["file_id", "query_for_semantic_search", "keywords"]
          }
        }
      },
      required: ["queries"]
    },
    function: async (args: any) =>
      handleQueryFiles(openai, supabaseAdmin, chunks)(args)
  }
})

export async function POST(request: Request) {
  const json = await request.json()
  const { conversationHistory, newMessageFiles, chatFiles } = json as {
    conversationHistory: string
    newMessageFiles: string[]
    chatFiles: string[]
  }

  const uniqueFileIds = [...new Set([...newMessageFiles, ...chatFiles])]

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const { data: userFiles, error: userFilesError } = await supabaseAdmin
      .from("files")
      .select("id, name")
      .in("id", uniqueFileIds)
      .eq("user_id", profile.user_id)

    if (userFilesError) {
      throw new Error(
        `Failed to retrieve user files: ${userFilesError.message}`
      )
    }

    if (userFiles.length !== uniqueFileIds.length) {
      throw new Error("One or more files are not accessible by the user")
    }

    const openai = new OpenAI({
      apiKey: llmConfig.openai.apiKey
    })

    const chunks: FileItems = []

    const runner = await openai.beta.chat.completions.runTools({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful researcher that answers questions about files. \n
          Here are the files you can answer questions about: ${JSON.stringify(userFiles)}`
        },
        {
          role: "user",
          content: `This is the conversation history:\n\n${conversationHistory}`
        },
        {
          role: "user",
          content: `The user attached specifically the following file to the last message: ${JSON.stringify(
            newMessageFiles
          )}`
        }
      ],
      tools: [queryFilesTool(openai, supabaseAdmin, chunks)],
      tool_choice: "auto"
    })

    const finalResponse = await runner.finalContent()

    return new Response(
      JSON.stringify({
        result: finalResponse,
        chunks: chunks
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    console.error(error)
    const errorMessage = error.error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
