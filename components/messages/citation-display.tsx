import React, { FC, useMemo } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card"

interface CitationDisplayProps {
  citations: string[]
  className?: string
}

interface WebsiteCardProps {
  url: string
  domain: string
}

const WebsiteCard: FC<WebsiteCardProps> = ({ url, domain }) => {
  const faviconUrl = useMemo(() => {
    try {
      const urlObj = new URL(url)
      return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`
    } catch (e) {
      return ""
    }
  }, [url])

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="block transition-transform hover:scale-[1.02] active:scale-[0.98]"
      tabIndex={0}
      aria-label={`Visit ${domain}`}
    >
      <Card className="w-[300px] shrink-0 bg-background-foreground hover:bg-accent transition-colors">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="relative size-4 overflow-hidden rounded-sm shrink-0">
              <Image
                src={faviconUrl}
                alt={`${domain} icon`}
                className="object-contain"
                fill
                sizes="16px"
              />
            </div>
            <CardTitle className="text-sm truncate">{url}</CardTitle>
          </div>
          <CardDescription className="text-xs truncate">
            {domain}
          </CardDescription>
        </CardHeader>
      </Card>
    </a>
  )
}

export const CitationDisplay: FC<CitationDisplayProps> = ({
  citations,
  className
}) => {
  const websiteCards = useMemo(() => {
    return citations
      .map(url => {
        try {
          const urlObj = new URL(url)
          return {
            url,
            domain: urlObj.hostname.replace(/^www\./, "")
          }
        } catch (e) {
          return null
        }
      })
      .filter(Boolean)
  }, [citations])

  if (citations.length === 0) return null

  return (
    <div className={cn("space-y-4 my-2", className)}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">
          {citations.length} Citations
        </span>
        <div className="flex -space-x-1">
          {websiteCards.slice(0, 5).map((card, i) => (
            <div
              key={i}
              className="relative size-6 overflow-hidden rounded-sm ring-2 ring-background"
            >
              <Image
                src={`https://www.google.com/s2/favicons?domain=${card?.domain}&sz=32`}
                alt={`${card?.domain} icon`}
                className="object-contain"
                fill
                sizes="24px"
              />
            </div>
          ))}
        </div>
      </div>
      <div className="relative">
        <div className="overflow-x-auto overflow-y-hidden no-scrollbar">
          <div className="flex w-max space-x-3">
            {websiteCards.map((card, i) => (
              <WebsiteCard key={i} url={card!.url} domain={card!.domain} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
