# WhatsApp (iOS) vs NOD: feature inventory

Every interaction in WhatsApp for iPhone, with where NOD stands on it. This list decides what gets recorded: we record rows where NOD is **Different** or **Missing** and that people use **Daily** or **Often**.

- **How often:** Daily, Often, Rare (how often a typical person does it in WhatsApp).
- **NOD status:**
  - **Same**: works the way WhatsApp does (small visual differences are fine).
  - **Different**: NOD has it, but someone coming from WhatsApp would notice.
  - **Missing**: not in NOD.
  - **Replaced**: NOD does this its own way on purpose.
  - **Not for us**: out of scope.
- **Clip:** the shot in [shot-list.md](shot-list.md) that records it. **S** means a screenshot is enough.

NOD status was read from the code at commit b5f5b36 (10 Nov 2026). Paths are in `src/components/chat/` unless they start with `lib/` (`src/lib/chat/`). WhatsApp details were checked against WhatsApp's Help Center, blog and Meta's newsroom on 10 Nov 2026. *(staged)* = WhatsApp is rolling it out gradually, so your phone may not have it yet. *(unverified)* = not in WhatsApp's own docs; the recordings will settle it.

**124 interactions.** 28 Same, 43 Different, 44 Missing, 8 Replaced, 1 Not for us. Of the Different and Missing ones, **65 are things people do daily or often**; those are the ones the shot list records.

**The biggest gaps, from the code alone:**
- **Voice notes can't be recorded** (D3–D4, E7–E9). The mic dictates text instead.
- **No forwarding and no multi-select** (C10, C11).
- **No time or ticks inside bubbles** (B14). The time shows only on swipe, and the status only under your latest message.
- **Swiping your own message replies to the left** (C6); WhatsApp swipes right for every reply. Message info exists only in groups (C7).
- **Chat list:** no right swipe, no archive, no mark as unread, no draft label, no sender name in group previews (A3–A12).
- **Media:** no photo editor, no zoom, no video, no stickers or GIFs, no link previews (E2–E6, E14, B16).
- **Deleting** is one tap, for everyone, with no "Delete for me" and no Undo (C9).

---

## A. Chats list (inbox)

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| A1 | Filter chips: All, Unread, Favourites, Groups, plus your own lists; Drafts, Communities and "Mentions and replies" filters arrived in 2026 *(staged)* | Daily | All, Unread (with count), DMs, Groups. No Favourites, no lists of your own. `Inbox.tsx:350` | Different | S1 |
| A2 | Search bar at the top: finds chats, contacts and messages, with filters (photos, links, docs…) | Often | Only matches chat names and the last message, though the placeholder promises more. `Inbox.tsx:338` | Different | 15 |
| A3 | Swipe a chat right: Read / Unread and Pin (seen in the 10 Nov clip) | Daily | Rows only slide left. No mark as read / unread anywhere. `Inbox.tsx:144` | Different | 12 |
| A4 | Swipe a chat left: More (mute, info, export, clear, delete, lock) and Archive | Often | Left swipe shows Pin and Mute only. `Inbox.tsx:116` | Different | 12 |
| A5 | Hold a chat: preview of the chat lifts up, with a menu | Often | Holding a row does nothing. `Inbox.tsx:124` | Missing | 12 |
| A6 | Archived row at the top; archived chats stay archived when new messages come | Often | No archive. `Inbox.tsx:286` | Missing | 12 |
| A7 | Pin up to 3 chats to the top; pinning now asks for how long | Often | Pin from the left swipe, no limit. `Inbox.tsx:239` | Same | |
| A8 | Unsent draft shows a green "Draft" label in the row, and the chat moves to the top | Daily | Drafts are kept, but the row never shows them. `Inbox.tsx:65` | Missing | 12 |
| A9 | Row shows unread count, muted icon, an @ when you're mentioned | Daily | Count, bell-off and pin icons; @ replaces the count when mentioned; muted chats show no count. `Inbox.tsx:300` | Same | |
| A10 | Row shows "typing…" / "recording audio…" | Daily | "typing…", and "Charles is typing…" in groups. No "recording audio…" (no voice recording). `Inbox.tsx:424` | Same | |
| A11 | Group rows say who wrote the last message ("Charles: Sounds good") | Daily | Group rows show only the text; only your own get "You:". `Inbox.tsx:65` | Missing | S1 |
| A12 | Your last message shows its ticks in the row; media shows an icon ("📷 Photo", "🎤 0:12") | Daily | No ticks. Voice says "Voice message", photos and files show the file name. `Inbox.tsx:65` | Different | S1 |
| A13 | New chat button: contacts, New group, New contact, New community | Often | "+" opens New chat: invitations, search, New group, New Operation, Invite friends, frequent, contacts A–Z. `NewChat.tsx:148` | Same | |
| A14 | Edit the list: select several chats, then Read all / Archive / Delete | Rare | No edit mode. | Missing | |
| A15 | Locked chats, in their own folder behind Face ID | Rare | None. | Missing | |
| A16 | Tab bar: Updates, Calls, Communities, Chats (with a count), You (your photo), plus a floating Meta AI button. Pulling the list down shows a Status row. Order varies between phones | Daily | Floating bar: Chats, Mind, Dashboard, Explore; Settings is your photo, top left. `Inbox.tsx:53` | Replaced | |

## B. Inside a chat

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| B1 | Header: photo, name and "online" / "last seen…" / "typing…" in one glass pill; groups show how many are online. Tapping the pill opens a menu (Search, Contact info, Media, Theme, Mute…) *(staged)* | Daily | "Active now" / "Active recently" (no last-seen time), "typing", or "N members" (no names). `ChatView.tsx:680` | Different | S2 |
| B2 | Header buttons: video call, voice call | Daily | One Call button that says "Calls are coming soon", plus a Board button. `ChatView.tsx:706` | Missing | |
| B3 | Date chips between days; a floating date while scrolling | Daily | Day labels between days, but nothing floats while scrolling. `MessageList.tsx:209` | Different | 13 |
| B4 | "N unread messages" line where you left off | Daily | A "New" line with no count; missing in chats with no read time. `MessageList.tsx:214` | Different | S2 |
| B5 | Scroll-to-bottom button with unread count; an @ button that jumps to unread mentions | Daily | Down arrow with "N new". No @ jump. `MessageList.tsx:139` | Different | 13 |
| B6 | Chat theme per chat: bubble colour and wallpaper (20 themes, or made with Meta AI) | Rare | Only Light / Dark / Automatic for the whole app. `Settings.tsx:376` | Missing | |
| B7 | System lines: "Charles added Reema", "You changed the group name" | Often | None, except "X pinned a message". `MessageList.tsx:228` | Missing | S3 |
| B8 | Pinned messages bar under the header; tap cycles through pins | Often | Same: "Pinned · 1 of 3", tap jumps and moves on. `PinnedBar.tsx:36` | Same | |
| B9 | Tap a quoted reply: jumps to the original and flashes it | Daily | Same; the original gets a ring for about a second. `ChatView.tsx:485` | Same | 3 |
| B10 | Disappearing messages | Rare | None. | Missing | |
| B11 | Search inside the chat (chat name › Search, or a search button at the top, *staged*), with up / down arrows through matches | Often | On the contact page, as a list of results; tap one to jump. No arrows, no highlights in the chat. `ContactPage.tsx:498` | Different | 15 |
| B12 | Drag down to dismiss the keyboard; the list stays anchored to the bottom | Daily | Stays anchored, but dragging doesn't close the keyboard. `ChatView.tsx:256` | Different | 13 |
| B13 | Bubbles group by sender (tail on the last one); groups show coloured names and small avatars | Daily | Same; names are grey, not coloured. `MessageList.tsx:193` | Same | |
| B14 | Time and ticks inside every bubble; grey ticks, then blue when read | Daily | **No time or ticks in bubbles.** Time shows only when you swipe a bubble; "Sent / Delivered / Read" in words under your latest message only. `MessageRow.tsx:405`, `:485` | Different | S2 |
| B15 | "Edited" label on edited messages | Often | Same. `MessageRow.tsx:113` | Same | |
| B16 | Links show a preview card; phone numbers, dates, addresses and emails are underlined with quick actions *(staged, Nov 2026)* | Daily | No preview cards. Bare URLs, numbers, emails and dates are plain text. `lib/markdown.tsx:9` | Missing | 11 |
| B17 | A message that's only 1–3 emoji shows them big, with no bubble | Daily | Same. `MessageRow.tsx:32` | Same | |
| B18 | Long messages fold behind "Read more" | Often | Always shown in full. `MessageRow.tsx:112` | Missing | S3 |
| B19 | Typing bubble at the bottom of the chat | Daily | Same, with faces in groups. `MessageList.tsx:286` | Same | |
| B20 | Message yourself (a chat with just you) | Often | Not possible; Mind fills that role. `NewChat.tsx:46` | Replaced | |
| B21 | "Messages are end-to-end encrypted" notice at the top | Rare | Same. `MessageList.tsx:182` | Same | |

## C. Doing things to a message

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| C1 | Hold a message: the message lifts, reactions above, menu below. The older design blurs the chat; the new glass design (Sept 2026, *staged*) keeps it visible | Daily | Same, after 380 ms. You can also slide onto an item and let go. `MessageRow.tsx:236` | Same | 1 |
| C2 | Reactions bar: 6 quick emoji plus "+" for any emoji | Daily | 6 quick (🔥 instead of 🙏); "+" shows only 21 more, no search, no full emoji keyboard. `MessageOverlay.tsx:12` | Different | 1 |
| C3 | Double-tap a message: your most-used reactions pop up to pick from | Daily | Double-tap adds ❤️ straight away, with a burst. `MessageRow.tsx:274` | Different | 3 |
| C4 | Reactions sit under the bubble; tap to see who reacted, tap yours to remove | Daily | Same. `ReactionSheet.tsx:74` | Same | |
| C5 | Menu: Reply, Forward, Copy, Info (yours), Star, Pin, Edit (yours), Delete; More… holds Reply privately, Translate, Remind me | Daily | Reply, Copy, Edit, Pin, Save to Mind, Make a task, Delete. No Forward, Info or More…. `MessageOverlay.tsx:80` | Different | 1, 2 |
| C6 | Swipe any message right to reply | Daily | Their messages swipe right, **yours swipe left.** `MessageRow.tsx:264` | Different | 3 |
| C7 | Message info on your message (hold › Info; swiping it left is *unverified*): who it was delivered to and who read it, with times | Often | Swiping left on yours replies. Info only in groups, from "Read by N ›" under one of your last 3 messages. `MessageRow.tsx:491` | Different | 2 |
| C8 | Edit your text for 15 minutes after sending; shows "edited", no new notification | Often | Editable forever, no time limit; shows "Edited". `store.tsx:984` | Different | |
| C9 | Delete for me / Delete for everyone (for 2 days); "This message was deleted"; 5-second Undo after "Delete for me" | Often | Own messages only, one tap, no confirm, always for everyone, no Undo. `ChatView.tsx:889` | Different | 6 |
| C10 | Forward: pick up to 5 chats, with search and frequent chats; "Forwarded" label, "Forwarded many times" after 5 hops | Daily | No forwarding. | Missing | 4 |
| C11 | Select several messages (More…), then forward, delete, star or share them | Often | No multi-select. | Missing | 5 |
| C12 | Star a message; find it in Starred messages | Often | Save to Mind instead. `ChatView.tsx:891` | Replaced | |
| C13 | Pin a message for 24 hours, 7 days, 30 days or no end date *(staged)*; up to 4 pins (some languages' Help Center still says 3) | Often | 24 hours, 7 days or 30 days, up to 3; a 4th replaces the oldest. `PinnedBar.tsx:75` | Same | |
| C14 | In a group: Reply privately, Message [name] | Often | Neither. | Missing | 1 |
| C15 | Copy text; Share through the iOS share sheet | Daily | Copy (text only). No Share. `ChatView.tsx:923` | Different | |
| C16 | Translate a message: More… › Translate, on the device (Sept 2025) | Rare | None. | Missing | |
| C17 | Report a message | Rare | None. | Missing | |
| C18 | Remind me about a message: More… › Remind me (2 h, 8 h, 24 h, custom); a bell shows on it | Often | No reminder on a message; the Reminder card is separate. `CardBuilders.tsx:35` | Missing | 1 |
| C19 | Tap someone's reaction under a message to add the same one | Often | Tapping a reaction opens the list of who reacted. `MessageRow.tsx:474` | Different | 3 |

## D. Writing a message (composer)

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| D1 | "+" opens a sheet: Photos, Camera, Location, Contact, Document, Poll, Event | Daily | "Add to message": Photos, Camera, File, Poll, Checklist, Reminder, Location, Event, Plan, Board, Pay, Request, Split bill. No Contact. `CardBuilders.tsx:35` | Same | S4 |
| D2 | Camera button next to the text field (tap for the camera, hold for a video message) | Daily | No camera button by the field; Camera is inside "+", photos only. `ChatView.tsx:863` | Different | 9 |
| D3 | Mic: hold to record, slide left to cancel, slide up to lock | Daily | **Can't record voice.** The mic dictates text into the draft. `Composer.tsx:546` | Missing | 7 |
| D4 | Locked recording: pause, listen back, delete or send | Often | None. | Missing | 7 |
| D5 | Round video message, up to 60 s: hold the camera button and slide up to lock | Rare | None. | Missing | |
| D6 | Sticker button inside the text field: stickers, GIFs, emoji | Daily | No sticker, GIF or emoji button; emoji only from the keyboard. | Missing | 14 |
| D7 | Formatting: *bold*, _italic_, ~strike~, `code`, lists, quotes; also from the text selection menu | Often | "Aa" bar with more options, but typed codes are `**bold**` and `~~strike~~`, and there's no Format on selected text. `Composer.tsx:33` | Different | |
| D8 | @mention suggestions in groups | Often | Same. `Composer.tsx:307` | Same | |
| D9 | Link preview appears while typing; can be removed before sending | Often | None. | Missing | 11 |
| D10 | Quoted message above the field when replying, with × | Daily | Same (no photo thumbnail in the quote). `Composer.tsx:668` | Same | |
| D11 | Draft kept per chat | Daily | Same. `Composer.tsx:243` | Same | |
| D12 | Send button replaces the mic once there's text | Daily | Tapping the field swaps the mic for a toolbar with a dimmed send arrow. `Composer.tsx:709` | Different | 7 |
| D13 | Paste a photo from the clipboard | Often | Same, as a chip in the tray (no preview). `Composer.tsx:701` | Same | |
| D14 | Editing shows a banner above the field | Often | Same. `Composer.tsx:660` | Same | |

## E. Photos, videos, voice and files

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| E1 | Photo picker: pick several, albums, recents | Daily | Mock permission alert, then the system file picker (up to 10). Picks become small chips. `Composer.tsx:420` | Different | 9 |
| E2 | Photo editor before sending: crop, draw, text, stickers, filters, HD (Standard is the default), View once, caption | Often | No preview or editor step. `Composer.tsx:679` | Missing | 9 |
| E3 | Several photos sent together form an album grid with one caption; react or reply to the set or to one photo | Daily | A stacked deck of up to 3; a tap opens a grid sheet, then the viewer. `Media.tsx:51` | Different | 9 |
| E4 | Photo viewer: grows from the bubble, pinch and double-tap to zoom, swipe between, swipe down to close | Daily | Fades in; no zoom; no swipe down; swipes only within one message. `MediaViewer.tsx:85` | Different | 10 |
| E5 | Viewer actions: reply, forward, star, share, save | Often | Close and Download only. `MediaViewer.tsx:76` | Different | 10 |
| E6 | Videos: play in the chat or full screen, with a scrubber | Daily | Can't send or play video; a video becomes a file to download. `Media.tsx:75` | Missing | 21 |
| E7 | Voice message: play, scrub the waveform, 1× / 1.5× / 2× | Daily | One seeded demo note with faked playback. No scrub, no speeds. `MessageRow.tsx:62` | Different | 8 |
| E8 | Voice keeps playing when you leave the chat (mini player at the top); next one plays on | Often | Stops when you leave. | Missing | 8 |
| E9 | Voice message transcript: off by default; turn it on in Settings, then hold › Transcribe | Rare | None. | Missing | 8 |
| E10 | Documents: icon, name, size, pages; opens in a preview | Often | Icon, name, size; a tap downloads it, no preview. `Media.tsx:75` | Different | 21 |
| E11 | Download progress on media; tap to download | Often | Loads by itself; spinner forever if the file is gone. `media.ts:134` | Different | |
| E12 | Location and live location | Rare | Demo address or 4 preset places; live for 15 min or 1 h. `CardBuilders.tsx:320` | Same | |
| E13 | Contact cards | Rare | None. | Missing | |
| E14 | Stickers and GIFs in the chat | Daily | None. | Missing | 14 |
| E15 | View once photos and voice | Rare | None. | Missing | |

## F. Chat info and group info

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| F1 | Contact info: big photo, name, number, row of Audio / Video / Search buttons | Often | Big photo, name, status; Message / Search / Mute buttons. No number, no call buttons. `ContactPage.tsx:575` | Different | 16 |
| F2 | Media, links and docs, in tabs | Often | DMs: Live, Media, Files, Links. Groups: Live, Media, Mind. `ContactPage.tsx:493` | Same | 16 |
| F3 | Starred messages for this chat | Rare | Save to Mind instead. | Replaced | |
| F4 | Mute: 8 hours, 1 week, always; custom notification settings | Often | Richer: Everything / Only @mentions / Nothing, then 1 h to forever. `Mute.tsx:36` | Same | |
| F5 | Wallpaper and theme for this chat | Rare | None. | Missing | |
| F6 | Groups in common | Rare | None. | Missing | |
| F7 | Export chat, clear chat | Rare | None. | Missing | |
| F8 | Block and report | Rare | None. | Missing | |
| F9 | Group info: description, member list with search, admin badges, add members | Often | Description, members with role badges, Invite. No member search. `ContactPage.tsx:684` | Different | 17 |
| F10 | Invite link: copy, share, QR code, reset | Often | Link with Copy, a QR that can't be scanned. No Share, no Reset. `Groups.tsx:889` | Different | 17 |
| F11 | Group permissions: who can edit info, send messages, add members; approve new members | Rare | Roles with toggles, per-channel rules. No approval of new members. `groups.ts:15` | Replaced | |
| F12 | Tap a member: Message, call, info, make admin, remove | Often | Tapping a member does nothing. `ContactPage.tsx:707` | Missing | 17 |

## G. Groups

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| G1 | Create a group: pick people, then name, photo, settings | Often | Name, description, colour and photo first, then people, who get invitations. `Groups.tsx:164` | Different | 18 |
| G2 | Join requests that an admin approves | Rare | Joining is instant. `store.tsx:896` | Missing | |
| G3 | Admins delete anyone's message ("deleted by an admin") | Rare | Only your own. | Missing | |
| G4 | Polls: one or several answers, end time, hidden voters, edit the question for 15 min; see who voted | Often | Single or multiple, anonymous option, end time. Voters only as up to 3 faces. `CardView.tsx:68` | Different | 19 |
| G5 | Events in groups and 1:1: Going / Maybe / Not going (+ a guest), reminders, a cover photo, an RSVP link for people without WhatsApp (Nov 2026) | Often | Going / Maybe / Can't, Add to calendar. Next 5 days, 4 fixed times, no reminder. `CardView.tsx:411` | Different | 20 |
| G6 | @all mentions everyone, even people who muted the group (anyone in groups of 32 or fewer, admins above that) | Often | @ lists members only. `Composer.tsx:400` | Missing | |
| G7 | Communities with an announcements group | Rare | Groups with channels instead. `Groups.tsx:359` | Replaced | |
| G8 | Leave a group; leave and delete | Rare | Leave with a confirm; the chat vanishes at once. `Groups.tsx:491` | Different | |
| G9 | Member tags: a label you set per group, shown next to your name in messages | Rare | Roles show on the group page, not in messages. `MessageRow.tsx` | Missing | |
| G10 | Send someone who just joined the recent history | Rare | New members see nothing from before. | Missing | |

## H. Calls, Status and Channels

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| H1 | Voice and video calls, group calls, call links, Calls tab | Daily | "Calls are coming soon". **Not decided either way yet.** `ChatView.tsx:714` | Missing | |
| H2 | Status (stories) in the Updates tab | Daily | None. | Missing | |
| H3 | Channels (follow broadcasts) | Often | Explore: public groups and Mind collections. `Explore.tsx:28` | Replaced | |

## I. Settings and account

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| I1 | Profile: photo, name, about; usernames are rolling out country by country *(staged)* | Rare | Photo, name, @username, bio (nobody sees it), colour. `Profile.tsx:88` | Same | |
| I2 | Privacy: last seen and online, photo, about, read receipts, who can add you to groups, blocked | Rare | Online, read receipts, typing, group invites. No blocked list. `Settings.tsx:316` | Different | |
| I3 | Notifications settings | Rare | Reminders, plans, tasks, previews; nothing for messages. `Settings.tsx:255` | Different | |
| I4 | Storage: see and clear what takes space | Rare | Totals and one "Clear photos and files". `Settings.tsx:436` | Same | |
| I5 | Chats: theme, wallpaper, keep chats archived, backup | Rare | Light / Dark / Automatic, "Return sends". `Settings.tsx:369` | Different | |
| I6 | Linked devices, passkeys | Rare | Several identities on one device instead. `Settings.tsx:141` | Replaced | |
| I7 | Invite a friend | Rare | Same. `Invite.tsx:41` | Same | |

## J. Behaviour you don't see as a feature

| ID | WhatsApp (iOS) | How often | NOD today | NOD status | Clip |
|---|---|---|---|---|---|
| J1 | Offline: message shows a clock, then sends by itself when back online | Often | Fails after about a second to "Not delivered · Retry"; never resends by itself. `lib/api.ts:98` | Different | 22 |
| J2 | Failed message: red mark, tap to retry | Rare | Same. `MessageRow.tsx:370` | Same | |
| J3 | Haptics: on hold, when swipe-to-reply arms, on send | Daily | Vibrates on hold, swipe and double-tap, **but iPhone Safari ignores it**, so nothing is felt on an iPhone. Nothing on send. `MessageRow.tsx:26` | Different | |
| J4 | In-app banner when a message arrives in another chat | Daily | Banners only for reminders, plans, tasks, broadcasts. `ChatApp.tsx:172` | Missing | 23 |
| J5 | Notification with reply from the lock screen | Daily | Left to iOS. | Not for us | |
| J6 | Sounds on send and receive | Daily | No sounds. `lib/store.tsx:311` | Missing | 7 |
| J7 | Back gesture: swipe from the left edge to go back to the list | Daily | Same in chats; not on Settings pages. `ChatView.tsx:458` | Same | |

---

## NOD things WhatsApp doesn't have (keep them)

- **Save to Mind** from the hold menu, with the bubble flying into Mind. `ChatView.tsx:891`
- **Make a task** from a message, and `/task Title @name fri` in the composer. `Project.tsx:1133`
- **Cards in the thread:** Poll, Checklist, Reminder as quick buttons; Plan, Board, Pay, Request, Split bill in "+". `CardBuilders.tsx:46`
- **Swiping a bubble shows its time, status and "Edited"**, and you can slide from the hold onto a menu item. `MessageRow.tsx:405`, `MessageOverlay.tsx:145`
- **Groups with channels and roles**, one inbox row per group, channel chips with unread dots. `Groups.tsx:242`
- **A Live tab** on contact and group pages listing open polls, plans, bills and boards, and a blue dot on the chat name when one is open. `ContactPage.tsx:320`
- **Graded mutes:** Only @mentions, 1 hour, until tomorrow, calls separately, per channel. `Mute.tsx:36`
- **Group Mind**, Explore, several identities on one device, on-device dictation. `GroupMind.tsx:48`, `lib/stt.ts:84`
