# A. Chats list: WhatsApp vs NOD

- **WhatsApp:** your screen recording of 10 Nov 2026 (2 min 44 s, iPhone). It shows a real chat list, so its frames stay on this PC in `frames/` (kept out of git) and nothing here names anyone.
- **NOD:** the live app at nod-messaging.vercel.app (commit b5f5b36) at iPhone size.
- **Side-by-side pictures** are in `frames/compare/A01/`, WhatsApp on the left, NOD on the right. Times like *0:38* point into the WhatsApp clip.

Rows covered: A1–A9, plus A11, A12 and A16, which the clip also shows. A10 ("typing…" in the row) needs a second account and is still to record.

---

## What to build, in order

Effort: **S** is under half a day in the prototype, **M** is one to two days.

| # | Change | Rows | Why first | Effort |
|---|---|---|---|---|
| 1 | **Drafts in the row**: a "Draft:" line, and the chat moves to the top while the draft exists | A8 | Seen every day; NOD already keeps drafts, it just never shows them | S |
| 2 | **Richer previews**: sender's name in group rows, an icon for photo / voice / file / card, ticks on your own last message, "You reacted ❤️ to …" | A11 A12 | Every row, every day; this is all text NOD already has | S |
| 3 | **WhatsApp's swipes**: right for Read / Unread and Pin, left for More and Archive. NOD's Mute moves into More | A3 A4 A7 | The first thing a WhatsApp user tries on a row; NOD's left swipe currently has different buttons | M |
| 4 | **Archive**: an "Archived" row at the top of All, its own screen, and archived chats stay archived when new messages come | A6 | Needed by #3 | M |
| 5 | **Hold a chat**: the same menu as More, then a live preview of the chat above it | A5 | Holding now does nothing, then opens the chat on release; NOD already has hold menus for messages and Mind to reuse | M |
| 6 | **Search every message**: results grouped into Chats and Messages, matched word in bold, tap to open the chat at that message | A2 | The search bar promises "messages, users, items and more" but only matches names and last messages | M |
| 7 | **Small counts**: a count on every chip (Groups 3), search placeholder that follows the chip ("Search unread chats"), counts kept on muted chats, a number on the Chats tab, the unread count beside the back arrow in a chat | A1 A9 A16 | Quick and visible | S |
| 8 | **Favourites and your own lists** | A1 | Needs the More menu from #3 first | M |

**Built on 10 Nov 2026** (in the prototype, not committed yet):
- **#1 Drafts:** done.
- **#2 Previews:** sender names, type icons and ticks are done. "You reacted ❤️ to …" is left out because NOD doesn't record when a reaction was added, so it can't tell whether a reaction is the newest thing in the chat.
- **#3 Swipes:** done, and a long swipe runs Read or Archive on its own.
- **#4 Archive:** done.
- **#5 Hold:** done, with the peek and the menu.
- **#6 Search:** skipped for now.
- **#7 Small counts:** partly done. Chips have counts, the search placeholder follows the chip, and muted chats keep a grey count. The number on the Chats tab and the count beside the back arrow are not done.
- **#8 Favourites and your own lists:** done. The + at the end of the chips makes a list.
- **Not in the menus yet:** Contact / Group info, Lock chat, Clear chat, Leave group.

**One earlier decision this reopens:** [APP-REVIEW.md](../../../APP-REVIEW.md) says searching chat names and last messages is enough. In WhatsApp, search goes through every message, so #6 needs a yes from you.

---

## Row by row

### A1 · Filter chips (Different)
- **WhatsApp:** All, Unread **29**, Favorites, Groups **3**, Communities.
  - The selected chip turns light green, and the row scrolls to keep it in view.
  - The search placeholder follows the chip: "Search unread chats", "Search favorite chats", "Search group chats".
  - Empty filters explain themselves. Favorites shows "Manage Favorites"; Communities shows an illustration and a "New community" button. *0:03–0:09*
- **NOD:** All, Unread **6**, DMs, Groups. Only Unread has a count, and the placeholder never changes.
- **Do:** counts on every chip and a placeholder that follows the chip (#7). Favourites later (#8). Keep DMs: it's useful, and it costs nothing.

### A2 · Search (Different)
- **WhatsApp:**
  - Tapping search takes over the screen: the chips fade, a back arrow appears, the keyboard comes up. *0:16*
  - Search stays inside the active filter.
  - Results come in two groups. **Chats** lists names that match. **Messages** lists any message in your history: chat name, date, and the line with the word in **bold**. Links show their preview card inside the result. *0:17–0:23*
  - An empty search says "No results".
- **NOD:** the list filters itself by chat name and last message, in place. "board" found two chats and no messages.
- **Do:** #6.

### A3 · Swipe right (Missing)
- **WhatsApp:** reveals **Read** (green, speech bubble) and **Pin** (grey, pin) on the left of the row. For a chat you've read, Read becomes Unread. *0:37–0:42* (Confirmed here; WhatsApp's own help pages don't mention it.)
- **NOD:** nothing moves.
- **Do:** #3. "Mark as unread" also needs a flag on the chat, which NOD doesn't have yet.

### A4 · Swipe left (Different)
- **WhatsApp:** reveals **More** (grey, •••) and **Archive** (green). *0:45*
  - More opens a sheet headed by the chat's photo and name with ×: Unmute, Group info, Lock chat, Add to Favorites, Add to list, Clear chat.
  - Exit group sits apart, in red. *0:50*
- **NOD:** reveals two round buttons, Pin (black) and Mute (purple).
- **Do:** #3. NOD's More would hold: Mute… (NOD's existing mute sheet, which is richer than WhatsApp's), Contact / Group info, Add to Favourites, Leave group.

### A5 · Hold a chat (Missing)
- **WhatsApp:**
  - The chat rises as a live preview: header, the last messages on its wallpaper, the "14 unread messages" line. A menu sits under it, and the rest of the screen greys. *1:01*
  - Menu: Mark as read, Archive, Unmute, Lock chat, Add to Favorites, Add to list, Clear chat, Exit group. A business chat gets Block instead. *1:19*
- **NOD:** nothing happens while you hold, and letting go opens the chat like a normal tap.
- **Do:** #5. Same actions as More, so it's mostly a second way in.

### A6 · Archive (Missing)
- **WhatsApp:**
  - Archiving slides the row away, and Unread drops from 29 to 28. *1:19*
  - An **Archived** row with a count appears at the top of All. *1:34*
  - Its screen has a back button showing your unread count ("‹ 28"), a ••• menu, and the note "These chats stay archived when new messages are received. Tap to change." *1:41*
- **NOD:** no archive.
- **Do:** #4.

### A7 · Pin a chat (Same, in the wrong place)
- **WhatsApp:** Pin is on the right swipe and in the hold menu.
  - The clip didn't pin a chat. It pinned a *message*, and that sheet ("Choose how long your new pin lasts": 24 hours, 7 days, 30 days) matches NOD's. *1:54*
  - WhatsApp's help pages say pinning a chat now asks how long too. Still to check.
- **NOD:** Pin is on the left swipe.
- **Do:** move it to the right swipe (#3).

### A8 · Drafts (Missing)
- **WhatsApp:** type "Test" in a chat and go back. The row shows **Draft: Test** with "Draft:" in green, and the chat jumps to the top with the current time. *2:12* Clear the text and the chat goes back where it was. *2:28*
- **NOD:** the draft is kept, but the row doesn't change or move.
- **Do:** #1.

### A9 · Row badges (Mostly same)
- **WhatsApp:**
  - The time turns green when there's something unread, and the count is a green badge.
  - **Muted chats keep their count**, next to a bell-off icon.
- **NOD:** the time and the badge are blue, and muted chats lose their count.
- **Do:** keep the count on muted chats, greyed (#7).

### A11 · Who wrote it, in groups (Missing)
- **WhatsApp:** "~Name: 📷 Photo". The tilde marks someone who isn't in your contacts. System events show as the preview too ("… was added", "… removed you").
- **NOD:** only your own messages get a prefix ("You:").
- **Do:** #2.

### A12 · What it is, and whether it was read (Different)
- **WhatsApp:**
  - Each type gets an icon: camera "Photo", sticker "Sticker", video camera "Video call", a green mic "Voice message (0:24)" (green until played).
  - Your own last message starts with its ticks, blue when read and grey when not.
  - Reactions show as "You reacted ❤️ to '🎤 Voice message (0:05)'".
- **NOD:** "You:" and the text. Cards read "Checklist: …" or "Board: …" with no icon. No ticks.
- **Do:** #2, using NOD's own card icons.

### A16 · Header and tab bar (Replaced, two small things to take)
- **WhatsApp:**
  - Header: ••• on the left, a green + on the right, a small Status ring in the middle. **Pull the list down** and a Status row appears ("My status" and your contacts). Scrolling up tucks search and the chips under a centred "Chats". *0:42, 1:14*
  - Tab bar: Updates, Calls, Communities, Chats (with **29**), You (your photo), and a floating Meta AI button.
- **NOD:** your photo (Settings), "Your inbox" with your number, a + with an invitations badge. The tab bar is Chats, Mind, Dashboard, Explore, and Chats shows a dot.
- **Do:** keep NOD's header and tabs. Take the number on the Chats tab (#7). Status is a separate decision (H2).

---

## Also seen in the clip (for later rows)

- **Holding a message** (C1, C2):
  - Seven quick reactions here: 👍 ❤️ 😂 😮 😢 🙏 ✅, then "+".
  - The menu on a sticker: Reply, Forward, View sticker, Add to Favorites, Pin, Report, Delete.
  - The background dims rather than staying visible behind glass, so this phone still has the older design.
  - *1:53*
- **Inside a chat:** time and ticks sit in every bubble; NOD has neither (B14). *1:52*
- **Inside a chat:** the composer shows a sticker button inside the field, then a camera and a mic, and the mic becomes a green send arrow once you type (D2, D6, D12). *2:10*
- **"Message yourself":** a chat with your own number marked "(You)" (B20). *2:22*

## NOD things to keep

- **One row per group**, with its channels and "#channel ·" in the preview.
- **The Operations row** (EWC), with its day line.
- **The Live dot** on the chat name.
- **The DMs chip.**
