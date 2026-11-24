import { expect, type Page, type Request, test } from "@playwright/test"

const CHAT_URL = "**/api/v1/chef/chat"

const sse = (events: Array<[string, unknown]>) =>
  events
    .map(
      ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join("")

type Stub = string | { status: number; body: string; contentType?: string }

const stubChat = async (page: Page, ...responses: Stub[]) => {
  let call = 0
  await page.route(CHAT_URL, (route) => {
    const stub = responses[Math.min(call, responses.length - 1)]
    call += 1
    const { status, body, contentType } =
      typeof stub === "string"
        ? { status: 200, body: stub, contentType: "text/event-stream" }
        : stub
    return route.fulfill({
      status,
      contentType: contentType ?? "application/json",
      headers: { "access-control-allow-origin": "*" },
      body,
    })
  })
}

const holdChat = async (page: Page) => {
  let release: () => void = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(CHAT_URL, async (route) => {
    await released
    await route
      .fulfill({
        status: 200,
        contentType: "text/event-stream",
        headers: { "access-control-allow-origin": "*" },
        body: sse([
          ["reply", REPLY],
          ["done", {}],
        ]),
      })
      .catch(() => {})
  })
  return release
}

const streamWithoutEnd = async (page: Page, body: string) => {
  await page.addInitScript((events) => {
    const realFetch = window.fetch
    window.fetch = (input, init) => {
      if (!String(input).includes("/api/v1/chef/chat")) {
        return realFetch(input, init)
      }
      const stream = new ReadableStream({
        start: (controller) =>
          controller.enqueue(new TextEncoder().encode(events)),
      })
      return Promise.resolve(
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
      )
    }
  }, body)
}

const sentForm = (request: Request) =>
  request.postDataBuffer()?.toString("latin1") ?? ""

const sentHistory = (request: Request): unknown => {
  const match = sentForm(request).match(
    /name="messages"\r\n\r\n([\s\S]*?)\r\n--/,
  )
  return match ? JSON.parse(match[1]) : null
}

const messageBox = (page: Page) =>
  page.getByRole("combobox", { name: "Message" })

const say = async (page: Page, text: string) => {
  await messageBox(page).fill(text)
  await messageBox(page).press("Enter")
}

const MEAL = {
  name: "Egg fried rice",
  ingredients_used: ["eggs", "rice"],
  missing_ingredients: ["soy sauce"],
  steps: ["Fry the rice", "Add the eggs"],
  source_url: "https://example.com/egg-fried-rice",
}

const REPLY = {
  text: "Here is a quick idea.",
  meals: [MEAL],
  quick_replies: ["Make it vegan", "Under 20 minutes"],
}

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
)
const fridge = { name: "fridge.png", mimeType: "image/png", buffer: PNG }

const replied = sse([
  ["reply", REPLY],
  ["done", {}],
])

test("The chef greets with starters and a starter sends its text", async ({
  page,
}) => {
  await stubChat(page, replied)
  await page.goto("/chef")

  await expect(
    page.getByText(
      "What's in your kitchen? Type what you have or add a photo of your fridge.",
    ),
  ).toBeVisible()

  const sent = page.waitForRequest(CHAT_URL)
  await page.getByRole("button", { name: "Eggs, rice and spinach" }).click()

  expect(sentHistory(await sent)).toEqual([
    { role: "user", text: "Eggs, rice and spinach", has_photo: false },
  ])
  await expect(
    page.getByRole("button", { name: "Something quick for dinner" }),
  ).toHaveCount(0)
})

test.describe("Logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("A logged-out visitor is sent to the login page", async ({ page }) => {
    await page.goto("/chef")

    await page.waitForURL("/login")
  })
})

test("The chat request carries the login token", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")

  const sent = page.waitForRequest(CHAT_URL)
  await say(page, "eggs, rice")

  expect((await sent).headers().authorization).toMatch(/^Bearer .+/)
})

test("The page is branded Fridge to Fork", async ({ page }) => {
  await page.goto("/chef")

  await expect(
    page.getByRole("heading", { level: 1, name: "Fridge to Fork" }),
  ).toBeVisible()
  await expect(page).toHaveTitle("Fridge to Fork")
})

test("Enter sends a typed message and clears the box", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")

  const sent = page.waitForRequest(CHAT_URL)
  await say(page, "eggs, rice")

  expect(sentHistory(await sent)).toEqual([
    { role: "user", text: "eggs, rice", has_photo: false },
  ])
  await expect(
    page.getByRole("list", { name: "Conversation" }).getByText("eggs, rice"),
  ).toBeVisible()
  await expect(messageBox(page)).toHaveValue("")
})

test("Shift+Enter adds a new line and blank text cannot be sent", async ({
  page,
}) => {
  await page.goto("/chef")

  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled()
  await messageBox(page).fill("eggs")
  await messageBox(page).press("Shift+Enter")
  await expect(messageBox(page)).toHaveValue("eggs\n")
})

test("The chef reply shows its searches, text, meal cards and quick replies", async ({
  page,
}) => {
  await stubChat(
    page,
    sse([
      ["status", { message: "Searching the web: egg rice recipes" }],
      ["reply", REPLY],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs, rice")

  await expect(page.getByText("Here is a quick idea.")).toBeVisible()
  await expect(
    page.getByText("Searching the web: egg rice recipes"),
  ).toBeVisible()
  const card = page.getByRole("article", { name: "Egg fried rice" })
  await expect(card.getByText("soy sauce")).toBeVisible()
  await card.getByRole("button", { name: /steps/i }).click()
  await expect(card.getByText("Fry the rice")).toBeVisible()
  await expect(
    card.getByRole("link", { name: /view recipe/i }),
  ).toHaveAttribute("href", "https://example.com/egg-fried-rice")
  await expect(
    page.getByRole("group", { name: "Suggested replies" }).getByRole("button"),
  ).toHaveText(["Make it vegan", "Under 20 minutes"])
})

test("The chef's words and meal cards show while it is still writing", async ({
  page,
}) => {
  await streamWithoutEnd(
    page,
    sse([
      ["status", { message: "Hunting for a quick fried rice" }],
      ["reply_delta", { text: "Here is " }],
      ["reply_delta", { text: "a quick" }],
      ["meal", MEAL],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs, rice")

  await expect(page.getByText("Here is a quick", { exact: true })).toBeVisible()
  const card = page.getByRole("article", { name: "Egg fried rice" })
  await expect(card).toBeVisible()
  await expect(card.getByRole("button", { name: "Add to list" })).toBeDisabled()
  await expect(page.getByText("Hunting for a quick fried rice")).toBeVisible()
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible()
})

test("The final reply takes over the streamed draft without duplicates", async ({
  page,
}) => {
  await stubChat(
    page,
    sse([
      ["reply_delta", { text: "Here is " }],
      ["reply_delta", { text: "a quick idea." }],
      ["meal", MEAL],
      ["reply", REPLY],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs, rice")

  await expect(page.getByText("Here is a quick idea.")).toHaveCount(1)
  const cards = page.getByRole("article", { name: "Egg fried rice" })
  await expect(cards).toHaveCount(1)
  await expect(cards.getByRole("button", { name: "Add to list" })).toBeEnabled()
  await expect(
    page.getByRole("button", { name: "Make it vegan" }),
  ).toBeVisible()
})

test("A non-http source does not render a link", async ({ page }) => {
  await stubChat(
    page,
    sse([
      [
        "reply",
        { ...REPLY, meals: [{ ...MEAL, source_url: "javascript:alert(1)" }] },
      ],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs")

  const card = page.getByRole("article", { name: "Egg fried rice" })
  await expect(card).toBeVisible()
  await expect(card.getByRole("link")).toHaveCount(0)
})

test("Tapping a quick reply sends the whole conversation", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  await say(page, "eggs, rice")
  await page.getByRole("button", { name: "Make it vegan" }).click()
  await expect(page.getByText("Here is a quick idea.")).toHaveCount(2)
  await page.unroute(CHAT_URL)
  const release = await holdChat(page)

  const sent = page.waitForRequest(CHAT_URL)
  await page.getByRole("button", { name: "Under 20 minutes" }).click()
  const history = sentHistory(await sent)

  expect(history).toEqual([
    { role: "user", text: "eggs, rice", has_photo: false },
    {
      role: "chef",
      text: "Here is a quick idea.",
      meals: [
        {
          name: "Egg fried rice",
          ingredients_used: ["eggs", "rice"],
          missing_ingredients: ["soy sauce"],
        },
      ],
    },
    { role: "user", text: "Make it vegan", has_photo: false },
    {
      role: "chef",
      text: "Here is a quick idea.",
      meals: [
        {
          name: "Egg fried rice",
          ingredients_used: ["eggs", "rice"],
          missing_ingredients: ["soy sauce"],
        },
      ],
    },
    { role: "user", text: "Under 20 minutes", has_photo: false },
  ])
  await expect(page.getByText("Thinking…")).toBeVisible()
  await expect(
    page.getByRole("group", { name: "Suggested replies" }),
  ).toHaveCount(0)
  release()
  await expect(
    page.getByRole("group", { name: "Suggested replies" }),
  ).toHaveCount(1)
})

test("The chef reply lands in the chat log", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  await say(page, "eggs, rice")

  await expect(page.getByRole("log", { name: "Chat" })).toContainText(
    "Here is a quick idea.",
  )
})

test("Typing suggests ingredients and Tab picks one", async ({ page }) => {
  await page.goto("/chef")

  await messageBox(page).fill("garl")
  await expect(messageBox(page)).toHaveAttribute("aria-expanded", "true")
  await expect(
    page.getByRole("option", { name: "garlic", exact: true }),
  ).toBeVisible()

  await messageBox(page).press("Tab")
  await expect(messageBox(page)).toHaveValue("garlic, ")
  await expect(messageBox(page)).toBeFocused()
  await expect(messageBox(page)).toHaveAttribute("aria-expanded", "false")
})

test("Arrow keys then Enter pick a suggestion without sending", async ({
  page,
}) => {
  let requests = 0
  await page.route(CHAT_URL, (route) => {
    requests += 1
    return route.abort()
  })
  await page.goto("/chef")

  await messageBox(page).fill("garl")
  const options = page.getByRole("listbox").getByRole("option")
  const second = await options.nth(1).textContent()
  await messageBox(page).press("ArrowDown")
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true")
  await messageBox(page).press("Enter")

  await expect(messageBox(page)).toHaveValue(`${second}, `)
  expect(requests).toBe(0)
})

test("Enter sends even while suggestions are open", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")

  await messageBox(page).fill("eggs, rice and spinach")
  await expect(page.getByRole("listbox")).toBeVisible()
  const sent = page.waitForRequest(CHAT_URL)
  await messageBox(page).press("Enter")

  expect(sentHistory(await sent)).toEqual([
    { role: "user", text: "eggs, rice and spinach", has_photo: false },
  ])
})

test("Escape closes suggestions and keeps the text", async ({ page }) => {
  await page.goto("/chef")

  await messageBox(page).fill("garl")
  await messageBox(page).press("Escape")

  await expect(page.getByRole("listbox")).toHaveCount(0)
  await expect(messageBox(page)).toHaveValue("garl")
})

test("Clicking a suggestion replaces only the current word", async ({
  page,
}) => {
  await page.goto("/chef")

  await messageBox(page).fill("eggs, tom")
  await page.getByRole("option", { name: "tomato", exact: true }).click()

  await expect(messageBox(page)).toHaveValue("eggs, tomato, ")
  await expect(messageBox(page)).toBeFocused()
})

test("Picking mid-text keeps the caret after the inserted word", async ({
  page,
}) => {
  await page.goto("/chef")

  await messageBox(page).fill("eggs, tom rice")
  for (let i = 0; i < " rice".length; i++) {
    await messageBox(page).press("ArrowLeft")
  }
  await expect(
    page.getByRole("option", { name: "tomato", exact: true }),
  ).toBeVisible()
  await messageBox(page).press("Tab")
  await page.keyboard.type("X")

  await expect(messageBox(page)).toHaveValue("eggs, tomato, X rice")
})

test("An attached photo previews and can be sent alone", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")

  await page.getByLabel("Upload photo").setInputFiles(fridge)
  await expect(page.getByRole("img", { name: "Your fridge" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled()

  const sent = page.waitForRequest(CHAT_URL)
  await page.getByRole("button", { name: "Send" }).click()
  const request = await sent

  expect(sentForm(request)).toContain('name="image"; filename="fridge.png"')
  expect(sentHistory(request)).toEqual([
    { role: "user", text: "", has_photo: true },
  ])
  await expect(
    page.getByRole("img", { name: "Fridge you shared" }),
  ).toBeVisible()
  await expect(page.getByRole("img", { name: "Your fridge" })).toHaveCount(0)
})

test("A photo is sent once, then only marked in history", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  await page.getByLabel("Upload photo").setInputFiles(fridge)
  await say(page, "what can I make?")
  await expect(page.getByText("Here is a quick idea.")).toBeVisible()

  const sent = page.waitForRequest(CHAT_URL)
  await page.getByRole("button", { name: "Make it vegan" }).click()
  const request = await sent

  expect(sentForm(request)).not.toContain('name="image"')
  expect(sentHistory(request)).toMatchObject([
    { role: "user", text: "what can I make?", has_photo: true },
    { role: "chef" },
    { role: "user", text: "Make it vegan", has_photo: false },
  ])
})

test("A removed photo is not sent", async ({ page }) => {
  await page.goto("/chef")

  await page.getByLabel("Upload photo").setInputFiles(fridge)
  await page.getByRole("button", { name: "Remove photo" }).click()

  await expect(page.getByRole("img", { name: "Your fridge" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Send" })).toBeDisabled()
  await expect(messageBox(page)).toBeFocused()
})

test("Unsupported or oversized photos are rejected", async ({ page }) => {
  await page.goto("/chef")
  const input = page.getByLabel("Upload photo")

  await input.setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hi"),
  })
  await expect(
    page.getByText("Use a JPEG, PNG, WebP or GIF photo."),
  ).toBeVisible()

  await input.setInputFiles({
    name: "huge.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(7 * 1024 * 1024 + 1),
  })
  await expect(page.getByText("Photo must be 7 MB or smaller.")).toBeVisible()
  await expect(page.getByRole("img", { name: "Your fridge" })).toHaveCount(0)
})

test("Snap my fridge opens the photo picker", async ({ page }) => {
  await page.goto("/chef")

  const chooser = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "Snap my fridge" }).click()
  await (await chooser).setFiles(fridge)

  await expect(page.getByRole("img", { name: "Your fridge" })).toBeVisible()
})

test("Dropping a photo anywhere attaches it", async ({ page }) => {
  await page.goto("/chef")

  const dataTransfer = await page.evaluateHandle((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const transfer = new DataTransfer()
    transfer.items.add(new File([bytes], "fridge.png", { type: "image/png" }))
    return transfer
  }, PNG.toString("base64"))
  const conversation = page.getByRole("list", { name: "Conversation" })
  await conversation.dispatchEvent("dragenter", { dataTransfer })
  await expect(page.getByText("Drop your photo to attach it")).toBeVisible()
  await conversation.dispatchEvent("dragover", { dataTransfer })
  await conversation.dispatchEvent("drop", { dataTransfer })

  await expect(page.getByRole("img", { name: "Your fridge" })).toBeVisible()
  await expect(page.getByText("Drop your photo to attach it")).toHaveCount(0)
  expect(page.url()).toContain("/chef")
})

test("Stop removes the pending message and puts its text back", async ({
  page,
}) => {
  await holdChat(page)
  await page.goto("/chef")
  await say(page, "eggs, rice")

  await expect(page.getByText("Thinking…")).toBeVisible()
  await page.getByRole("button", { name: "Stop" }).click()

  await expect(
    page
      .getByRole("list", { name: "Conversation" })
      .getByText("eggs, rice", { exact: true }),
  ).toHaveCount(0)
  await expect(page.getByText("Thinking…")).toHaveCount(0)
  await expect(messageBox(page)).toHaveValue("eggs, rice")
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled()
})

test("A chef error shows Retry, which resends the same conversation", async ({
  page,
}) => {
  await stubChat(
    page,
    sse([
      [
        "error",
        {
          detail:
            "The chef could not come up with meals right now. Please try again.",
        },
      ],
    ]),
    replied,
  )
  await page.goto("/chef")
  await page.getByLabel("Upload photo").setInputFiles(fridge)
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText(
    "The chef could not come up with meals right now.",
  )
  const retried = page.waitForRequest(CHAT_URL)
  await page.getByRole("button", { name: "Retry" }).click()
  const request = await retried

  expect(sentHistory(request)).toEqual([
    { role: "user", text: "eggs", has_photo: true },
  ])
  expect(sentForm(request)).toContain('filename="fridge.png"')
  await expect(page.getByText("Here is a quick idea.")).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("A validation error shows the server's detail without Retry", async ({
  page,
}) => {
  await stubChat(page, {
    status: 422,
    body: JSON.stringify({ detail: "Invalid conversation." }),
  })
  await page.goto("/chef")
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText("Invalid conversation.")
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0)
})

test("An offline chef says so without Retry", async ({ page }) => {
  await stubChat(page, {
    status: 503,
    body: JSON.stringify({ detail: "The chef is not configured." }),
  })
  await page.goto("/chef")
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText(
    "The chef is offline right now.",
  )
  await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0)
})

test("A server failure offers Retry", async ({ page }) => {
  await stubChat(page, { status: 500, body: "{}" })
  await page.goto("/chef")
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText(
    "Something went wrong. Please try again.",
  )
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()
})

test("A network failure says the connection was lost", async ({ page }) => {
  await page.route(CHAT_URL, (route) => route.abort())
  await page.goto("/chef")
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText("Connection lost.")
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible()
})

test("A stream that ends without done keeps the reply out of the thread", async ({
  page,
}) => {
  await stubChat(page, sse([["reply", REPLY]]))
  await page.goto("/chef")
  await say(page, "eggs")

  await expect(page.getByRole("alert")).toContainText("Connection lost.")
  await expect(page.getByText("Here is a quick idea.")).toHaveCount(0)
})

test("Sending a new message clears the error", async ({ page }) => {
  await stubChat(page, { status: 500, body: "{}" }, replied)
  await page.goto("/chef")
  await say(page, "eggs")
  await expect(page.getByRole("alert")).toBeVisible()

  await say(page, "and rice")

  await expect(page.getByText("Here is a quick idea.")).toBeVisible()
  await expect(page.getByRole("alert")).toHaveCount(0)
})

test("New chat clears the conversation", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  await expect(page.getByRole("button", { name: "New chat" })).toBeDisabled()
  await say(page, "eggs")
  await expect(page.getByText("Here is a quick idea.")).toBeVisible()

  await page.getByRole("button", { name: "New chat" }).click()

  await expect(page.getByText("Here is a quick idea.")).toHaveCount(0)
  await expect(
    page.getByRole("button", { name: "Eggs, rice and spinach" }),
  ).toBeVisible()
  await expect(page.getByRole("button", { name: "New chat" })).toBeDisabled()
})

test("Only the last 20 messages are sent", async ({ page }) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  for (let turn = 1; turn <= 10; turn += 1) {
    await say(page, `message ${turn}`)
    await expect(page.getByText("Here is a quick idea.")).toHaveCount(turn)
  }

  const sent = page.waitForRequest(CHAT_URL)
  await say(page, "message 11")
  const history = sentHistory(await sent) as Array<{
    role: string
    text: string
  }>

  expect(history).toHaveLength(20)
  expect(history[0].role).toBe("chef")
  expect(history[1]).toMatchObject({ role: "user", text: "message 2" })
  expect(history[history.length - 1]).toMatchObject({
    role: "user",
    text: "message 11",
  })
})

const TWO_MEALS = {
  ...REPLY,
  meals: [
    MEAL,
    {
      ...MEAL,
      name: "Fried rice with peas",
      missing_ingredients: ["Soy sauce", "peas"],
    },
  ],
}

test("Meals build a merged shopping list that can be copied", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  await stubChat(
    page,
    sse([
      ["reply", TWO_MEALS],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs, rice")

  for (const name of ["Egg fried rice", "Fried rice with peas"]) {
    await page
      .getByRole("article", { name })
      .getByRole("button", { name: "Add to list" })
      .click()
  }
  await expect(
    page
      .getByRole("article", { name: "Egg fried rice" })
      .getByRole("button", { name: "On list" }),
  ).toBeVisible()

  await page.getByRole("button", { name: /shopping list/i }).click()
  const sheet = page.getByRole("dialog", { name: "Shopping list" })
  await expect(sheet.getByRole("checkbox")).toHaveCount(2)
  await expect(sheet.getByText("soy sauce")).toBeVisible()
  await expect(sheet.getByText("peas")).toBeVisible()

  await sheet.getByRole("checkbox", { name: "soy sauce" }).check()
  await sheet.getByRole("button", { name: "Copy list" }).click()

  await expect(page.getByText("List copied")).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("peas")
})

test("The shopping list starts empty and New chat clears it", async ({
  page,
}) => {
  await stubChat(page, replied)
  await page.goto("/chef")
  await page.getByRole("button", { name: /shopping list/i }).click()
  const sheet = page.getByRole("dialog", { name: "Shopping list" })
  await expect(sheet.getByText("Add meals to build your list.")).toBeVisible()
  await expect(sheet.getByRole("button", { name: "Copy list" })).toBeDisabled()
  await page.keyboard.press("Escape")

  await say(page, "eggs")
  await page.getByRole("button", { name: "Add to list" }).click()
  await expect(
    page.getByRole("button", { name: "Shopping list, 1 item" }),
  ).toBeVisible()
  await page.getByRole("button", { name: "New chat" }).click()

  await expect(
    page.getByRole("button", { name: "Shopping list, 0 items" }),
  ).toBeVisible()
})

test("A meal with nothing to buy has no list button", async ({ page }) => {
  await stubChat(
    page,
    sse([
      ["reply", { ...REPLY, meals: [{ ...MEAL, missing_ingredients: [] }] }],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "eggs")

  const card = page.getByRole("article", { name: "Egg fried rice" })
  await expect(card).toBeVisible()
  await expect(card.getByRole("button", { name: "Add to list" })).toHaveCount(0)
})

test("A reply below the fold shows a New reply pill", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 })
  await stubChat(page, replied)
  await page.goto("/chef")
  for (let turn = 1; turn <= 3; turn += 1) {
    await say(page, `message ${turn}`)
    await expect(page.getByText("Here is a quick idea.")).toHaveCount(turn)
  }
  await page.unroute(CHAT_URL)
  const release = await holdChat(page)
  await say(page, "message 4")
  await page.getByRole("log", { name: "Chat" }).evaluate((scroller) => {
    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event("scroll"))
  })

  release()
  const pill = page.getByRole("button", { name: "New reply" })
  await expect(pill).toBeVisible()
  await pill.click()

  await expect(pill).toHaveCount(0)
  await expect(
    page.getByRole("group", { name: "Suggested replies" }),
  ).toBeInViewport()
})

test("The chat fits a phone screen without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await stubChat(
    page,
    sse([
      [
        "reply",
        {
          ...REPLY,
          meals: [
            {
              ...MEAL,
              missing_ingredients: ["x".repeat(80)],
            },
          ],
        },
      ],
      ["done", {}],
    ]),
  )
  await page.goto("/chef")
  await say(page, "y".repeat(200))
  await expect(page.getByText("Here is a quick idea.")).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  )
  expect(overflow).toBeLessThanOrEqual(0)

  const sidewaysScroll = (element: Element) =>
    element.scrollWidth - element.clientWidth
  expect(
    await page.getByRole("log", { name: "Chat" }).evaluate(sidewaysScroll),
  ).toBeLessThanOrEqual(0)

  await page.getByRole("button", { name: "Add to list" }).click()
  await page.getByRole("button", { name: /shopping list/i }).click()
  const sheet = page.getByRole("dialog", { name: "Shopping list" })
  await expect(sheet.getByRole("checkbox")).toBeVisible()
  expect(await sheet.evaluate(sidewaysScroll)).toBeLessThanOrEqual(0)
  expect(
    await sheet.getByRole("list").evaluate(sidewaysScroll),
  ).toBeLessThanOrEqual(0)
})
