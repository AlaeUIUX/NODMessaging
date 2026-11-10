/**
 * The changelog, a week at a time (weeks start on Monday). Newest first.
 * Each week has a short summary for the list and sections for its sheet.
 * Media lives in public/changelog (this project's recordings and stills) and
 * public/updates (the clips made for the week of 2 November).
 */

export type Media =
  /** A recording or still of the app in its iPhone, the whole device, on a card. `label` names it in a pair. */
  | { kind: "video"; src: string; poster: string; alt: string; frame: "device"; label?: string }
  | { kind: "image"; src: string; alt: string; frame: "device"; label?: string }
  /** A 16:10 clip that already has its own stage (the 2 November clips). */
  | { kind: "video"; src: string; poster: string; alt: string; frame: "wide"; label?: undefined };

export type Section = {
  id: string;
  title: string;
  /** A short label beside the title, e.g. "GAP 1". */
  tag?: string;
  text: string[];
  media?: Media[];
  /** Where to find it in the prototype. */
  try?: string;
};

export type Week = {
  /** The Monday it starts on; also its address, /changelog/<slug>. */
  slug: string;
  n: number;
  from: string;
  to: string;
  title: string;
  summary: string[];
  people: string[];
  /** Still being built: the work isn't all live yet. */
  open?: boolean;
  cover?: Media[];
  sections: Section[];
};

const shot = (name: string, alt: string): Media => ({ kind: "image", src: `/changelog/${name}.webp`, alt, frame: "device" });
const rec = (name: string, alt: string, label?: string): Media => ({ kind: "video", src: `/changelog/${name}.mp4`, poster: `/changelog/${name}.webp`, alt, frame: "device", label });
const clip = (name: string, alt: string): Media => ({ kind: "video", src: `/updates/${name}.mp4`, poster: `/updates/${name}.webp`, alt, frame: "wide" });

export const WEEKS: Week[] = [
  {
    slug: "2026-11-09",
    n: 8,
    from: "2026-11-09",
    to: "2026-11-15",
    open: true,
    title: "A chat list that moves like iOS",
    summary: [
      "The chat list now works the way WhatsApp's does: drafts in the row, previews that say what a message is, swipes, an Archive, a hold-to-peek menu, Favourites and lists of your own.",
      "Everything that slides runs on springs that start from your finger's speed, with a light haptic at each threshold. A colour and icon pass makes NOD calmer: a softer blue, readable greys in dark mode and a new line icon set.",
    ],
    people: ["Alae"],
    cover: [rec("swipes", "Swiping chats in the list: Unread and Pin on the left, More and Archive on the right, then a long swipe that archives.")],
    sections: [
      {
        id: "swipes",
        title: "Swipe a chat",
        text: [
          "Swipe right for Unread and Pin, left for More and Archive. The buttons grow out of the edge with the row, full height, and the outer one takes over once you pass the threshold, so one long swipe archives without a tap.",
          "Let go early and the row springs back at the speed you let go. Crossing the threshold gives a small tick on iPhone.",
        ],
        media: [rec("swipes", "Swiping chats: Unread and Pin, More and Archive, then a full swipe that archives Jamshad's chat.")],
        try: "swipe any chat in the list, slowly and then all the way.",
      },
      {
        id: "archive",
        title: "Archive",
        text: [
          "Archived chats leave the list and wait behind an Archived row at the top, and the toast has Undo. Opening any chat clears the unread mark you set on it.",
        ],
        try: "swipe a chat all the way left, then tap Archived.",
      },
      {
        id: "hold",
        title: "Hold to peek",
        text: [
          "Hold a chat and it lifts into a preview of its latest messages, with a menu under it: Mark as read, Pin, Mute, Add to Favourites, Add to list and Archive. Tap the preview to open the chat.",
        ],
        media: [rec("hold", "Holding the NOD Team chat: a preview of its messages lifts up with a menu below, then a tap opens the chat.")],
        try: "press and hold any chat.",
      },
      {
        id: "drafts",
        title: "Drafts",
        text: [
          "Start a message and go back: the chat's row says Draft in blue with your words, and moves up to where it would be if you had sent it. Open the chat again and the message is still in the field, ready to finish.",
        ],
        media: [rec("drafts", "Typing a message to Reema, going back: her row reads “Draft: Can we move the review to Friday?” and moves up; opening it again, the words are still there.")],
        try: "start typing in a chat, go back, and look at its row.",
      },
      {
        id: "rows",
        title: "Previews and your own lists",
        text: [
          "Previews say what a message is (a photo, a voice note, a poll, a checklist, a board) with its icon, and ticks show whether yours was read.",
          "Favourites and lists you make yourself sit in the chips above the list, each with a count. The chips glide with momentum when you throw them, like a native scroll view.",
        ],
        try: "hold a chat › Add to list.",
      },
      {
        id: "motion",
        title: "Motion like iOS",
        text: [
          "The same three gestures, on last week's build and this week's: a short throw of the edge swipe back, a swipe to reply, and a throw down on the Add to message sheet.",
          "Last week, letting go mid-swipe finished on a fixed curve, judged by the average speed of the whole drag, so a short throw snapped back into the chat. Now every move continues from the finger's own speed on a spring, the way Core Animation does it, so the same throw carries you back to the list. Sheets didn't drag at all; now a throw sends them down.",
          "The photo viewer works the same way: a flick moves one photo and a pull down closes it. Rows that scroll sideways (chips, collections) glide and settle using the physics of the carousels on the Catalyst Design Lab site.",
        ],
        media: [
          rec("motion-before", "Last week: the edge swipe snaps back into the chat, and the sheet ignores the throw until Cancel.", "Last week"),
          rec("motion-after", "This week: the edge swipe carries on to the chat list, and the sheet flies down with the throw.", "This week"),
        ],
        try: "in a chat, swipe from the left edge and let go early; open + and throw the sheet down.",
      },
      {
        id: "sort",
        title: "Sort, without the swipe",
        text: [
          "Sort in Mind no longer asks you to swipe for German or Later. The things to sort sit in the middle as a small pile, always the same size. Pick a collection from the row under it and the item flies into it, and the one behind moves up without a flash. Search has its own line above the collections.",
        ],
        media: [rec("sort", "Sorting in Mind: the item in the middle flies into Trip ideas, then the next into German, until all is sorted.")],
        try: "Mind › Sort on the things-to-sort tray.",
      },
      {
        id: "colour",
        title: "A calmer blue, readable greys",
        text: [
          "We compared NOD with WhatsApp, Telegram, iMessage, Signal and Instagram. NOD's blue was much darker than any of theirs, so it's now a softer, brighter blue for links, buttons and your own bubbles, in both themes.",
          "In dark mode the secondary greys are easier to read, the surfaces lift off pure black, and the bars use a warm glass that matches the page. The chosen filter chip is a tint of the blue, and blue badges keep white numbers.",
        ],
        media: [shot("dark-inbox", "The chat list in dark mode, with the new blue badges and tinted All chip."), shot("dark-chat", "A chat in dark mode, with blue bubbles for your own messages.")],
        try: "Settings › Chats & appearance › Dark.",
      },
      {
        id: "icons",
        title: "New icons, quiet Settings",
        text: [
          "Every icon is now from Tabler, a calm line set, in place of the rounder Hugeicons that felt playful. The Settings icons lost their coloured tiles: a quiet grey line, like WhatsApp's, so the words lead.",
        ],
        media: [shot("settings", "Settings with the new line icons in a quiet grey.")],
        try: "tap your picture in the chat list for Settings.",
      },
    ],
  },
  {
    slug: "2026-11-02",
    n: 7,
    from: "2026-11-02",
    to: "2026-11-08",
    title: "Typing, pins and the answers to Gaps in Mind",
    summary: [
      "Typing shows who's typing and stays on while they type. Pins work like WhatsApp's, the Dashboard adds money up in one currency, and Mind answers the gaps in Vanessa's “Gaps in Mind” review: offline, failures, uploads, currencies, sharing and people who aren't contacts.",
    ],
    people: ["Alae"],
    cover: [clip("pins", "Two phones side by side: one pins a message and it flies into the bar under the header.")],
    sections: [
      {
        id: "typing",
        title: "Typing that holds",
        text: [
          "“Reema is typing” stays on for as long as she types. It used to vanish after 5 seconds. Groups show the faces of everyone typing, and “3 people are typing” in the header and the inbox, with the channel's name. Editing a sent message no longer says you're typing.",
        ],
        media: [clip("typing", "Typing indicators with faces in a group, staying on while people type.")],
        try: "open a second window as someone in NOD Team and type for a while.",
      },
      {
        id: "pins",
        title: "Pins, the WhatsApp way",
        text: [
          "Pinning asks for how long (24 hours, 7 days or 30 days) and the message flies into a bar under the header. Up to three pins; a tap on the bar goes to one and steps to the next. “You pinned a message” stays in the thread. In groups, pinning is a role permission.",
        ],
        media: [clip("pins", "Pinning a message: it flies into the pinned bar.")],
        try: "hold a message › Pin.",
      },
      {
        id: "money",
        title: "Money in one currency",
        text: [
          "Dashboard totals and charts add up in your main currency, at reference rates, marked “≈” when something was converted. Each bill keeps its own currency on its row. “Spent this month” now lists only this month.",
        ],
        media: [clip("money", "Dashboard money widgets adding up in one currency.")],
        try: "Settings › Currency.",
      },
      {
        id: "offline",
        title: "Offline",
        tag: "GAP 1",
        text: [
          "One quiet line: “Offline · showing what's on this phone”. New items wait with a clock and send themselves when the phone is back. Moving, deleting, sharing and edits are refused up front, with a toast that says what needs a connection.",
        ],
        media: [clip("offline", "Mind offline: new items wait to send.")],
        try: "Developer panel › Go offline.",
      },
      {
        id: "retry",
        title: "When NOD can't be reached",
        tag: "GAP 1",
        text: [
          "A change that fails comes back, and the toast names it (“Couldn't delete it. It's back.”) with Retry. A collection that can't load says so in its place, with Try again.",
        ],
        media: [clip("retry", "A failed delete coming back with Retry.")],
        try: "Developer panel › Force Mind & network failure.",
      },
      {
        id: "uploads",
        title: "Uploads",
        tag: "GAP 2",
        text: [
          "Photos and files land at once from the phone's copy, dimmed, with a ring (photo) or a thin bar (file). One that fails gets a retry arrow on its tile. Skeletons wait 300 ms, so quick loads don't flash.",
        ],
        media: [clip("uploads", "Photos uploading with a ring, files with a bar.")],
        try: "add an Image or a File to any collection.",
      },
      {
        id: "currency",
        title: "Currencies",
        tag: "GAP 7",
        text: [
          "The picker lists Recent, then Common, then All, and searches by code, name or country. Cards show the symbol, adding the code only when the symbol is shared ($, kr, ¥). A new amount starts in the last currency used, else the phone's region's.",
        ],
        media: [clip("currency", "The currency picker with Recent, Common and All.")],
        try: "add an Amount, tap the currency.",
      },
      {
        id: "shared",
        title: "Shared with you",
        tag: "GAP 8",
        text: [
          "One row on Mind home for everything others shared with you: collections first, then items, newest first. Swipe or hold for Save a copy (the row then reads “In your Mind”) or Hide, which leaves the owner's Mind alone.",
        ],
        media: [clip("shared", "Shared with you on Mind home.")],
        try: "Reset demo data, then Mind. Charles and Reema have shared something.",
      },
      {
        id: "unassigned",
        title: "Delete everything asks first",
        tag: "GAP 10",
        text: [
          "With shared items out of Unassigned, “Delete everything” means your own things. It asks first with the count on the button, and Undo brings it all back.",
        ],
        media: [clip("unassigned", "Delete everything asking first, with a count.")],
        try: "hold the “things to sort” tray.",
      },
      {
        id: "strangers",
        title: "People who aren't contacts",
        tag: "GAP 11",
        text: [
          "Sharing names people by their contact name, else @username, else “Someone on NOD”, with a silhouette instead of an initial. A request from someone we can't name says so, and Allow asks once before giving them access.",
        ],
        media: [clip("strangers", "A request from someone who isn't a contact.")],
        try: "open a link to your collection as a crew member (?as=noura) and ask to view.",
      },
    ],
  },
  {
    slug: "2026-10-26",
    n: 6,
    from: "2026-10-26",
    to: "2026-11-01",
    title: "Pins in the header and a locked ID",
    summary: [
      "A short week. Pinned messages got a home in the chat header, Operations' Needs you folds away, signing in has one way in, and your ID reads as locked when you edit your profile.",
    ],
    people: ["Alae"],
    sections: [
      {
        id: "pins-header",
        title: "Pins in the header",
        text: [
          "Pinning a message flew a copy of it into a pin button in the chat header, next to the board and the call. The pin opened every pinned message, to jump to or unpin, and pinned bubbles wore a small pin.",
          "The next week replaced the button with WhatsApp's bar under the header, after the review asked for it.",
        ],
      },
      {
        id: "needs-you",
        title: "Needs you folds away",
        text: ["In an Operation, Needs you folds under a chevron, so the zones come first when nothing is urgent."],
        try: "open EWC 2026 · Riyadh.",
      },
      {
        id: "sign-in",
        title: "One way in, a locked ID",
        text: [
          "Signed out, there's just Get started; the two buttons went to the same place. In Edit profile, your ID reads as locked: flat, dimmed and with a lock, since it can't change.",
        ],
        try: "Settings › Edit.",
      },
    ],
  },
  {
    slug: "2026-10-19",
    n: 5,
    from: "2026-10-19",
    to: "2026-10-25",
    title: "Operations: running a live event from a group",
    summary: [
      "Groups can be Operations: zones are channels, crews are roles and Command has its own permissions. A push-to-talk radio dictates on the phone itself. In Mind, saving something finally feels like something happened.",
    ],
    people: ["Alae"],
    cover: [shot("ewc", "The EWC 2026 · Riyadh Operation's #general channel, with crew updates.")],
    sections: [
      {
        id: "operations",
        title: "Operations in the app",
        text: [
          "The EWC 2026 · Riyadh Operation is seeded with 29 crew and four recruits. Any group can be created as, or turned into, an Operation: zones are channels, crews are roles, and Command can broadcast, move people and answer requests. Crew invite links work.",
          "A persona switcher shows every point of view, and a simulator keeps the venue talking: requests, issues and check-ins arrive through the day.",
        ],
        media: [shot("ewc", "Crew updates in the Operation's #general channel.")],
        try: "open EWC 2026 · Riyadh, and switch persona from Viewing as.",
      },
      {
        id: "radio",
        title: "A radio that writes down what's said",
        text: [
          "Push to talk, and the radio dictates live on the device (Moonshine, in a worker), streaming words while you talk, with a card for who's speaking. The browser's own engine is the fallback, and nothing made up is ever sent. The chat composer can dictate the same way.",
          "Calls on air show as an island: the picture, a live wave and the words on their own layer.",
        ],
      },
      {
        id: "drawer",
        title: "The drawer, the Log and the day",
        text: [
          "A Discord-style drawer (zones, channels, people) replaces the channel bar. The Live tab became a Log in folding stretches of time with its own filter. The day pill opens a Day sheet to finish, pause or go back a day, each confirmed; a paused day quiets the simulation.",
        ],
      },
      {
        id: "command-center",
        title: "Command Center",
        text: ["A clickable prototype at /command-center for running a live event from NOD: the console, the radio, insights and the phone screens, built from the hand-off spec."],
      },
      {
        id: "saving",
        title: "Saving feels like something happens",
        text: [
          "Anything added to Mind lands: it drops in with a slight tilt, a glint crosses it and a ring breathes out in its collection's colour. Save to Mind from a chat flies a copy of the message into Mind's mark on the toast.",
          "Things without a collection wait in a tray above the collections: a fanned pile, a count and Sort. When the last one is sorted, the tray goes in a puff and the collections slide up.",
        ],
        media: [shot("mind", "Mind home with the things-to-sort tray above the collections.")],
        try: "hold a message › Save to Mind.",
      },
      {
        id: "more",
        title: "Also",
        text: [
          "To-dos with checklists, reminders with quick times, progress with a unit, and pictures shown as pins. Shelf view gives each tag its own sideways row. A group is its square picture, the way a contact is their photo.",
        ],
      },
    ],
  },
  {
    slug: "2026-10-12",
    n: 4,
    from: "2026-10-12",
    to: "2026-10-18",
    title: "Mind keeps real things: books, videos, palettes",
    summary: [
      "Mind learned what things are: links fill in their titles, videos and books come with covers, palettes work like Coolors and dates pop a calendar. Collections can be shared, and everything saved without a home waits in Unassigned to be sorted.",
    ],
    people: ["Alae"],
    cover: [shot("german", "The German collection in Grid: an exam date, a book's progress, flashcards and a review.")],
    sections: [
      {
        id: "things",
        title: "Links, videos and books",
        text: [
          "Paste a link and its title fills itself in. A video is a link: the title, channel and still come from YouTube or Vimeo, and tapping it opens it already playing. Books search Apple Books and Open Library by title, author, ISBN or link, with covers, year and pages.",
        ],
        media: [shot("german", "A collection with a date, a book and flashcards.")],
        try: "Mind › German › + › Book.",
      },
      {
        id: "palettes",
        title: "Palettes and iOS dates",
        text: [
          "Palettes work like Coolors: change, lock, copy, add and remove colours, Generate (or Space) around the locked ones, with undo and redo. Dates are an iOS-style pill that pops up a calendar, also used for plans and task due dates.",
        ],
      },
      {
        id: "sharing",
        title: "Sharing",
        text: [
          "Share a collection or an item with people or by link, send it into a chat as a live card, ask for access, edit a shared copy, or make your own copy. Collections get Search, Filter (tags, date, type) and a menu.",
        ],
      },
      {
        id: "one-level",
        title: "One level, grouped by tags",
        text: [
          "Stacks and sections are gone: a collection holds its items side by side, and tags group them. Saved Minds were folded once on load, each stack's items tagged with the stack's name, so filtering by that tag gives the stack back.",
          "Things saved without a collection wait in Unassigned, with a Sort flow to give each a place. A chat whose save you sorted sends its next saves straight there.",
        ],
        media: [shot("trip", "Trip ideas in List: a checklist, a date and a link, grouped by their tags.")],
      },
      {
        id: "data-colours",
        title: "Data colours",
        text: ["Priority is red, orange, blue and stone instead of brick, mustard and periwinkle, and “soon” no longer reads as yellow. Every status has a text shade and a brighter mark shade, so charts and dots stop using colours meant for text."],
      },
    ],
  },
  {
    slug: "2026-10-05",
    n: 3,
    from: "2026-10-05",
    to: "2026-10-11",
    title: "Groups with channels, Explore and a Dashboard of widgets",
    summary: [
      "Spaces became groups, with text channels, roles and invitations. Explore picks collections, groups and things for you from what you keep. The Dashboard is now widgets you pick, size and arrange, with real charts.",
    ],
    people: ["Alae"],
    cover: [shot("nodteam", "NOD Team's #general channel: channel chips under the header, a poll and a stack of photos.")],
    sections: [
      {
        id: "groups",
        title: "Groups and channels",
        text: [
          "Create a group with a picture, name, description and colour, then invite people. Text channels sit as chips under the chat header, each with a topic, who can see it and who can post; the inbox shows one row per group with unread added up.",
          "Roles: Admin, Member and roles of your own with permissions. Invitations wait behind a red badge on +, and invite links join you straight in.",
        ],
        media: [shot("nodteam", "Channel chips under the group header.")],
        try: "open NOD Team and tap #design.",
      },
      {
        id: "explore",
        title: "Explore",
        text: [
          "A top pick, friends' recent saves and joins, groups for you and collections to add, ranked against what you keep and who you know. Shelves per collection you keep show one card at a time, with the next peeking; hold a card for its menu, like a message.",
        ],
        media: [shot("explore", "Explore: a pick because you collect German, and what friends saved lately.")],
        try: "the Explore tab.",
      },
      {
        id: "dashboard",
        title: "A Dashboard of widgets",
        text: [
          "The Dashboard starts empty, with a short intro that ends at your first widget. Pick what to keep an eye on (money, boards, polls, plans), size it, and hold it to move: the others glide aside and a blue slot shows where it lands.",
          "Widgets draw real charts, sized to fit, with readouts on hover and touch, and a chart choice per widget: area, line, bars, donut, stacked, gauge or blocks.",
        ],
        media: [shot("dashboard", "An empty Dashboard inviting you to set it up.")],
        try: "Dashboard › Set up your dashboard.",
      },
      {
        id: "group-mind",
        title: "A group's Mind, and muting",
        text: [
          "A group's Mind replaces its Files and Links tabs; admins edit it full screen, on a copy, and Save shares it. Muting is one tap from the inbox or a channel, or choose what still notifies you, for how long, and whether calls ring.",
        ],
      },
    ],
  },
  {
    slug: "2026-09-28",
    n: 2,
    from: "2026-09-28",
    to: "2026-10-04",
    title: "Live, plans, bills and boards, and signing in",
    summary: [
      "Chats learned to carry work: a Live view of what's still open, timed plans, bills split from a receipt and project boards. NOD got onboarding, phone sign-in, profiles and Settings. Vanessa's Analytics joined as a tab.",
    ],
    people: ["Alae", "Vanessa"],
    cover: [shot("charles", "A chat with Charles: a board card with what's yours and what moved recently.")],
    sections: [
      {
        id: "live",
        title: "Live and plans",
        text: [
          "A blue dot after a chat's name means something is still open; the name opens a contact page with Live (needs you, waiting on others), Media, Files, Links and Members. Plans are timed itineraries with Now and Next, RSVPs, owners and costs, with reminders before your stops.",
        ],
      },
      {
        id: "bills",
        title: "Bill split and invoices",
        text: [
          "Photograph a receipt (or use a sample), claim who had what, and everyone's exact share is worked out to the cent; pay with a Face ID confirm and mark it settled. Requesting money can carry an itemised invoice with VAT, a due date and a note.",
        ],
      },
      {
        id: "boards",
        title: "Project boards",
        text: [
          "Boards in chats and groups: drag tasks between columns, open a task sheet, type /task, or make a task from any message. Several boards per chat with a switcher. Shared cards sync change by change, so two people editing at once both keep their edits.",
        ],
        media: [shot("charles", "A board card in a chat.")],
        try: "open Charles › Open board.",
      },
      {
        id: "accounts",
        title: "Onboarding, profiles and Settings",
        text: [
          "A four-slide welcome, then a phone number and a texted code. New people get a skippable profile step: photo, name, username and bio. Several identities can live on one phone. Settings opens from your picture: notifications, privacy, appearance, language, storage, help and about.",
        ],
        media: [shot("settings", "Settings, opened from your picture.")],
        try: "tap your picture in the chat list.",
      },
      {
        id: "analytics",
        title: "Analytics, from Vanessa",
        text: ["Vanessa's Analytics tab came in from her branch: a spend chart, who owes whom, Needs you, tasks, checklists, this week and messages, each opening its own sheet. It became the Dashboard the week after."],
      },
      {
        id: "hardening",
        title: "Hardening",
        text: ["A review pass across chat and data: a second tab chats for real, read receipts are batched, the composer survives edit mode, dialogs trap focus, and the app sizes itself for the iPhone keyboard and its safe areas."],
      },
    ],
  },
  {
    slug: "2026-09-21",
    n: 1,
    from: "2026-09-21",
    to: "2026-09-27",
    title: "NOD becomes an app",
    summary: [
      "The prototype moved into a real Next.js app. Chat got its foundations (sending that survives failure, realtime between tabs, a rich composer, reactions) and a glass redesign with polls, checklists, reminders, events and payments in the thread. Mind arrived to keep what matters.",
    ],
    people: ["Alae"],
    cover: [shot("reema", "A checklist in a chat with Reema, with a request from Jamshad to edit it.")],
    sections: [
      {
        id: "foundations",
        title: "Foundations",
        text: [
          "Messages send at once and settle when the server answers; one that fails waits with a retry. Two tabs chat with each other in real time, with presence and typing. The composer grows as you write, keeps drafts per chat, and supports bold, italic, headings, lists, quotes, code and links. Edits keep their history; reactions hang off a long-press menu.",
        ],
      },
      {
        id: "cards",
        title: "Work in the thread",
        text: [
          "From the + in the composer: polls, checklists with an edit-access request, reminders that notify, static and live location, events with RSVP, and payments. Photos sit outside bubbles, stack into collections and open full screen.",
        ],
        media: [shot("reema", "A checklist with an edit request in the thread.")],
        try: "open Reema's chat.",
      },
      {
        id: "glass",
        title: "Glass and motion",
        text: [
          "Frosted bubbles and bars, swipe to reply, an interactive edge swipe back, and spring entrances for sent and received messages. A landing page with a live phone, and a dot field that ripples on tap.",
        ],
      },
      {
        id: "mind",
        title: "Mind",
        text: [
          "Collections as folders, with notes, links, flashcards, books, amounts, dates, habits and uploads. Save to Mind from any message. One elevation scale for every shadow.",
        ],
        media: [shot("trip", "A Mind collection with a checklist, a date and a link.")],
      },
    ],
  },
];

export const weekBySlug = (slug: string) => WEEKS.find((w) => w.slug === slug);

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });
const parts = (iso: string) => { const d = new Date(iso + "T00:00:00Z"); return { d: d.getUTCDate(), m: MONTH.format(d), y: d.getUTCFullYear() }; };

/** "9 – 15 November 2026", or "28 September – 4 October 2026". */
export function weekRange(w: Week) {
  const a = parts(w.from), b = parts(w.to);
  if (a.m === b.m) return `${a.d} – ${b.d} ${b.m} ${b.y}`;
  return `${a.d} ${a.m} – ${b.d} ${b.m} ${b.y}`;
}
