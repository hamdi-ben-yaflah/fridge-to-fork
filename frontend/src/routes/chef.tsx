import { createFileRoute, redirect } from "@tanstack/react-router"
import { SquarePen } from "lucide-react"
import { useLayoutEffect, useRef, useState } from "react"
import { ChatThread } from "@/components/Chef/ChatThread"
import { Composer } from "@/components/Chef/Composer"
import type { Meal } from "@/components/Chef/chatApi"
import { photoProblem, usePhotoDrop } from "@/components/Chef/photo"
import { ShoppingList } from "@/components/Chef/ShoppingList"
import { useChefChat } from "@/components/Chef/useChefChat"
import { Appearance } from "@/components/Common/Appearance"
import { Button } from "@/components/ui/button"
import { isLoggedIn } from "@/hooks/useAuth"

export const Route = createFileRoute("/chef")({
  component: ChefPage,
  beforeLoad: () => {
    if (!isLoggedIn()) {
      throw redirect({ to: "/login" })
    }
  },
  head: () => ({
    meta: [{ title: "Fridge to Fork" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght,SOFT@0,9..144,400..600,0..100;1,9..144,400..600,0..100&display=swap",
      },
    ],
  }),
})

function useKitchenTheme() {
  // On <html> rather than the page wrapper so portalled sheets and toasts pick it up too.
  useLayoutEffect(() => {
    document.documentElement.classList.add("kitchen")
    return () => document.documentElement.classList.remove("kitchen")
  }, [])
}

function ChefPage() {
  useKitchenTheme()
  const chat = useChefChat()
  const [draft, setDraft] = useState("")
  const [listed, setListed] = useState<Meal[]>([])
  const [chatKey, setChatKey] = useState(0)

  const toggleListed = (meal: Meal) => {
    setListed((previous) =>
      previous.includes(meal)
        ? previous.filter((item) => item !== meal)
        : [...previous, meal],
    )
  }

  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)

  const attach = (file: File) => {
    const problem = photoProblem(file)
    setPhotoError(problem)
    if (!problem) setPhoto(file)
  }

  const dragging = usePhotoDrop(attach)

  const submit = (text: string) => {
    chat.send(text, photo)
    setPhoto(null)
    setPhotoError(null)
  }

  const stop = () => {
    const stopped = chat.stop()
    if (!stopped) return
    if (!draft.trim()) setDraft(stopped.text)
    if (!photo) setPhoto(stopped.photo)
  }

  const newChat = () => {
    chat.reset()
    setDraft("")
    setPhoto(null)
    setPhotoError(null)
    setListed([])
    setChatKey((key) => key + 1)
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      <header className="border-b pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
          <h1 className="min-w-0 flex-1">
            <span className="brand-wordmark">
              <span className="brand-wordmark-text">Fridge to Fork</span>
              <svg
                aria-hidden="true"
                className="brand-swash"
                viewBox="0 0 200 12"
                preserveAspectRatio="none"
              >
                <path
                  d="M3 8 C 45 2, 85 2, 115 6 S 172 11, 197 4"
                  pathLength={1}
                />
              </svg>
            </span>
          </h1>
          <Button
            variant="ghost"
            size="sm"
            aria-label="New chat"
            disabled={chat.messages.length === 0 && !chat.streaming}
            onClick={newChat}
          >
            <SquarePen data-icon="inline-start" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
          <ShoppingList key={chatKey} meals={listed} />
          <Appearance />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <ChatThread
          messages={chat.messages}
          pending={chat.pending}
          error={chat.error}
          onRetry={chat.retry}
          onSend={submit}
          onPickPhoto={() => photoInputRef.current?.click()}
          listed={listed}
          onToggleListed={toggleListed}
        />
        <Composer
          value={draft}
          onChange={setDraft}
          streaming={chat.streaming}
          onSend={() => {
            submit(draft.trim())
            setDraft("")
          }}
          onStop={stop}
          photo={photo}
          photoError={photoError}
          onPhoto={attach}
          onRemovePhoto={() => setPhoto(null)}
          photoInputRef={photoInputRef}
        />
      </main>
      {dragging && (
        <div className="pointer-events-none fixed inset-3 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-background/85 text-lg font-medium">
          Drop your photo to attach it
        </div>
      )}
    </div>
  )
}
