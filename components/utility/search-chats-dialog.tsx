import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  IconLoader2,
  IconX,
  IconMessagePlus,
  IconMessages
} from "@tabler/icons-react"
import { FC, useContext, useEffect, useState } from "react"
import { PentestGPTContext } from "@/context/context"
import { Tables } from "@/supabase/types"
import { useChatHandler } from "../chat/chat-hooks/use-chat-handler"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"

interface SearchChatsDialogProps {
  isOpen: boolean
  onClose: () => void
}

type DateCategory =
  | "Today"
  | "Yesterday"
  | "Previous 7 Days"
  | "Previous 30 Days"
  | "Older"

export const SearchChatsDialog: FC<SearchChatsDialogProps> = ({
  isOpen,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<Tables<"chats">[]>([])
  const { chats } = useContext(PentestGPTContext)
  const { handleSelectChat, handleNewChat } = useChatHandler()

  useEffect(() => {
    const searchChats = async () => {
      if (!searchTerm) {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        // TODO: Implement API call to search chats
        // Should search both chat names and messages
        // Example API call:
        // const results = await fetch('/api/chats/search', {
        //   method: 'POST',
        //   body: JSON.stringify({ query: searchTerm })
        // })
        // const data = await results.json()
        // Expected response shape:
        // {
        //   chats: Array<{
        //     ...chat,
        //     matchingMessage?: string // The message content that matched the search
        //   }>
        // }
        // setSearchResults(data.chats)

        // Temporary: Show filtered chats
        const filtered = chats.filter(chat =>
          chat.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        setSearchResults(filtered)
      } catch (error) {
        console.error("Search error:", error)
        setSearchResults([])
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchChats, 300)
    return () => clearTimeout(debounce)
  }, [searchTerm, chats])

  // Reset search when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setSearchResults([])
    }
  }, [isOpen])

  const getSortedChats = (dateCategory: DateCategory) => {
    // Only show search results when searching, otherwise show all chats
    const chatsToSort = searchTerm ? searchResults : chats
    const now = new Date()
    const todayStart = new Date(now.setHours(0, 0, 0, 0))
    const yesterdayStart = new Date(
      new Date().setDate(todayStart.getDate() - 1)
    )
    const oneWeekAgoStart = new Date(
      new Date().setDate(todayStart.getDate() - 7)
    )
    const thirtyDaysAgoStart = new Date(
      new Date().setDate(todayStart.getDate() - 30)
    )

    return chatsToSort
      .filter(chat => {
        const chatDate = new Date(chat.updated_at || chat.created_at)
        switch (dateCategory) {
          case "Today":
            return chatDate >= todayStart
          case "Yesterday":
            return chatDate >= yesterdayStart && chatDate < todayStart
          case "Previous 7 Days":
            return chatDate >= oneWeekAgoStart && chatDate < yesterdayStart
          case "Previous 30 Days":
            return chatDate >= thirtyDaysAgoStart && chatDate < oneWeekAgoStart
          case "Older":
            return chatDate < thirtyDaysAgoStart
        }
      })
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at).getTime() -
          new Date(a.updated_at || a.created_at).getTime()
      )
  }

  const handleChatClick = async (chat: Tables<"chats">) => {
    await handleSelectChat(chat)
    onClose()
  }

  const handleCreateNewChat = async () => {
    await handleNewChat()
    onClose()
  }

  const dateCategories: DateCategory[] = [
    "Today",
    "Yesterday",
    "Previous 7 Days",
    "Previous 30 Days",
    "Older"
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogTitle className="sr-only">Search Chats</DialogTitle>
      <DialogContent className="max-w-xl gap-0 p-0 outline-none">
        <div className="flex items-center border-b p-3">
          <div className="relative flex-1">
            <Input
              placeholder="Search chats..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="text-md border-0 pr-8 outline-none focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 size-8 -translate-y-1/2 hover:bg-transparent"
              onClick={onClose}
            >
              <IconX className="text-muted-foreground" size={18} />
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <IconLoader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {!searchTerm && (
                <div
                  onClick={handleCreateNewChat}
                  className={cn(
                    "hover:bg-accent flex cursor-pointer items-center rounded-lg px-4 py-3",
                    "transition-colors duration-200"
                  )}
                >
                  <IconMessagePlus
                    size={24}
                    className="text-muted-foreground mr-3.5 shrink-0"
                  />
                  <div className="text-sm font-medium">New chat</div>
                </div>
              )}

              {searchResults.length === 0 && searchTerm ? (
                <div className="text-muted-foreground py-4 text-center">
                  No chats found
                </div>
              ) : (
                (!searchTerm || searchResults.length > 0) &&
                dateCategories.map(category => {
                  const chats = getSortedChats(category)
                  if (chats.length === 0) return null

                  return (
                    <div key={category} className="pb-2">
                      <div className="text-muted-foreground bg-background sticky top-0 z-10 mb-1 py-1 pl-2 text-xs font-bold">
                        {category}
                      </div>
                      <div className="divide-y">
                        {chats.map(chat => (
                          <div
                            key={chat.id}
                            onClick={() => handleChatClick(chat)}
                            className={cn(
                              "hover:bg-accent flex cursor-pointer flex-col rounded-lg px-4 py-3",
                              "transition-colors duration-200"
                            )}
                          >
                            <div className="flex items-center">
                              <IconMessages
                                size={24}
                                className="text-muted-foreground mr-3.5 shrink-0"
                              />
                              <div className="text-sm font-medium">
                                {chat.name}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
