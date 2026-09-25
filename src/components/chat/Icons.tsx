import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  Alert02Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowRight02Icon, ArrowTurnBackwardIcon, ArrowUp02Icon, AtIcon,
  Attachment01Icon, Calendar03Icon, Call02Icon, Camera01Icon, Cancel01Icon, ChartBarLineIcon, CheckListIcon,
  CloudIcon, Copy01Icon, Delete02Icon, Download01Icon, File01Icon, FlashIcon, Heading01Icon, Image01Icon,
  LeftToRightListBulletIcon, LeftToRightListNumberIcon, Link01Icon, Location01Icon, LockIcon, Mic02Icon,
  MoneyReceive01Icon, MoneySend01Icon, Moon02Icon, Notification01Icon, NotificationOff01Icon, PauseIcon,
  PencilEdit01Icon, PencilEdit02Icon, PinIcon, PlayIcon, PlusSignIcon, QuoteDownIcon, Search01Icon, SmileIcon,
  Share08Icon, SourceCodeIcon, PaintBrush01Icon, GameController03Icon, PieChartIcon, SparklesIcon, Undo02Icon, FavouriteIcon, Sun03Icon, TextBoldIcon, TextItalicIcon, TextStrikethroughIcon, TextUnderlineIcon, Tick02Icon, UserGroupIcon,
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
