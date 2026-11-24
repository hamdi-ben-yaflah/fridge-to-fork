import { ArrowUp, Camera, ImagePlus, Square, X } from "lucide-react"
import {
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { MAX_TEXT_LENGTH, matchIngredients } from "./ingredients"
import { PHOTO_ACCEPT, usePhotoUrl } from "./photo"

type ComposerProps = {
  value: string
  onChange: (value: string) => void
  streaming: boolean
  onSend: () => void
  onStop: () => void
  photo: File | null
  photoError: string | null
  onPhoto: (file: File) => void
  onRemovePhoto: () => void
  photoInputRef: RefObject<HTMLInputElement | null>
}

function wordAtCaret(text: string, caret: number) {
  const before = text.slice(0, caret)
  const start =
    Math.max(
      before.lastIndexOf(" "),
      before.lastIndexOf(","),
      before.lastIndexOf("\n"),
    ) + 1
  return { start, word: before.slice(start) }
}

export function Composer({
  value,
  onChange,
  streaming,
  onSend,
  onStop,
  photo,
  photoError,
  onPhoto,
  onRemovePhoto,
  photoInputRef,
}: ComposerProps) {
  const canSend = !streaming && (value.trim() !== "" || photo !== null)
  const preview = usePhotoUrl(photo)
  const listId = useId()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const [caret, setCaret] = useState(0)
  const [focused, setFocused] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [active, setActive] = useState(0)
  const [navigated, setNavigated] = useState(false)

  const { start, word } = wordAtCaret(value, caret)
  const options =
    focused && !dismissed && word.length >= 2 ? matchIngredients(word, []) : []
  const open = options.length > 0
  const highlighted = Math.min(active, options.length - 1)

  useLayoutEffect(() => {
    if (pendingCaret.current === null) return
    textareaRef.current?.setSelectionRange(
      pendingCaret.current,
      pendingCaret.current,
    )
    pendingCaret.current = null
  })

  const edit = (next: string, nextCaret: number) => {
    onChange(next)
    setCaret(nextCaret)
    setDismissed(false)
    setActive(0)
    setNavigated(false)
  }

  const pick = (option: string) => {
    const insert = `${option}, `
    const nextCaret = start + insert.length
    pendingCaret.current = nextCaret
    edit(value.slice(0, start) + insert + value.slice(caret), nextCaret)
  }

  const pickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) onPhoto(file)
    event.target.value = ""
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (open) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault()
        const step = event.key === "ArrowDown" ? 1 : -1
        setActive((highlighted + step + options.length) % options.length)
        setNavigated(true)
        return
      }
      if (
        event.key === "Tab" ||
        (event.key === "Enter" && navigated && !event.shiftKey)
      ) {
        event.preventDefault()
        pick(options[highlighted])
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        setDismissed(true)
        return
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (canSend) onSend()
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (canSend) onSend()
      }}
      className="border-t bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 px-4 py-3">
        {photo && preview && (
          <div className="flex items-center gap-2 self-start rounded-lg border p-1.5 pr-1">
            <img
              src={preview}
              alt="Your fridge"
              className="size-12 rounded-md object-cover"
            />
            <span className="max-w-48 truncate text-sm">{photo.name}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Remove photo"
              onClick={() => {
                onRemovePhoto()
                textareaRef.current?.focus()
              }}
            >
              <X />
            </Button>
          </div>
        )}
        {photoError && (
          <p role="alert" className="text-sm text-destructive">
            {photoError}
          </p>
        )}
        <div className="relative flex items-end gap-2">
          {open && (
            <ul
              id={listId}
              // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA listbox for the textarea combobox; a native select or datalist cannot be driven from it
              role="listbox"
              aria-label="Ingredient suggestions"
              className="absolute bottom-full left-0 z-10 mb-2 w-64 max-w-full overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {options.map((option, index) => (
                // biome-ignore lint/a11y/useFocusableInteractive: focus stays on the textarea, which points at the option via aria-activedescendant
                // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard selection is handled by the combobox textarea
                <li
                  key={option}
                  id={`${listId}-${index}`}
                  // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA option of the combobox listbox
                  role="option"
                  aria-selected={index === highlighted}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pick(option)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-sm",
                    index === highlighted && "bg-accent text-accent-foreground",
                  )}
                >
                  {option}
                  {index === highlighted && (
                    <kbd aria-hidden className="text-xs text-muted-foreground">
                      Tab
                    </kbd>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Take a photo"
            className="hidden pointer-coarse:inline-flex"
            onClick={() => cameraInputRef.current?.click()}
          >
            <Camera />
          </Button>
          <input
            ref={cameraInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            capture="environment"
            aria-label="Camera photo"
            className="hidden"
            onChange={pickPhoto}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Choose a photo"
            onClick={() => photoInputRef.current?.click()}
          >
            <ImagePlus />
          </Button>
          <input
            ref={photoInputRef}
            type="file"
            accept={PHOTO_ACCEPT}
            aria-label="Upload photo"
            className="hidden"
            onChange={pickPhoto}
          />
          <Textarea
            ref={textareaRef}
            role="combobox"
            aria-label="Message"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={
              open ? `${listId}-${highlighted}` : undefined
            }
            placeholder="Type what you have…"
            rows={1}
            maxLength={MAX_TEXT_LENGTH}
            value={value}
            onChange={(event) =>
              edit(event.target.value, event.target.selectionStart)
            }
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            className="max-h-40 min-h-9 resize-none"
          />
          {/* Distinct keys: otherwise the Send button reuses Stop's DOM node and the same click submits the form. */}
          {streaming ? (
            <Button
              key="stop"
              type="button"
              size="icon"
              aria-label="Stop"
              onClick={(event) => {
                // Stop appears where Send was, so a double-click on Send lands its second click here.
                if (event.detail > 1) return
                onStop()
              }}
            >
              <Square />
            </Button>
          ) : (
            <Button
              key="send"
              type="submit"
              size="icon"
              aria-label="Send"
              disabled={!canSend}
            >
              <ArrowUp />
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
