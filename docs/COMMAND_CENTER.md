# Command: running a live event from NOD

> **Hand-off spec for a new Claude Code session.** It describes the feature, the decisions already
> made, how it fits the existing code, and the order to build it in. Build a **clickable
> prototype** first: it gets shown to Rima (the CEO, a physical-events project manager) before any
> discussion, so she can point at what's wrong. Breadth and a convincing demo come before edge cases.

---

## 0. Before you start (read this first)

- This is **Next.js 16.3.5** with breaking changes. Read the relevant guide in
  `node_modules/next/dist/docs/` before writing framework code (see `AGENTS.md`).
- React 19 with the **React Compiler lint rules**: no `Date.now()` / `Math.random()` during render,
  no ref reads during render, no setState inside effects synchronously. Run `npx eslint src` and
  `npx tsc --noEmit -p .` after every step; `npx next build` before you finish.
- Styling: **CSS modules** next to components, design tokens only (`var(--ink)`, `--ink-2/3`,
  `--surface`, `--bg`, `--line`, `--accent`, `--ok`, `--warn`, `--bad`, `--r-pill`, `--r-md`,
  `--t-*` fonts, `--e1..e4` shadows, `--ease-*`, `--t-fast/mid/slow`). Must work in dark mode.
  CSS-module gotcha: a shorthand `animation: 2s infinite both;` **without a name** is dropped by
  the build. Give the name, or use longhands.
- Icons: Hugeicons via `src/components/chat/Icons.tsx` (`make(SomeIcon)`).
- Everything persists in **localStorage**, shared across tabs via BroadcastChannel. There's no
  server. The demo is single-device; `?as=charles` opens a second window as another person.
- **Testing:**
  - Use Playwright MCP; screenshots go to `.playwright-mcp/`, so delete that folder when done.
  - Skip onboarding with `localStorage.setItem('nod.accounts', '["me"]')`.
  - The dev server may not be on port 3000 (another app took it); check `preview_list`.
- Commit or push only when the user asks. Pushing `main` deploys live.

### Conventions this codebase already uses (reuse them; don't reinvent)

| Need | Use |
|---|---|
| Bottom sheets | `Sheet` in `ui.tsx` (title, Cancel, `action` top-right, `close(after)` child fn) |
| Screen-level sheets/overlays inside a chat | `useChatUi().openSheet / closeSheet / toast` |
| Hold for a context menu (like a message) | `useHoldMenu()` + `HoldMenu` in `MindHold.tsx` |
| Segmented control, toggle | `Segmented`, `Toggle` in `ui.tsx` |
| Horizontal rows | `DragScroll` from `Composer.tsx` (`sideWheel={false} glide` inside scrolling pages) |
| Charts | `Charts.tsx` (Recharts: `TrendChart`, `DonutChart`, `PartBars`, `StackedBar`) |
| Dashboard widgets | `lib/chat/widgets.ts`, `Widgets.tsx`, `WidgetBodies.tsx` |
| Groups, channels, roles, permissions | `lib/chat/groups.ts` (`groupInfo`, `can`, `canSee`, `canPost`, `upsertChannel`, `upsertRole`, `syncChannels`), `Groups.tsx`, store `updateGroup` |
| Interactive cards in a thread | `Card` union in `lib/chat/types.ts`, `CardOp` + reducer in `lib/chat/ops.ts`, store `cardOp` / `updateCard`, renderers in `CardBuilders.tsx` / `MindBlocks.tsx` |
| Boards and tasks | `lib/chat/project.ts`, `Project.tsx` (`ProjectBoard`, `TaskSheet`) |
| Muting | `lib/chat/mutes.ts` (`MuteRule`, `effectiveRule`) |
| Demo data | `lib/chat/seed*.ts`, built by `buildSeedState` |

---

## 1. The idea in one paragraph

Rima runs huge physical events, for example the **Esports World Cup in Riyadh**. Dozens of teams
work in different rooms and areas at once. She needs one place to see every area, move people where
they're short, push announcements everyone must read, and let people on the ground see exactly what
to do *where they are*. In NOD this becomes **Command**: a group can be switched into an
**Operation**, which adds **Zones** (physical places), **Crews** (teams), **Broadcasts** (must-read
announcements), **Requests** (staff, moves, supplies, issues, with approval) and a **Command
console**. It is built on groups, channels, roles, boards and widgets, not as a separate app.

> Naming: the user called it "call center"; the product name is **Command** (an event is an
> **Operation**). Keep the copy consistent with that. If Rima prefers another name, it's one find
> and replace in the copy.

---

## 2. Decisions already made (recommended answers; build to these)

These were open questions for Rima. Build to these answers; she'll correct them after seeing the
prototype.

1. **Who approves requests?** Admins and anyone with a new permission **`approveRequests`** (give it
   to a "Command" role). A **zone lead** can approve requests *within their own zone* (for example,
   swapping a task owner) but not moves between zones. Every decision is logged in the ops feed.
2. **How do people check in?** **Tap "I'm here"** on the zone, or **scan the zone's QR code**
   (simulated in the prototype: a "Scan" button opens a picker of zone codes). Command and leads can
   also **assign** someone to a zone, which sends them a move request. One current zone per person.
3. **Do critical broadcasts break through mute?** **Yes.** Two levels: **Normal** (respects mutes) and
   **Critical** (ignores mutes and Do Not Disturb, shows a full-screen banner, needs "Got it").
   Only `approveRequests` / admins can send Critical.
4. **Shifts?** **Yes, simply:** an Operation has **days**, and each day has **shifts** (Morning 08–16,
   Evening 16–24). People are rostered per shift. The console defaults to the current shift.
   Phase 1 only needs the data and a shift switcher; no rota editor yet.
5. **What device is Command used on?** **Tablet or laptop first** (a wider console layout above
   ~900px), with a **phone layout** that still works. Crew views are **phone first**. The prototype
   lives in the same phone frame; add a **"Command display"** wide mode reachable from the group
   (opens a full-width overlay, like the board).
6. **Bad signal in venues?** Assume it. Requests, check-ins and task updates are **queued locally**
   and show "Sending…", then "Sent". The prototype only needs the visual state (a small cloud icon
   with pending count), not real offline sync.
7. **Reports after the event?** **Yes, light:** an end-of-day summary (people per zone over time,
   requests raised, approved and average time to approve, tasks done, broadcasts and read rate).
   Build it as Dashboard widgets plus a "Day report" sheet.

---

## 3. Concepts and data model

All new types go in `src/lib/chat/types.ts` (or a new `src/lib/chat/ops.ts`-style module
`src/lib/chat/command.ts` for helpers). Persist inside the group's `GroupInfo` (so `updateGroup` and
cross-tab sync just work), plus cards in channel threads.

```ts
// On GroupInfo (optional: only Operations have it)
interface Operation {
  kind: "operation";
  name: string;               // "EWC 2026 · Riyadh"
  venue: string;              // "Boulevard Riyadh City"
  startsAt: number; endsAt: number;
  days: OpDay[];              // each with shifts
  zones: Zone[];
  crews: string[];            // role ids that are crews (Crews ARE roles; reuse GroupRole)
  floorPlan?: string;         // image URL or data URL of the venue map
  presence: Record<string, Presence>;   // userId -> where they are
  feed: OpEvent[];            // what happened, newest last (cap ~300)
}
interface OpDay { id: string; date: number; shifts: { id: string; name: string; from: number; to: number; roster: Record<string, string[]> /* zoneId -> userIds */ }[] }
interface Zone {
  id: string;
  channelId: string;          // every zone IS a channel of the group (#main-arena)
  name: string;               // "Main Arena"
  code: string;               // short code for QR / radio: "A1"
  area?: string;              // "Hall A · Level 1"
  tone: AvatarTone;
  target: number;             // people needed now
  leadId?: string;
  crews: string[];            // which crews work here
  pin?: { x: number; y: number };   // 0..1 on the floor plan
  status: "ok" | "busy" | "issue" | "closed";
}
interface Presence { zoneId: string | null; since: number; via: "tap" | "qr" | "assigned"; shiftId?: string }
type OpEvent =
  | { kind: "checkin" | "checkout"; userId: string; zoneId: string; at: number }
  | { kind: "request"; requestId: string; at: number }          // raised / decided
  | { kind: "broadcast"; messageId: string; at: number }
  | { kind: "task"; taskId: string; zoneId: string; at: number; done: boolean }
  | { kind: "zone"; zoneId: string; status: Zone["status"]; by: string; at: number };
```

New card types (add to the `Card` union and `CardOp`, reducer in `lib/chat/ops.ts`):

```ts
// A request, posted in the zone's channel and mirrored in the console queue
{ type: "request";
  kind: "staff" | "move" | "supplies" | "issue";
  zoneId: string;              // where it's needed
  fromZoneId?: string;         // for moves
  count?: number;              // staff: how many people
  people?: string[];           // move: who (chosen at approval for "staff")
  note: string;                // "Doors open in 20, queue is long"
  photo?: Attachment;          // issue
  urgency: "normal" | "urgent";
  status: "pending" | "approved" | "declined" | "done";
  decidedBy?: string; decidedAt?: number;
  accepts: Record<string, "pending" | "accepted" | "declined">;   // each moved person's answer
}
// A broadcast, posted in a broadcast channel
{ type: "broadcast"; level: "normal" | "critical"; text: string; audience: { all?: true; crews?: string[]; zones?: string[] };
  acks: Record<string, number> /* userId -> at */ }
```

CardOps: `request.decide` (approve / decline with `people`), `request.accept` (a moved person),
`request.done`, `broadcast.ack`.

**Tasks** get `zone?: string` (add to `Task`, `TASK_FIELDS` in `ops.ts`, the `task.update` Pick and
`updatedAt` keys, `TaskSheet`). A zone's tasks live on **one board per Operation** ("Ops board"),
filtered by zone wherever they're shown.

**Permissions:** add `approveRequests` and `broadcast` to `GroupPermission` and `PERMISSIONS`.

**Broadcast channels:** `GroupChannel` gets `broadcast?: boolean` (posting limited to
`broadcast`/admin; every message is a broadcast card; the channel is pinned at the top).

**Mutes:** in `mutes.ts`, critical broadcasts bypass `effectiveRule`. Update `ChatApp.showBanner` so a
critical broadcast always shows, as a full-screen banner with "Got it".

---

## 4. Screens (what to build)

### 4.1 Creating an Operation
- In the New group sheet (`NewGroupSheet` in `Groups.tsx`), add a "Kind" choice: **Group** or
  **Operation**. Operation asks for name, venue and dates, then offers a **zone template**
  ("Esports venue", "Conference", "Blank") that creates zones, crews and channels in one go.
- An existing group's settings get **"Turn into an Operation"**.

### 4.2 The Operation's group page (`ContactPage` for an ops group)
- Header as today, plus a **live strip**: `Day 2 · Evening shift · 46 on site · 3 requests`.
- Tabs: **Zones** · **Live** · **Mind** (Zones replaces Media for Operations).
- **Zones tab:** a list (and a Grid/Map switch) of zone tiles:
  - name and code, e.g. "A1 · Main Arena";
  - staffing ring (4/6) in `--ok` / `--warn` / `--bad`;
  - open tasks, open requests and the lead's avatar;
  - status chip.

  Tap a zone to open the **Zone page**. Hold a zone for its menu (Assign people, Set status, Open
  chat, Edit).
- The **Command display** button (top right, next to settings) opens the console (4.4).

### 4.3 Zone page (full screen, like the board)
- Title: zone name and code; subtitle: area and lead.
- **I'm here** / **Leave** button (or "You're here since 14:20").
- **Who's here:** avatars, grouped by crew; "+ Assign".
- **Tasks here:** the Ops board filtered to this zone, with the board's ↑/↓ step arrows and
  priority. "+ Task" defaults the zone.
- **Requests:** open requests for this zone. "Need people", "Need supplies" and "Report issue"
  buttons open the request sheet.
- **Zone chat:** a link to the zone's channel.

### 4.4 Command console ("Command display", wide)
A full-screen overlay. On wide screens it's three columns; on a phone it becomes stacked tabs.
1. **Zone grid or Floor map** (switch). Grid tiles as in 4.2, sortable by "Needs attention"
   (understaffed first, then issue, then pending requests). The map shows the floor plan image with
   zone pins sized by headcount and coloured by status. Tap a pin to see that zone's mini card.
2. **Requests queue:** pending first, urgent at the top, each with:
   - zone, kind, count, note and age ("3 min");
   - **Approve** / **Decline**. For staff requests, Approve opens **Choose people**, with smart
     suggestions: people **checked in nearby** (same area), on shift, in the right crew, in the
     least-understaffed zones first;
   - after approval, each person's accept status.
3. **Ops feed and Broadcast:** a timeline (check-ins, moves, done tasks, zone status changes,
   broadcasts with read rate) and a **Broadcast** composer: text, audience (Everyone / crews /
   zones), level (Normal / Critical), Send. Each broadcast shows "38/46 read · Remind".

### 4.5 Crew member's phone (any member without Command permissions)
- On the group page and in the Inbox row, a **"You're in A1 · Main Arena"** card (or "Not checked
  in", with **Scan / Pick zone**).
- **Broadcast banner** pinned at the top until "Got it"; critical ones are full screen.
- **Move request:** "Rima asks you to go to B2 · Stage B" with **Accept** / **Can't**. Accept means
  check-out, check-in and a toast.
- **My tasks here**, then **My other tasks**.
- **Report:** issue or "I need help", with a photo, to their zone lead.

### 4.6 Dashboard widgets (`widgets.ts`: new kinds, group "Ops")
- **Zones staffing:** bars of on-site vs target per zone (`PartBars` / `StackedBar`); views
  Understaffed / All.
- **Requests:** pending count, average time to decide (trend), by kind.
- **Broadcast reach:** last broadcast's read rate (donut).
- **On site:** headcount over the day (`TrendChart` area).

Each opens the console or a sheet.

### 4.7 Day report sheet
For one day and shift: totals, the four charts above, and the top 5 slowest requests. Reachable
from the console header ("Report").

---

## 5. Core flows that must work end to end in the prototype

1. **Understaffed, then a move.**
   - Lead of B2 (Stage B) taps Need people, asks for 3, urgent.
   - The card appears in #stage-b and in Command's queue with an urgent badge.
   - Rima taps Approve, then Choose people. Suggestions show 3 people from A1, which is
     overstaffed (7/5); she picks them.
   - Each gets a move request (see as `?as=salman`) and taps Accept.
   - Presence updates, B2 shows 5/5 in green, and the feed logs it.
2. **Critical broadcast.**
   - Rima sends "Doors open in 10 minutes. All crews to positions." as Critical, to Everyone.
   - Every person, even with the group muted, gets a full-screen banner and taps Got it.
   - The console shows read rate climbing, and Remind re-pings the rest.
3. **Task for a place.**
   - Rima adds "Check stage lights" in B2.
   - Anyone who checks in to B2 sees it on top. Stepping it to Done updates the zone tile and feed.
4. **Issue.**
   - A crew member in C1 reports "Spill near Gate 3" with a photo.
   - The lead sees it, sets C1 to Issue (the tile turns red), then marks it Done.

Use the store's simulated replies (`later(...)`) so moved people "accept" a few seconds after
approval, the way the demo already fakes other people's actions. That makes the solo demo feel live.

---

## 6. The demo scenario (seed it; it's what Rima sees first)

Add `src/lib/chat/seed-ops.ts`, built in `buildSeedState`:

- **Operation:** `EWC 2026 · Riyadh`, venue Boulevard Riyadh City. Today is Day 2 of 3, with Morning and Evening shifts. Use
  a generated floor-plan image (inline SVG data URL: halls as rounded rects with labels).
- **Zones (8):**

  | Code | Name | Area | Notes |
  |---|---|---|---|
  | A1 | Main Arena | Hall A | 7/5, overstaffed |
  | A2 | Player Lounge | Hall A | |
  | B1 | Broadcast Studio | Hall B | |
  | B2 | Stage B | Hall B | 2/5, urgent request |
  | C1 | Gate 3 · Entrance | Outdoor | issue |
  | C2 | Merch Store | Outdoor | |
  | D1 | Media Room | Level 2 | |
  | D2 | VIP Lounge | Level 2 | |

- **Crews (roles):** Command, AV & Broadcast, Security, Hospitality, Runners.
- **People:** the existing users (me = Alae; reema = Rima, Command; charles; salman; jamshad) plus
  about 16 new crew users. Add them to the users list with names that fit Riyadh, tones and crews,
  spread over zones with presence set.
- **Content:**
  - about 20 Ops tasks across zones, with priorities and due times today;
  - 3 pending requests: B2 staff ×3 urgent, D1 supplies, C1 issue with photo;
  - 2 decided requests in the feed;
  - 1 normal broadcast at 68% read and 1 earlier critical one at 100%;
  - zone channels with a few messages each.
- **Make `me` an Admin with the Command role**, so the default demo user sees the console; switching
  to `?as=salman` shows the crew phone view.
- A Dashboard preset for the ops widgets: add them to `STARTER_WIDGETS` behind an "Ops starter".

---

## 7. Build order (each step ends with something clickable)

1. **Types and seed:** the types above, `seed-ops.ts` and the permissions. Check that the Operation
   group appears in the inbox with its zone channels.
2. **Zones tab and Zone page:** check-in and out, who's here, zone tasks (the `zone` field on tasks),
   request buttons.
3. **Requests:** request card (renderer, ops), request sheet, approve flow with people suggestions,
   move request with accept, presence updates, simulated accepts.
4. **Broadcasts:** broadcast channel, broadcast card and acks, Critical bypassing mutes, full-screen
   banner, Remind.
5. **Command console:** zone grid and map, request queue, feed and broadcast composer, the wide
   layout, and stacked tabs on a phone.
6. **Crew view:** "You're in…" card (group page and inbox row), move-request prompt, report.
7. **Dashboard widgets and Day report.**
8. **Polish and verify:**
   - run all four flows in section 5 (solo, and with a second window via `?as=`);
   - check dark mode and phone width;
   - lint, types and build;
   - delete `.playwright-mcp/`.

---

## 8. Design notes (how it should feel)

- Calm and legible under pressure: big status colours only where they mean something (understaffed,
  issue, critical); everything else uses ink and greys. Numbers first ("4/6", "3 pending", "38/46 read").
- Every list can be held for a menu (`useHoldMenu`), and every primary action is one tap from the
  console: Approve, Choose people, Broadcast, Set status.
- Zone codes (A1, B2) everywhere, because that's how people talk on radio.
- Time matters: show ages ("3 min ago") on requests, and highlight anything pending for more than
  5 min.
- Reuse existing visual language: tiles like Dashboard widgets, full-screen pages like the board,
  sheets like the rest of the app, toasts for confirmations.

## 9. Out of scope for the prototype
Real push notifications, real QR scanning (camera), real offline sync, a rota editor, exporting
reports to PDF/CSV, and multi-venue Operations. Mention them in the UI as "Soon" only where a button
would otherwise feel missing.

## 10. Done means
- The four flows in section 5 work from a fresh load with no setup, signed in as `me`, and as a crew
  member via `?as=salman`.
- Typecheck, lint and build pass.
- A short summary for the user covering what to show Rima and in which order: inbox, then the
  Operation, then a Zone, then the Command display, then the request flow, then the broadcast, then
  the Dashboard.
