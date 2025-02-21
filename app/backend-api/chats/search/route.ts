import { NextResponse } from "next/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get("query")
    // const cursor = searchParams.get("cursor")

    if (!query) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      )
    }

    // TODO: Implement search query with pagination:
    // 1. Search in chat names and messages
    // 2. Use cursor-based pagination (cursor = chat.created_at)
    // 3. Return only 30 results per page
    // 4. Include has_more flag and next_cursor in response

    return NextResponse.json({
      results: [],
      has_more: false,
      next_cursor: null
    })
  } catch (error) {
    console.error("Search error:", error)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
