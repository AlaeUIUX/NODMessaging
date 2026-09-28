# NOD — architecture reference

Working notes from a full read-through of the codebase, kept for picking this
prototype back up without re-deriving everything from scratch. See also
`README.md` (stack/routes) and `AGENTS.md` (this Next.js version's docs live
under `node_modules/next/dist/docs/` — read the relevant guide before
touching App Router / build APIs, since this is *not* the Next.js in
training data).

## What NOD is

A messenger prototype: DMs + group "Spaces", with rich structured messages
("cards") — polls, checklists, reminders, locations, events, payments, bill
splitting, itineraries ("Plans"), Kanban boards ("Projects"), and small
"Artifacts" (doodle, tic-tac-toe, decision wheel) — plus **Mind**, a
per-person PKM/notes space (collections → pages → sections → blocks) that can
hold live references into chat messages.

Everything is client-side. There is no backend database: two browser tabs
talk to each other over `BroadcastChannel`, and state persists to
`localStorage` (+ `IndexedDB` for file/image bytes). The only real server
code is one API route that calls the Anthropic API to OCR a receipt photo.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, `npm run dev`.
- No global CSS framework: CSS Modules per component
  (`src/components/chat/*.module.css`), design tokens in `chat.module.css`,
  `globals.css` is just a reset.
- `@anthropic-ai/sdk` + `zod` for the one server route (`/api/receipt`).
- `@hugeicons/react`, `react-file-icon` for icons/file glyphs.
- No test suite, no state library (hand-rolled `useReducer` + Context), no
  router usage beyond the single `/` page (`/chat` redirects to `/`).

## Directory map

```
src/app/                    layout, the single `/` route, favicon/OG image, api/receipt
src/components/chat/        the entire UI (all client components, "use client")
src/lib/chat/               state, transport, persistence, seed data, pure helpers
```

Everything under `src/components/chat` renders inside a simulated iPhone
frame (`Device` in `ChatApp.tsx`) that sits on a marketing landing page
(`StageField` canvas background + floating feature cards). This is a
prototype/demo shell, not a real responsive web app shell — worth remembering
before "fixing" the phone-frame layout.

## Data model (`src/lib/chat/types.ts`)

- `Message` — id/clientId (client id is stable across optimistic→server ack,
  used to reconcile retries), `authorId`, `kind` (`text`|`voice`|`card`),
  `body` (markdown string), `attachments`, `reactions`, `replyToId`,
  `editHistory`, `pinned`, `deletedAt` (soft delete — wipes body/attachments
  but keeps the row so ordering/threads survive), `readBy` (per-user read
  timestamps), `card?`.
- `Card` — a big discriminated union: `poll | checklist | reminder | location
  | event | payment | sketch | tictactoe | wheel | plan | bill | project`.
  Two different sync strategies (see below).
- `ChatState` — `chats`, `messages` (by chatId), `archive` (older pages not
  yet paged into the thread), `lastReadAt`.
- `ChatTransport` / `TransportEvent` — the pub/sub contract; the doc comment
  in `transport.ts` explicitly says a WebSocket/Pusher/Ably adapter would
  implement the same interface with zero changes above it.
- `ChatStorage` — load/save state + per-chat per-user draft text.

### Two ways a card changes state

1. **Whole-card replace** (`updateCard` in `store.tsx`, `{ type: "card" }`
   transport event): poll votes, checklist toggles, reminders, events,
   sketch strokes, tic-tac-toe, wheel spins. Simple, but a naive "last write
   wins" — fine for their access patterns (single-field diffs are rare) but
   note this if you ever build a feature where two people edit the same
   whole-card object concurrently in a conflicting way.
2. **Ops** (`cardOp`, `{ type: "card-op" }`, reduced by
   `lib/chat/ops.ts::reduceCardOp`): plans, bills, projects. Each op names
   exactly what it touches (`plan.tick`, `bill.claim`, `task.update` with a
   per-field `updatedAt` timestamp for last-write-wins *per field*), so it's
   idempotent and commutative — every tab applies every op in whatever order
   it arrives and converges. This is the pattern to copy for any new
   "shared, collaboratively edited" card type.

`Task.updatedAt` merges per-field by timestamp (`task.update`'s reducer in
`ops.ts`) — a genuinely CRDT-ish detail worth preserving if you extend Task.

## State & realtime (`src/lib/chat/store.tsx`)

- One big `useReducer` (`State { data: ChatState; typing; hydrated }`) inside
  `ChatProvider`, exposed via `useChat()`.
- **Identity is per-tab**, not per-browser: `me` lives in `sessionStorage`
  (`nod.chat.me`), so opening `/?as=charles` in a second tab lets you message
  yourself. `ChatApp`'s "Open a second window" link relies on this.
- **Realtime**: `createBroadcastTransport()` (one `BroadcastChannel` per tab)
  fires `TransportEvent`s. Every tab of the *same browser* sees every event,
  filtered to what its signed-in `me` should see (chat membership etc. — no
  server-side authorization exists, it's all trust-the-tab). Presence
  (`peers`) is a heartbeat (`PRESENCE_INTERVAL_MS` = 2s, timeout 6s).
- **Simulation**: if nobody else has a tab open as the chat's other member(s)
  (`memberOnline`), `simulate()` / `simulateCard()` fake a reply — typing
  indicator, canned text reply, or a scripted card interaction (someone votes
  a poll, claims a bill item, RSVPs, etc.) after a delay. This is how the
  demo feels "alive" solo. If you add a new card type, consider whether it
  needs a `simulateCard` branch or it'll just sit inert when demoed alone.
- **Persistence**: on every `data` change, `localStorageAdapter.save` writes
  the whole `ChatState` as JSON to `localStorage` under `nod.chat.state`
  (`storage.ts`). `saveFailed` tracks quota errors and surfaces a banner.
  `migrate()` is a real versioned-migration function (`CURRENT_VERSION` in
  `seed.ts`, currently 8) with a v5 cast-rename hack (`renameCast`) — a
  useful pattern if user-facing names change again later.
- Attachment **bytes never touch localStorage or the BroadcastChannel** —
  only metadata (`Attachment.stored: "idb"`) does. Real bytes live in
  IndexedDB (`lib/chat/media.ts`, DB `nod-media`), resolved to blob: URLs via
  `useMediaUrl`. `releaseMedia`/`clearMedeia` matter for the "Reset demo
  data" dev-drawer action and for deleted messages.
- `ChatContextValue` is the one big surface (`send`, `sendCard`, `updateCard`,
  `cardOp`, `retry`, `toggleReaction`, `editMessage`, `deleteMessage`,
  `togglePin`, `loadEarlier`/`hasEarlier` (pagination from `archive`),
  `setTyping`/`typingUsers`, `markRead`). Read it top-to-bottom once; nearly
  every feature component consumes a slice of it.

## Mind (`src/lib/chat/mind.ts`)

A **second, entirely separate store** — not part of `ChatState`/`ChatProvider`.
Its own `localStorage` key (`nod.mind.v3`), one `Mind` object per userId,
read/written via a module-level cache + `useSyncExternalStore`
(`useMind(userId)`), cross-tab sync via the `storage` event (not
BroadcastChannel). If you touch Mind persistence, this is a different code
path than chat persistence — don't assume they share plumbing.

Model: `Mind.collections[]` → each has `pages[]` (tree via `parentId`) and a
`vault[]` (an inbox of un-sorted saves) → each `page.sections[]` holds
`blockIds[]` → `Mind.blocks` is a flat `Record<id, Block>` (blocks are shared
by reference-id across sections/vault, never duplicated).

`saveToMind()` / `routeSave()` is a small heuristic "smart filing" engine:
scores every collection by (a) whether this chat is already associated with
it (`chatIds`, learned via `learnChat` when the user manually moves a saved
item), (b) word-overlap between the message text and the collection's
existing titles/tags, (c) content-type heuristics (photos → photo-heavy
collections, payment/bill → collections with `amount` blocks, etc.). This is
the piece to look at if "Save to Mind" ever files things somewhere wrong —
it's simple and no ML.

`Block.kind === "chat"` blocks are **live references**: they store
`{chatId, messageId}` and re-render the live message via `LiveChatBlock` in
`MindBlocks.tsx` — if the source message changes or is deleted, the Mind
item updates/shows "The original was deleted" automatically. Nothing is
duplicated into Mind.

## Feature deep-dives

- **Plans** (`lib/chat/plan.ts` + `components/Plans.tsx`): the builder
  accepts free-text, one stop per line (`13:00 Lunch @ Figlmüller €16`,
  `Day 2` starts a new day) — parsed by `parsePlanText`/`parseStopLine`, a
  small hand-written line grammar (time, `@place`, `€cost`). `planStatus()`
  computes "now"/"next" stop from wall-clock time for the live card. Cost
  splitting is flat per-stop (`cost` = per-person), not proportional.
- **Bills** (`lib/chat/receipt.ts`, `ops.ts::billShares`,
  `components/Bill.tsx`): flow is photo → `/api/receipt` (Claude
  `messages.parse` with a Zod schema, `output_config.format`) → editable
  review (with a "receipt total vs items total" mismatch reconciliation UI)
  → per-item claiming → send. `billShares()` splits items evenly among
  claimants and spreads tax/tip proportionally to each person's claimed
  share, with largest-remainder rounding so shares sum exactly to the total
  (integer cents everywhere past the parser — `parseMoney`/`centsToInput`
  handle locale decimal separators).
- **Projects/boards** (`lib/chat/project.ts`, `components/Project.tsx`,
  ~1100 lines, the biggest component): Kanban with pointer-based
  hold-then-drag (350ms hold, `HOLD_MS`), one card can hold *multiple*
  boards (`projectsOf(messages)`), `/task Title @Name friday` command syntax
  parsed by `parseTaskCommand`+`parseDue` (also usable straight from the
  composer or "Make a task" on any message). Column deletion turns tasks
  into tombstones (`deleted: true`), never removes them, so a late op from
  another tab can't resurrect a task into a column that's gone.
- **Artifacts** (`components/Artifacts.tsx`): doodle is an SVG freehand
  smoother (`pathOf`, Catmull-esque quadratic through midpoints); tic-tac-toe
  has a simple heuristic bot (`botMove`) that plays when you're solo;
  decision wheel computes a rotation from spin count + a deterministic
  "random-looking" offset so re-renders don't jitter the resting angle.
- **Reminders / "Live" tab / notifications**: `lib/chat/open.ts::openState`
  is the single place that answers "is this card still open, does it need
  *me*, what's the one-line summary" for every card type — used by the chat
  header's blue dot, `ContactPage`'s "Live" tab, and the Spaces tab's task
  list. **Adding a new card type almost always means adding a case here.**
  `ChatApp.tsx::ReminderWatcher` polls every second across all chats for due
  reminders/plan stops/task due-dates and raises an in-app banner (real
  Notification API is never used — permissions are simulated, see below).

## UI conventions worth knowing before adding a screen

- **Permissions are fully simulated** (`components/ui.tsx`): `getPermission`/
  `setPermission` persist to `localStorage` (`nod.perm.<kind>`), and
  `PermissionAlert` renders an iOS-style in-app alert. Nothing calls the
  real `Notification`/`Geolocation`/`MediaDevices` APIs. `ChatView::ask()` is
  the entry point every feature calls before doing something "permissioned".
- **`ChatUiProvider`/`useChatUi()`** (`ui.tsx` + `ChatView.tsx`): a
  screen-level context so cards buried deep in the scrolling thread can open
  full-screen sheets/toasts/media viewers/boards without prop-drilling.
  Any card component assumes it's rendered under this provider — it will
  throw ("useChatUi must be used inside ChatView") if reused elsewhere
  without wrapping it.
- **`Sheet` component** (`ui.tsx`) is the one bottom-sheet primitive used
  everywhere (Cancel · Title · Action header, focus trap via `useDialog`,
  animated close via a callback-based `close(after?)` so a sheet can chain
  into opening the next one without a flash of the old one).
- **Back-button-as-navigation** (`useBackLayer` in `ui.tsx`,
  `ChatApp.tsx::Device`'s pushState dance): overlays that should be dismissed
  by the phone's physical/gesture Back button (`ContactPage`, `ProjectBoard`,
  the chat screen itself) each push a `history.pushState` entry and listen
  for `popstate`. If you add a new full-screen overlay that should behave
  like a "screen", wire it through `useBackLayer`, don't just conditionally
  render it.
- **Swipe gesture pattern** repeats three times with slightly different
  code: `Inbox.tsx::SwipeRow` (pin/mute reveal), `MessageRow.tsx` (swipe to
  reply + long-press to open `MessageOverlay`), `Mind.tsx::SwipeItem`
  (move/remove reveal). All hand-rolled with Pointer Events, no gesture
  library. If unifying, this is the duplication to target — but each has
  small behavioral differences (rubber-banding, thresholds) so verify UX
  parity before merging.
- **Optimistic send lifecycle**: `send()`/`sendCard()` in `store.tsx` create
  a `status: "pending"` message immediately, call the fake
  `lib/chat/api.ts::sendMessage` (~420–700ms random latency, or throws if
  `setForceFailure(true)`/offline — toggle in the dev drawer), then patch
  status to `sent`/`failed`. `retry()` replays the same path. This is worth
  preserving exactly if you add a real backend later — the whole app already
  assumes eventual/optimistic delivery.
- **Theming**: `data-theme="light"|"dark"` on the outer div in `ChatApp.tsx`
  (persisted to `localStorage nod.theme`), plus a separate `--stage` CSS var
  for the landing-page hero background color (`nod.stage`, dev-drawer
  swatches). CSS modules read these via `[data-theme=...]` selectors in
  `chat.module.css`.
- **Emoji rendering**: everything renders Apple emoji images via a CDN
  (`lib/chat/emoji.tsx`, jsDelivr `emoji-datasource-apple`) instead of
  relying on the OS emoji font, with a same-character fallback to native
  text on image load failure. Any place that shows user text with emoji
  should run it through `emojify()` for visual consistency (see
  `stripFormatting`/`renderBody` for where it's already wired in).
- **Rich text is a small custom markdown dialect**
  (`lib/chat/richText.ts` + `markdown.tsx`): the composer is a
  `contentEditable` div using `document.execCommand` (deprecated but kept for
  free undo/redo), serialized to/from markdown (`htmlToMarkdown`/
  `markdownToHtml`) rather than storing HTML. Long-form posts are detected by
  a leading `# ` heading and rendered as a "document" bubble instead of a
  chat bubble (`isDoc()` in `MessageRow.tsx`).

## Analytics tab (replaces the old Spaces nav tab)

Group chats were never exclusive to the old "Spaces" tab — the Chats tab's
`rows` already included every chat the signed-in person belongs to, `dm` and
`group` alike, filterable via chips (the "Spaces" chip is now labelled
"Groups"). So retiring the Spaces nav tab and giving that slot to
**Analytics** (`components/chat/Analytics.tsx`, `activity.module.css`) only
removed a redundant view, not a destination for group chats.

Analytics is a cross-chat feed of every card anyone has created (checklist,
poll, reminder, event, location, plan, project/board, payment, bill, sketch,
tic-tac-toe, wheel) — not just the still-open ones. It deliberately does
**not** reuse `lib/chat/open.ts::openState`, whose "is this still open"
semantics are the wrong shape here (e.g. it returns `null` for a settled
one-off `payment` or for `sketch`/`wheel`, which this feed still needs to
show). `Analytics.tsx::summarize()` is a parallel, from-scratch summarizer
covering all 12 card types. Categories mirror `CardBuilders.tsx`'s existing
`GROUPS` taxonomy from the "Add to message" sheet — **Together** / **Money**
/ **Artifacts** (`location`/`project` count as Together, matching that
sheet) — filtered via a dropdown (`CategoryPicker`, styled after
`ProjectBoard`'s board-switcher popover). `MyTasks` (cross-board task list,
formerly Spaces-tab-only) now lives pinned above the feed, shown only for
the "All"/"Together" filters.

Tapping a row opens the chat **and scrolls to that exact message**: `Inbox`'s
`onOpen` gained an optional `messageId` second argument, threaded through
`ChatApp.tsx::Device`'s `show`/`open` (as `focusMessageId` state) down to
`ChatView`, which — once mounted — calls its existing `jumpTo()` after a
short delay (same 260ms pattern `ContactPage`'s `onJump` already used). This
same plumbing is reusable for any future "deep link to one message from
outside the open chat" feature.

## Seed data & demo personas

`lib/chat/seed.ts` builds a fixed cast (`me`/Alae, `charles`, `jamshad`,
`reema`, `salman`) and five chats, with feature demos assembled from
`seed-plan.ts`/`seed-bill.ts`/`seed-project.ts` and spliced in by
`buildSeedState()`. `mind.ts` seeds a *different* Mind per persona
(`alaeMind`/`charlesMind`/`reemaMind`; jamshad/salman start blank) — see
`ChatApp.tsx::MIND_PERSONAS` for the human-readable summary shown in the dev
drawer. The dev drawer (`ChatApp.tsx::DevDrawer`, only reachable via the
`<details>` element at the bottom of the page) is the fastest way to switch
identity, force a send failure, or wipe all local storage/IndexedDB back to
the seed.

## The one server route

`src/app/api/receipt/route.ts` — POSTs a downsized photo (client-side
`downscaleImage` in `receipt.ts`, ≤1600px JPEG) to Claude
(`claude-opus-5`, low-effort structured output via `zodOutputFormat`) and
returns parsed line items. Guards: same-origin check via `Origin`/`Host`
headers, a naive in-memory per-IP rate limiter (10/min), content-length caps.
Returns 501 if `ANTHROPIC_API_KEY` is unset — the client falls back to
manual entry or the bundled sample receipt (`SAMPLE_RECEIPT`) in that case.
This is the only place secrets/env vars matter.

## Things to double-check before extending

- No automated tests exist anywhere — verify changes by running `npm run
  dev` and using the "Open a second window" (`/?as=charles`) trick, plus the
  dev drawer's "Signed in as" switcher and "Force send failure" toggle.
- `npm run lint` (ESLint) is the only CI-ish gate mentioned in `README.md`.
- Adding a new `Card` type means touching, at minimum: `types.ts` (union +
  any new `CardOp`s), `CardView.tsx` (render dispatch), `open.ts`
  (`openState` case — required for the header dot / Live tab / notifications
  to work at all), `CardBuilders.tsx` or its own builder file (compose flow),
  and — if you want the "alone in the demo" simulation to look alive —
  `store.tsx::simulateCard`.
