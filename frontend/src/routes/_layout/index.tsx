import { createFileRoute, Link } from "@tanstack/react-router"
import { ChefHat } from "lucide-react"

import { Button } from "@/components/ui/button"

import useAuth from "@/hooks/useAuth"

export const Route = createFileRoute("/_layout/")({
  component: Dashboard,
  head: () => ({
    meta: [
      {
        title: "Dashboard - Fridge to Fork",
      },
    ],
  }),
})

function Dashboard() {
  const { user: currentUser } = useAuth()

  return (
    <div>
      <div>
        <h1 className="text-2xl truncate max-w-sm">
          Hi, {currentUser?.full_name || currentUser?.email} 👋
        </h1>
        <p className="text-muted-foreground">
          Welcome back, nice to see you again!!!
        </p>
      </div>
      <Button asChild className="mt-6">
        <Link to="/chef">
          <ChefHat />
          Open the kitchen
        </Link>
      </Button>
    </div>
  )
}
