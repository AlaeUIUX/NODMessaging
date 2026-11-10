# WhatsApp vs NOD

Goal: find where using NOD feels different from using WhatsApp on an iPhone, and close the gaps that matter before launch.

## How it works

1. **[inventory.md](inventory.md)**: every WhatsApp iOS interaction, with NOD's status taken from the code (Same, Different, Missing, Not for us). Nothing needs recording to read it.
2. **[shot-list.md](shot-list.md)**: the clips to record on your iPhone, in order. Only the rows where NOD is Different or Missing and that people use often.
3. **You record** the clips in a test group (below) and copy them to `raw/whatsapp/`.
4. **Claude cuts them into frames** (`cut.sh`), records the same flows in NOD into `raw/nod/`, and writes the comparison: WhatsApp next to NOD, what differs, and a call for each one (copy it, keep ours, or skip) with the effort it takes.
5. **Fixes ship one at a time** to nod-messaging.vercel.app, each with a clip on /updates.

`raw/` and `frames/` are kept out of git, because recordings show people's chats. The comparison stays private too. The frames Claude reads become part of the conversation with Claude, which is one more reason to keep personal chats off screen.

## Before you record: a test group

Your own chats shouldn't end up in a recording. Set up a small stage instead:

1. **A group called "NOD test"** with one or two colleagues who are happy to appear in the clips, plus **a 1:1 chat** with one of them.
2. **Ask a colleague to send, a day ahead:**
   - about 20 ordinary messages over the day, including a long one (over 10 lines) and one that's only an emoji 👍
   - 3 photos sent together, and one short video
   - a voice message of about 20 seconds
   - a link (a YouTube video and a news article)
   - a PDF
   - a poll
   - a message that @mentions you, and a reply to one of yours
3. **Just before recording, have them send 5 messages** in the group while you're out of it, so you have unread messages to open.
4. **Make a chat list called "NOD test"** (Chats › the filter row › + ) holding only the test chats. Pick it before any clip that shows your chats list, so other chats stay off screen.
5. **Turn on Do Not Disturb**, so banners from other chats don't appear.
6. **Light mode, standard text size**, so frames compare fairly with NOD.

## How to record

- **Start:** Control Center › Screen Recording. Microphone off is fine.
- **One action per clip.** Wait a second, do the action slowly, then hold the end state for a second before stopping.
- **Record in the order of the shot list** and don't rename anything: Claude matches clips to shots by the time they were recorded. If a take goes wrong, delete it on the phone before recording it again.
- **The recording doesn't show your finger.** For the gesture shots marked ✋ (hold, swipe, drag), it helps to also film the phone with a second phone. Optional.

## Getting the clips onto this PC

Any of these works. Put the files in `D:\Claude\NOD\docs\whatsapp-gap\raw\whatsapp\`:

- **Cable:** plug in the iPhone, open File Explorer › Apple iPhone › Internal Storage › DCIM, and copy the newest videos.
- **iCloud for Windows**, or upload to Google Drive / OneDrive and download here.

Then tell Claude "the WhatsApp clips are in". It runs `bash docs/whatsapp-gap/cut.sh` and takes it from there.

## cut.sh

```bash
bash docs/whatsapp-gap/cut.sh
```

```bash
bash docs/whatsapp-gap/cut.sh --motion raw/whatsapp/01-hold-menu.mp4 2.0 2.8
```

The first keeps a frame each time the screen changes (at most 3 a second), stamps it with its time, and tiles the frames into contact sheets in `frames/`. The second keeps every frame between two times, to measure how long an animation takes. Needs ffmpeg (installed here through winget).
