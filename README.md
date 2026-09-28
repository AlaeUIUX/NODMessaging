# NOD

NOD is a messenger for people who run projects: Spaces for every team, polls,
checklists and payments right in the thread, and Mind to keep what matters.

This repo is the interactive prototype. It's live at
**https://nod-messaging.vercel.app**.

## Routes

| Route | What it is |
| ----- | ---------- |
| `/`   | The chat app, behind a landing stage. `/?as=charles` signs a tab in as Charles, so two tabs can talk. |
| `/chat` | Redirects to `/`. |

## Running it

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm run lint    # ESLint
```

## Stack

- **Next.js 16** (App Router) and **React 19**, TypeScript.
- **CSS Modules** for component styles (`src/components/chat/chat.module.css`,
  tokens included). `src/app/globals.css` is a small reset.
- **Realtime:** `BroadcastChannel` gives real pub/sub between tabs with no
  backend (`src/lib/chat/transport.ts`). A socket transport would plug into the
  same interface.
- **Persistence:** chat state and drafts go to `localStorage`
  (`src/lib/chat/storage.ts`). Attachment bytes go to IndexedDB so messages stay
  small (`src/lib/chat/media.ts`).

## Layout

```
src/app/                  layout, the / route, icons and the link-preview image
src/components/chat/      the chat app (inbox, threads, cards, artifacts, Mind)
src/lib/chat/             store, transport, storage, media, seed data
```
