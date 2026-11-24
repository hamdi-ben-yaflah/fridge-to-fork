import { Copy, ShoppingBasket } from "lucide-react"
import { useId, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/useMobile"
import { cn } from "@/lib/utils"
import { ChefBotAsleep } from "./ChefBot"
import type { Meal } from "./chatApi"

function uniqueItems(meals: Meal[]): string[] {
  const items = new Map<string, string>()
  for (const meal of meals) {
    for (const raw of meal.missing_ingredients) {
      const item = raw.trim()
      const key = item.toLowerCase()
      if (key && !items.has(key)) items.set(key, item)
    }
  }
  return [...items.values()]
}

export function ShoppingList({ meals }: { meals: Meal[] }) {
  const isMobile = useIsMobile()
  const idPrefix = useId()
  const [got, setGot] = useState<ReadonlySet<string>>(new Set())
  const items = uniqueItems(meals)
  const toBuy = items.filter((item) => !got.has(item.toLowerCase()))

  const toggle = (item: string, checked: boolean) => {
    setGot((previous) => {
      const next = new Set(previous)
      if (checked) next.add(item.toLowerCase())
      else next.delete(item.toLowerCase())
      return next
    })
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toBuy.join("\n"))
      toast.success("List copied")
    } catch {
      toast.error("Couldn't copy the list.")
    }
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Shopping list, ${items.length} ${items.length === 1 ? "item" : "items"}`}
        >
          <ShoppingBasket data-icon="inline-start" />
          <span className="hidden sm:inline">List</span>
          {items.length > 0 && (
            <Badge variant="secondary">{items.length}</Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="max-h-[85dvh]"
      >
        <SheetHeader>
          <SheetTitle className="font-display text-xl font-medium">
            Shopping list
          </SheetTitle>
          <SheetDescription>
            What you still need for the meals you added.
          </SheetDescription>
        </SheetHeader>
        {items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia>
                <ChefBotAsleep />
              </EmptyMedia>
              <EmptyTitle>Nothing yet</EmptyTitle>
              <EmptyDescription>Add meals to build your list.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="flex flex-col gap-1 overflow-y-auto px-4">
            {items.map((item, index) => {
              const id = `${idPrefix}-${index}`
              const checked = got.has(item.toLowerCase())
              return (
                <li key={item} className="flex items-center gap-3 py-1.5">
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={(value) => toggle(item, value === true)}
                  />
                  <Label
                    htmlFor={id}
                    className={cn(
                      "wrap-anywhere",
                      checked && "text-muted-foreground line-through",
                    )}
                  >
                    {item}
                  </Label>
                </li>
              )
            })}
          </ul>
        )}
        <SheetFooter>
          <Button onClick={copy} disabled={toBuy.length === 0}>
            <Copy data-icon="inline-start" />
            Copy list
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
