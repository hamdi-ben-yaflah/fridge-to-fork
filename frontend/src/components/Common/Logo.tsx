import { Link } from "@tanstack/react-router"

import { cn } from "@/lib/utils"
import icon from "/icons/icon.svg"

interface LogoProps {
  variant?: "full" | "icon" | "responsive"
  className?: string
  asLink?: boolean
}

export function Logo({
  variant = "full",
  className,
  asLink = true,
}: LogoProps) {
  const content = (
    <span className={cn("flex items-center gap-2", className)}>
      <img src={icon} alt="" className="size-7 shrink-0 rounded-md" />
      {variant !== "icon" && (
        <span
          className={cn(
            "text-lg font-semibold whitespace-nowrap",
            variant === "responsive" && "group-data-[collapsible=icon]:hidden",
          )}
        >
          Fridge to Fork
        </span>
      )}
    </span>
  )

  if (!asLink) {
    return content
  }

  return <Link to="/">{content}</Link>
}
