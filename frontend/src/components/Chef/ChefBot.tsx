import { Heart, Sparkle } from "lucide-react"
import chefBot from "./images/chef-bot.svg"
import chefBotAsleep from "./images/chef-bot-asleep.svg"
import chefBotSearching from "./images/chef-bot-searching.svg"

export function ChefBotHelper({ hunting }: { hunting: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="bot"
      data-mood={hunting ? "hunting" : "thinking"}
    >
      <img src={chefBot} alt="" className="bot-photo bot-thinking" />
      <img src={chefBotSearching} alt="" className="bot-photo bot-hunting" />
      <Heart className="bot-heart" />
      <Heart className="bot-heart" />
      <Heart className="bot-heart" />
    </div>
  )
}

export function SearchTrail() {
  return (
    <div aria-hidden="true" className="search-trail">
      {[0, 1, 2, 3, 4, 5].map((step) => (
        <Sparkle key={step} className="search-step" />
      ))}
    </div>
  )
}

export function ChefBotAsleep() {
  return (
    <div aria-hidden="true" className="bot-asleep">
      <img src={chefBotAsleep} alt="" />
      <span className="bot-z">z</span>
      <span className="bot-z">z</span>
      <span className="bot-z">z</span>
    </div>
  )
}
