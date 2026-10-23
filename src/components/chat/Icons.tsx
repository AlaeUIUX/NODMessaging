import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowRight02Icon, ArrowTurnBackwardIcon, ArrowUp02Icon, AtIcon,
  Attachment01Icon, Calendar03Icon, Call02Icon, Camera01Icon, Cancel01Icon, ChartBarLineIcon, CheckListIcon,
  CloudIcon, Copy01Icon, Delete02Icon, Download01Icon, File01Icon, FlashIcon, Heading01Icon, Image01Icon,
  LeftToRightListBulletIcon, LeftToRightListNumberIcon, Link01Icon, Location01Icon, LockIcon, Mic02Icon,
  MoneyReceive01Icon, MoneySend01Icon, Moon02Icon, Notification01Icon, NotificationOff01Icon, PauseIcon,
  PencilEdit01Icon, PencilEdit02Icon, PinIcon, PlayIcon, PlusSignIcon, QuoteDownIcon, Search01Icon, SmileIcon,
  Share08Icon, SourceCodeIcon, Route01Icon, Invoice03Icon, ScanIcon, Task01Icon, Clock01Icon, DragDropVerticalIcon, Flag01Icon, Folder01Icon, ArrowUpRight01Icon, Bookmark02Icon, GridViewIcon, LibraryIcon, KanbanIcon, Tag01Icon, MoreHorizontalIcon, InboxIcon, ArrowDown01Icon, LeftToRightListDashIcon, PaintBrush01Icon, GameController03Icon, PieChartIcon, SparklesIcon, Undo02Icon, FavouriteIcon, Sun03Icon, TextBoldIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon, Tick02Icon, UserGroupIcon,
  Message01Icon, Mail01Icon, WhatsappIcon, QrCodeIcon, Settings02Icon, Logout03Icon, UserAdd01Icon, Globe02Icon,
  Shield01Icon, PaintBoardIcon, Database01Icon, InformationCircleIcon, HelpCircleIcon, SmartPhone01Icon, KeyboardIcon, ComputerIcon, Contact01Icon,
  MinusSignIcon, SlidersHorizontalIcon, ChartLineData01Icon, Wallet01Icon, ArrowDown02Icon,
  ClipboardPasteIcon, SquareLock01Icon, SquareUnlock01Icon, Redo02Icon, ShuffleIcon, ImageAdd01Icon, FileAddIcon, Book02Icon, Video01Icon,
  FilterHorizontalIcon, Megaphone02Icon, Menu01Icon,
} from "@hugeicons/core-free-icons";

/**
 * Every icon in the app comes from Hugeicons (free, stroke-rounded set).
 * One stroke weight app-wide keeps icons optically consistent with Geist.
 */
type P = { size?: number; strokeWidth?: number };

const make = (icon: IconSvgElement, defaultStroke = 1.6) => {
  function Icon({ size = 20, strokeWidth = defaultStroke }: P) {
    return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} color="currentColor" aria-hidden="true" />;
  }
  return Icon;
};

export const IconBack = make(ArrowLeft01Icon, 1.8);
export const IconChevron = make(ArrowRight01Icon, 1.8);
export const IconReply = make(ArrowTurnBackwardIcon);
export const IconCopy = make(Copy01Icon);
export const IconPin = make(PinIcon);
export const IconEdit = make(PencilEdit02Icon);
export const IconTrash = make(Delete02Icon);
export const IconPlus = make(PlusSignIcon, 1.8);
export const IconArrowUp = make(ArrowUp02Icon, 2);
export const IconMic = make(Mic02Icon);
export const IconClose = make(Cancel01Icon, 1.8);
export const IconSearch = make(Search01Icon);
export const IconCompose = make(PencilEdit01Icon);
export const IconLock = make(LockIcon);
export const IconBolt = make(FlashIcon);
export const IconCloud = make(CloudIcon);
export const IconBellOff = make(NotificationOff01Icon);
export const IconPhone = make(Call02Icon);
export const IconSmile = make(SmileIcon);
export const IconCheck = make(Tick02Icon, 2);
export const IconFile = make(File01Icon);
export const IconLink = make(Link01Icon);
export const IconBullets = make(LeftToRightListBulletIcon);
export const IconNumbers = make(LeftToRightListNumberIcon);
export const IconQuote = make(QuoteDownIcon);
export const IconCode = make(SourceCodeIcon);
export const IconAt = make(AtIcon);
export const IconSun = make(Sun03Icon);
export const IconMoon = make(Moon02Icon);
export const IconArrowRight = make(ArrowRight02Icon);
export const IconPoll = make(ChartBarLineIcon);
export const IconChecklist = make(CheckListIcon);
export const IconBell = make(Notification01Icon);
export const IconImage = make(Image01Icon);
export const IconCamera = make(Camera01Icon);
export const IconAttachment = make(Attachment01Icon);
export const IconLocation = make(Location01Icon);
export const IconCalendar = make(Calendar03Icon);
export const IconMoneySend = make(MoneySend01Icon);
export const IconMoneyReceive = make(MoneyReceive01Icon);
export const IconBold = make(TextBoldIcon, 1.8);
export const IconItalic = make(TextItalicIcon, 1.8);
export const IconUnderline = make(TextUnderlineIcon, 1.8);
export const IconStrike = make(TextStrikethroughIcon, 1.8);
export const IconHeading = make(Heading01Icon, 1.8);
export const IconPlay = make(PlayIcon);
export const IconPause = make(PauseIcon);
export const IconDownload = make(Download01Icon);
export const IconAlert = make(Alert02Icon);
export const IconShare = make(Share08Icon);
export const IconUserGroup = make(UserGroupIcon);
export const IconBrush = make(PaintBrush01Icon);
export const IconGame = make(GameController03Icon);
export const IconWheel = make(PieChartIcon);
export const IconSparkles = make(SparklesIcon);
export const IconUndo = make(Undo02Icon);
export const IconHeart = make(FavouriteIcon);
export const IconBookmark = make(Bookmark02Icon);
export const IconGrid = make(GridViewIcon);
export const IconShelf = make(LibraryIcon);
export const IconBoard = make(KanbanIcon);
export const IconTag = make(Tag01Icon);
export const IconMore = make(MoreHorizontalIcon, 1.8);
export const IconInbox = make(InboxIcon);
export const IconChevronDown = make(ArrowDown01Icon, 1.8);
export const IconListView = make(LeftToRightListDashIcon);
export const IconFolder = make(Folder01Icon);
export const IconOpen = make(ArrowUpRight01Icon, 1.8);
export const IconRoute = make(Route01Icon);
export const IconReceipt = make(Invoice03Icon);
export const IconScan = make(ScanIcon);
export const IconTask = make(Task01Icon);
export const IconClock = make(Clock01Icon);
export const IconDrag = make(DragDropVerticalIcon);
export const IconFlag = make(Flag01Icon);
export const IconMessage = make(Message01Icon);
export const IconMail = make(Mail01Icon);
export const IconWhatsapp = make(WhatsappIcon);
export const IconQr = make(QrCodeIcon);
export const IconSettings = make(Settings02Icon);
export const IconLogout = make(Logout03Icon);
export const IconUserAdd = make(UserAdd01Icon);
export const IconGlobe = make(Globe02Icon);
export const IconShield = make(Shield01Icon);
export const IconPalette = make(PaintBoardIcon);
export const IconStorage = make(Database01Icon);
export const IconInfo = make(InformationCircleIcon);
export const IconHelp = make(HelpCircleIcon);
export const IconSmartphone = make(SmartPhone01Icon);
export const IconKeyboard = make(KeyboardIcon);
export const IconDevice = make(ComputerIcon);
export const IconContacts = make(Contact01Icon);
export const IconMinus = make(MinusSignIcon, 2.2);
export const IconSliders = make(SlidersHorizontalIcon);
export const IconChart = make(ChartLineData01Icon);
export const IconWallet = make(Wallet01Icon);
export const IconArrowDown = make(ArrowDown02Icon, 1.8);
export const IconPaste = make(ClipboardPasteIcon);
export const IconPadlock = make(SquareLock01Icon);
export const IconPadlockOpen = make(SquareUnlock01Icon);
export const IconRedo = make(Redo02Icon);
export const IconShuffle = make(ShuffleIcon);
export const IconImageAdd = make(ImageAdd01Icon);
export const IconFileAdd = make(FileAddIcon);
export const IconBook = make(Book02Icon);
export const IconVideo = make(Video01Icon);
export const IconFilter = make(FilterHorizontalIcon);
export const IconMegaphone = make(Megaphone02Icon);
export const IconMenu = make(Menu01Icon, 1.8);

/** Hugeicons' free set has no walkie-talkie; this one is drawn on the same 24px grid and stroke. */
const WalkieTalkieIcon: IconSvgElement = [
  ["path", { d: "M9 7V2.5", stroke: "currentColor", strokeLinecap: "round", key: "0" }],
  ["path", { d: "M9.5 7H14.5C16.4 7 17.5 8.1 17.5 10V19C17.5 20.9 16.4 22 14.5 22H9.5C7.6 22 6.5 20.9 6.5 19V10C6.5 8.1 7.6 7 9.5 7Z", stroke: "currentColor", strokeLinejoin: "round", key: "1" }],
  ["path", { d: "M9.5 10.5H14.5V13H9.5V10.5Z", stroke: "currentColor", strokeLinejoin: "round", key: "2" }],
  ["path", { d: "M9.5 16H14.5M9.5 18.5H14.5", stroke: "currentColor", strokeLinecap: "round", key: "3" }],
  ["path", { d: "M17.5 11.5H18.5M17.5 14H18.5", stroke: "currentColor", strokeLinecap: "round", key: "4" }],
];
export const IconWalkie = make(WalkieTalkieIcon);
