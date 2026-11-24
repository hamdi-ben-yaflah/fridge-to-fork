import { useEffect, useRef, useState } from "react"

import {
  ChefRequestError,
  CONNECTION_LOST,
  type HistoryMessage,
  type Meal,
  streamChat,
} from "./chatApi"

export const MAX_HISTORY = 20

// Not crypto.randomUUID: browsers only expose it on HTTPS or localhost.
let lastMessageId = 0
const nextMessageId = () => String(++lastMessageId)

export type UserMessage = {
  id: string
  role: "user"
  text: string
  photo: File | null
}

export type ChefMessage = {
  id: string
  role: "chef"
  text: string
  meals: Meal[]
  quickReplies: string[]
  searches: string[]
}

export type ThreadMessage = UserMessage | ChefMessage

export type ChatError = { message: string; retryable: boolean }

function toHistory(thread: ThreadMessage[]): HistoryMessage[] {
  return thread.slice(-MAX_HISTORY).map((message) =>
    message.role === "user"
      ? { role: "user", text: message.text, has_photo: message.photo !== null }
      : {
          role: "chef",
          text: message.text,
          meals: message.meals.map(
            ({ name, ingredients_used, missing_ingredients }) => ({
              name,
              ingredients_used,
              missing_ingredients,
            }),
          ),
        },
  )
}

export function useChefChat() {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [pending, setPending] = useState<ChefMessage | null>(null)
  const [error, setError] = useState<ChatError | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const run = async (thread: ThreadMessage[]) => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    let draft: ChefMessage = {
      id: nextMessageId(),
      role: "chef",
      text: "",
      meals: [],
      quickReplies: [],
      searches: [],
    }
    let reply: ChefMessage | null = null
    const update = (next: Partial<ChefMessage>) => {
      draft = { ...draft, ...next }
      setPending(draft)
    }
    const fail = (message: string, retryable: boolean) => {
      setPending(null)
      setError({ message, retryable })
    }
    const latest = thread[thread.length - 1]
    const photo = latest?.role === "user" ? latest.photo : null
    setError(null)
    setPending(draft)

    try {
      for await (const event of streamChat(
        toHistory(thread),
        photo,
        controller.signal,
      )) {
        if (event.type === "status") {
          update({ searches: [...draft.searches, event.message] })
        } else if (event.type === "reply_delta") {
          update({ text: draft.text + event.text })
        } else if (event.type === "meal") {
          update({ meals: [...draft.meals, event.meal] })
        } else if (event.type === "reply") {
          reply = {
            ...draft,
            text: event.text,
            meals: event.meals,
            quickReplies: event.quick_replies,
          }
        } else if (event.type === "error") {
          fail(event.detail, true)
          return
        } else {
          if (!reply) break
          setMessages([...thread, reply])
          setPending(null)
          return
        }
      }
      fail(CONNECTION_LOST, true)
    } catch (caught) {
      if (controller.signal.aborted) return
      if (caught instanceof ChefRequestError) {
        fail(caught.message, caught.retryable)
      } else {
        fail(CONNECTION_LOST, true)
      }
    }
  }

  const send = (text: string, photo: File | null) => {
    const next: ThreadMessage[] = [
      ...messages,
      { id: nextMessageId(), role: "user", text, photo },
    ]
    setMessages(next)
    void run(next)
  }

  const retry = () => void run(messages)

  const stop = (): UserMessage | null => {
    controllerRef.current?.abort()
    setPending(null)
    const last = messages[messages.length - 1]
    if (last?.role !== "user") return null
    setMessages(messages.slice(0, -1))
    return last
  }

  const reset = () => {
    controllerRef.current?.abort()
    setMessages([])
    setPending(null)
    setError(null)
  }

  return {
    messages,
    pending,
    error,
    streaming: pending !== null,
    send,
    retry,
    stop,
    reset,
  }
}
