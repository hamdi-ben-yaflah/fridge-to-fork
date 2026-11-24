import { ArrowDown, Camera, CircleAlert, RotateCcw } from "lucide-react"
import { type UIEvent, useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ChefMessage, ChefRow } from "./ChefMessage"
import type { Meal } from "./chatApi"
import { usePhotoUrl } from "./photo"
import type {
  ChatError,
  ChefMessage as ChefMessageData,
  ThreadMessage,
  UserMessage,
} from "./useChefChat"

const STARTERS = ["Eggs, rice and spinach", "Something quick for dinner"]

type ChatThreadProps = {
  messages: ThreadMessage[]
  pending: ChefMessageData | null
  error: ChatError | null
  onRetry: () => void
  onSend: (text: string) => void
  onPickPhoto: () => void
  listed: Meal[]
  onToggleListed: (meal: Meal) => void
}

function UserBubble({ message }: { message: UserMessage }) {
  const url = usePhotoUrl(message.photo)
  return (
    <div className="ml-auto flex max-w-[85%] flex-col items-end gap-2 animate-in fade-in slide-in-from-bottom-3 slide-in-from-right-2 duration-300 ease-out motion-reduce:animate-none">
      {url && (
        <img
          src={url}
          alt="Fridge you shared"
          className="max-h-48 rounded-xl border object-cover"
        />
      )}
      {message.text && (
        <p className="rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground whitespace-pre-wrap wrap-anywhere">
          {message.text}
        </p>
      )}
    </div>
  )
}

export function ChatThread({
  messages,
  pending,
  error,
  onRetry,
  onSend,
  onPickPhoto,
  listed,
  onToggleListed,
}: ChatThreadProps) {
  const streaming = pending !== null
  const shown = pending ? [...messages, pending] : messages
  const latest = messages[messages.length - 1]
  const latestReply = latest?.role === "chef" ? latest : null

  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const [unseen, setUnseen] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the conversation whenever it grows
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    if (atBottomRef.current) scroller.scrollTop = scroller.scrollHeight
    else setUnseen(true)
  }, [messages, pending, error])

  const onScroll = (event: UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget
    const atBottom =
      scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80
    atBottomRef.current = atBottom
    if (atBottom) setUnseen(false)
  }

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label="Chat"
        className="h-full overflow-y-auto"
      >
        <ol
          aria-label="Conversation"
          className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6"
        >
          <li>
            <ChefRow>
              <p className="leading-relaxed">
                What's in your kitchen? Type what you have or add a photo of
                your fridge.
              </p>
              {messages.length === 0 && !streaming && (
                <fieldset
                  aria-label="Try one"
                  className="flex flex-wrap gap-2 m-0 min-w-0 border-0 p-0"
                >
                  {STARTERS.map((starter) => (
                    <Button
                      key={starter}
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => onSend(starter)}
                    >
                      {starter}
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={onPickPhoto}
                  >
                    <Camera data-icon="inline-start" />
                    Snap my fridge
                  </Button>
                </fieldset>
              )}
            </ChefRow>
          </li>
          {shown.map((message) => (
            <li key={message.id}>
              {message.role === "user" ? (
                <UserBubble message={message} />
              ) : (
                <ChefMessage
                  message={message}
                  pending={message === pending}
                  showQuickReplies={message === latestReply && !streaming}
                  onSend={onSend}
                  listed={listed}
                  onToggleListed={onToggleListed}
                />
              )}
            </li>
          ))}
          {error && (
            <li>
              <Alert variant="destructive">
                <CircleAlert />
                <AlertTitle className="line-clamp-none">
                  {error.message}
                </AlertTitle>
                {error.retryable && (
                  <AlertDescription className="mt-2">
                    <Button size="sm" onClick={onRetry}>
                      <RotateCcw data-icon="inline-start" />
                      Retry
                    </Button>
                  </AlertDescription>
                )}
              </Alert>
            </li>
          )}
        </ol>
      </div>
      {unseen && (
        <Button
          size="sm"
          variant="secondary"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full shadow-md"
          onClick={() => {
            const scroller = scrollRef.current
            if (scroller) scroller.scrollTop = scroller.scrollHeight
            setUnseen(false)
          }}
        >
          <ArrowDown data-icon="inline-start" />
          New reply
        </Button>
      )}
    </div>
  )
}
