import { Sparkle } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { ChefBotHelper, SearchTrail } from "./ChefBot"
import type { Meal } from "./chatApi"
import chefBot from "./images/chef-bot.svg"
import { MealCard } from "./MealCard"
import type { ChefMessage as ChefMessageData } from "./useChefChat"

export function ChefRow({
  children,
  pending = false,
}: {
  children: ReactNode
  pending?: boolean
}) {
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="chef-avatar" data-pending={pending}>
        <img src={chefBot} alt="" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 pt-1">{children}</div>
    </div>
  )
}

export function ProgressList({
  lines,
  active,
}: {
  lines: string[]
  active: boolean
}) {
  return (
    <ol
      aria-label="Chef progress"
      className="flex flex-col gap-1.5 text-sm text-muted-foreground"
    >
      {active && lines.length === 0 && (
        <li className="flex items-center gap-2">
          <Sparkle role="status" aria-label="Loading" className="step-tap" />
          Thinking…
        </li>
      )}
      {lines.map((line, index) => (
        <li key={`${index}-${line}`} className="flex items-center gap-2">
          {active && index === lines.length - 1 ? (
            <Sparkle role="status" aria-label="Loading" className="step-tap" />
          ) : (
            <Sparkle aria-hidden className="step-stamp" />
          )}
          <span className="wrap-anywhere">{line}</span>
        </li>
      ))}
    </ol>
  )
}

function Waiting({ searches }: { searches: string[] }) {
  return (
    <div className="flex items-center gap-4 self-start rounded-3xl bg-secondary/70 py-3 pr-5 pl-3 animate-in fade-in zoom-in-95 duration-300 motion-reduce:animate-none">
      <ChefBotHelper hunting={searches.length > 0} />
      <div className="flex min-w-0 flex-col gap-2">
        <ProgressList lines={searches} active />
        {searches.length > 0 && <SearchTrail />}
      </div>
    </div>
  )
}

type ChefMessageProps = {
  message: ChefMessageData
  pending?: boolean
  showQuickReplies: boolean
  onSend: (text: string) => void
  listed: Meal[]
  onToggleListed: (meal: Meal) => void
}

export function ChefMessage({
  message,
  pending = false,
  showQuickReplies,
  onSend,
  listed,
  onToggleListed,
}: ChefMessageProps) {
  if (pending && !message.text && message.meals.length === 0) {
    return (
      <ChefRow pending>
        <Waiting searches={message.searches} />
      </ChefRow>
    )
  }
  return (
    <ChefRow pending={pending}>
      {message.searches.length > 0 && (
        <ProgressList lines={message.searches} active={false} />
      )}
      <p className="animate-in fade-in duration-500 leading-relaxed whitespace-pre-wrap wrap-anywhere motion-reduce:animate-none">
        {message.text}
      </p>
      {message.meals.length > 0 && (
        <div className="grid items-start gap-4 md:grid-cols-2">
          {message.meals.map((meal, index) => (
            <MealCard
              key={`${index}-${meal.name}`}
              meal={meal}
              listed={listed.includes(meal)}
              onToggleListed={pending ? undefined : () => onToggleListed(meal)}
            />
          ))}
        </div>
      )}
      {showQuickReplies && message.quickReplies.length > 0 && (
        <fieldset
          aria-label="Suggested replies"
          className="flex flex-wrap gap-2 m-0 min-w-0 border-0 p-0"
        >
          {message.quickReplies.map((reply) => (
            <Button
              key={reply}
              variant="outline"
              size="sm"
              className="h-auto min-h-8 rounded-full text-left whitespace-normal"
              onClick={() => onSend(reply)}
            >
              {reply}
            </Button>
          ))}
        </fieldset>
      )}
    </ChefRow>
  )
}
