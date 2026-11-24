import {
  Check,
  ChevronDown,
  ExternalLink,
  type LucideIcon,
  Plus,
  ShoppingBasket,
} from "lucide-react"
import { useId } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import type { Meal } from "./chatApi"

function httpUrl(url: string | null): string | null {
  if (!url) return null
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null
  } catch {
    return null
  }
}

function IngredientGroup({
  label,
  icon: Icon,
  items,
  variant,
}: {
  label: string
  icon: LucideIcon
  items: string[]
  variant: "secondary" | "outline"
}) {
  if (items.length === 0) return null
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        {label}
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <li key={item}>
            <Badge
              variant={variant}
              className="h-auto max-w-full text-left whitespace-normal wrap-anywhere"
            >
              {item}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function MealCard({
  meal,
  listed,
  onToggleListed,
}: {
  meal: Meal
  listed: boolean
  onToggleListed?: () => void
}) {
  const titleId = useId()
  const source = httpUrl(meal.source_url)

  return (
    <Card
      role="article"
      aria-labelledby={titleId}
      className="animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none"
    >
      <CardHeader>
        <CardTitle
          id={titleId}
          className="font-display text-xl font-medium leading-snug"
        >
          {meal.name}
        </CardTitle>
        {source && (
          <CardAction>
            <Button variant="link" size="sm" asChild className="-my-1 px-0">
              <a href={source} target="_blank" rel="noopener noreferrer">
                View recipe
                <ExternalLink data-icon="inline-end" />
              </a>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <IngredientGroup
          label="You have"
          icon={Check}
          items={meal.ingredients_used}
          variant="secondary"
        />
        <IngredientGroup
          label="To buy"
          icon={ShoppingBasket}
          items={meal.missing_ingredients}
          variant="outline"
        />
        {meal.steps.length > 0 && (
          <Collapsible className="flex flex-col gap-2 border-t pt-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="group -ml-2.5 w-fit">
                {meal.steps.length} {meal.steps.length === 1 ? "step" : "steps"}
                <ChevronDown
                  data-icon="inline-end"
                  className="transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none">
              <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed marker:text-muted-foreground">
                {meal.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
      {meal.missing_ingredients.length > 0 && (
        <CardFooter>
          <Button
            variant={listed ? "secondary" : "outline"}
            size="sm"
            disabled={!onToggleListed}
            onClick={onToggleListed}
          >
            {listed ? (
              <Check
                data-icon="inline-start"
                className="animate-in zoom-in-50 spin-in-[-30deg] duration-300 motion-reduce:animate-none"
              />
            ) : (
              <Plus data-icon="inline-start" />
            )}
            {listed ? "On list" : "Add to list"}
          </Button>
        </CardFooter>
      )}
    </Card>
  )
}
