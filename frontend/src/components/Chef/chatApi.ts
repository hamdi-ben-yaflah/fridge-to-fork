import { z } from "zod"

const statusSchema = z.object({ message: z.string() })
const replyDeltaSchema = z.object({ text: z.string() })
const mealSchema = z.object({
  name: z.string(),
  ingredients_used: z.array(z.string()),
  missing_ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  source_url: z.string().nullable(),
})
const replySchema = z.object({
  text: z.string(),
  meals: z.array(mealSchema),
  quick_replies: z.array(z.string()),
})
const errorSchema = z.object({ detail: z.string() })
const httpErrorSchema = z.object({
  detail: z.union([z.string(), z.array(z.object({ msg: z.string() }))]),
})

export type Meal = z.infer<typeof mealSchema>

export type HistoryMessage =
  | { role: "user"; text: string; has_photo: boolean }
  | {
      role: "chef"
      text: string
      meals: Pick<Meal, "name" | "ingredients_used" | "missing_ingredients">[]
    }

export type ChatEvent =
  | { type: "status"; message: string }
  | { type: "reply_delta"; text: string }
  | { type: "meal"; meal: Meal }
  | ({ type: "reply" } & z.infer<typeof replySchema>)
  | { type: "error"; detail: string }
  | { type: "done" }

export const CONNECTION_LOST = "Connection lost."
export const GENERIC_ERROR = "Something went wrong. Please try again."

export class ChefRequestError extends Error {
  retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

const CHAT_URL = `${import.meta.env.VITE_API_URL ?? ""}/api/v1/chef/chat`

export async function* streamChat(
  history: HistoryMessage[],
  image: File | null,
  signal: AbortSignal,
): AsyncGenerator<ChatEvent> {
  const body = new FormData()
  body.append("messages", JSON.stringify(history))
  if (image) body.append("image", image)

  const response = await fetch(CHAT_URL, {
    method: "POST",
    body,
    signal,
    headers: {
      Authorization: `Bearer ${localStorage.getItem("access_token")}`,
    },
  })
  if (!response.ok) throw await toRequestError(response)
  if (!response.body) throw new ChefRequestError(CONNECTION_LOST, true)

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += value.replace(/\r\n/g, "\n")
    let boundary = buffer.indexOf("\n\n")
    while (boundary !== -1) {
      const event = parseEvent(buffer.slice(0, boundary))
      buffer = buffer.slice(boundary + 2)
      if (event) yield event
      boundary = buffer.indexOf("\n\n")
    }
  }
}

function parseEvent(block: string): ChatEvent | null {
  let name = "message"
  const data: string[] = []
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim()
    else if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
  }
  if (name === "done") return { type: "done" }
  if (data.length === 0) return null

  try {
    const payload: unknown = JSON.parse(data.join("\n"))
    if (name === "status")
      return { type: "status", ...statusSchema.parse(payload) }
    if (name === "reply_delta")
      return { type: "reply_delta", ...replyDeltaSchema.parse(payload) }
    if (name === "meal")
      return { type: "meal", meal: mealSchema.parse(payload) }
    if (name === "reply")
      return { type: "reply", ...replySchema.parse(payload) }
    if (name === "error")
      return { type: "error", ...errorSchema.parse(payload) }
  } catch {
    throw new ChefRequestError(GENERIC_ERROR, true)
  }
  return null
}

async function toRequestError(response: Response): Promise<ChefRequestError> {
  if (response.status === 503) {
    return new ChefRequestError("The chef is offline right now.", false)
  }
  if ([413, 415, 422].includes(response.status)) {
    const parsed = httpErrorSchema.safeParse(
      await response.json().catch(() => null),
    )
    if (parsed.success) {
      const { detail } = parsed.data
      const message = typeof detail === "string" ? detail : detail[0]?.msg
      return new ChefRequestError(message ?? GENERIC_ERROR, false)
    }
  }
  return new ChefRequestError(GENERIC_ERROR, true)
}
