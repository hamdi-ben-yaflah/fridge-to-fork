import { useEffect, useEffectEvent, useState } from "react"

const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

const MAX_PHOTO_BYTES = 7 * 1024 * 1024

export const PHOTO_ACCEPT = PHOTO_TYPES.join(",")

export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) {
    return "Use a JPEG, PNG, WebP or GIF photo."
  }
  if (file.size > MAX_PHOTO_BYTES) return "Photo must be 7 MB or smaller."
  return null
}

export function usePhotoUrl(file: File | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(file)
    setUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])

  return url
}

const carriesFiles = (event: DragEvent) =>
  event.dataTransfer?.types.includes("Files") ?? false

export function usePhotoDrop(onFile: (file: File) => void): boolean {
  const [dragging, setDragging] = useState(false)
  const deliver = useEffectEvent(onFile)

  useEffect(() => {
    // dragenter/dragleave fire for every child element crossed, so count them to know when the drag leaves the page.
    let depth = 0
    const enter = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth += 1
      setDragging(true)
    }
    const leave = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (event: DragEvent) => {
      if (carriesFiles(event)) event.preventDefault()
    }
    const drop = (event: DragEvent) => {
      if (!carriesFiles(event)) return
      event.preventDefault()
      depth = 0
      setDragging(false)
      const file = event.dataTransfer?.files[0]
      if (file) deliver(file)
    }
    window.addEventListener("dragenter", enter)
    window.addEventListener("dragleave", leave)
    window.addEventListener("dragover", over)
    window.addEventListener("drop", drop)
    return () => {
      window.removeEventListener("dragenter", enter)
      window.removeEventListener("dragleave", leave)
      window.removeEventListener("dragover", over)
      window.removeEventListener("drop", drop)
    }
  }, [])

  return dragging
}
