import * as T from "@tabler/icons-react";

/**
 * Every icon in the app comes from Tabler (outline set, MIT).
 * One line weight app-wide (1.5) keeps icons calm and even beside Geist;
 * a few small or bold marks ask for a heavier line.
 */
type P = { size?: number; strokeWidth?: number };

const make = (Tabler: typeof T.IconBell, defaultStroke = 1.5) => {
  function Icon({ size = 20, strokeWidth = defaultStroke }: P) {
    return <Tabler size={size} stroke={strokeWidth} color="currentColor" aria-hidden="true" />;
  }
  return Icon;
};

export const IconBack = make(T.IconChevronLeft, 1.75);
export const IconChevron = make(T.IconChevronRight, 1.75);
export const IconReply = make(T.IconArrowBackUp);
export const IconCopy = make(T.IconCopy);
export const IconPin = make(T.IconPin);
export const IconEdit = make(T.IconPencil);
export const IconTrash = make(T.IconTrash);
export const IconPlus = make(T.IconPlus, 1.75);
export const IconArrowUp = make(T.IconArrowUp, 2);
export const IconMic = make(T.IconMicrophone);
export const IconClose = make(T.IconX, 1.75);
export const IconSearch = make(T.IconSearch);
export const IconCompose = make(T.IconEdit);
export const IconLock = make(T.IconLock);
export const IconBolt = make(T.IconBolt);
export const IconCloud = make(T.IconCloud);
export const IconBellOff = make(T.IconBellOff);
export const IconPhone = make(T.IconPhone);
export const IconSmile = make(T.IconMoodSmile);
export const IconCheck = make(T.IconCheck, 2);
export const IconFile = make(T.IconFile);
export const IconLink = make(T.IconLink);
export const IconBullets = make(T.IconList);
export const IconNumbers = make(T.IconListNumbers);
export const IconQuote = make(T.IconQuote);
export const IconCode = make(T.IconCode);
export const IconAt = make(T.IconAt);
export const IconSun = make(T.IconSun);
export const IconMoon = make(T.IconMoon);
export const IconArrowRight = make(T.IconArrowRight);
export const IconPoll = make(T.IconChartBar);
export const IconChecklist = make(T.IconListCheck);
export const IconBell = make(T.IconBell);
export const IconImage = make(T.IconPhoto);
export const IconCamera = make(T.IconCamera);
export const IconAttachment = make(T.IconPaperclip);
export const IconLocation = make(T.IconMapPin);
export const IconCalendar = make(T.IconCalendar);
export const IconMoneySend = make(T.IconCashMove);
export const IconMoneyReceive = make(T.IconCashMoveBack);
export const IconBold = make(T.IconBold, 1.75);
export const IconItalic = make(T.IconItalic, 1.75);
export const IconUnderline = make(T.IconUnderline, 1.75);
export const IconStrike = make(T.IconStrikethrough, 1.75);
export const IconHeading = make(T.IconHeading, 1.75);
export const IconPlay = make(T.IconPlayerPlay);
export const IconPause = make(T.IconPlayerPause);
export const IconDownload = make(T.IconDownload);
export const IconAlert = make(T.IconAlertTriangle);
export const IconShare = make(T.IconShare);
export const IconUserGroup = make(T.IconUsers);
export const IconBrush = make(T.IconBrush);
export const IconGame = make(T.IconDeviceGamepad2);
export const IconWheel = make(T.IconChartPie);
export const IconSparkles = make(T.IconSparkles);
export const IconUndo = make(T.IconArrowBackUp);
export const IconHeart = make(T.IconHeart);
export const IconBookmark = make(T.IconBookmark);
export const IconGrid = make(T.IconLayoutGrid);
export const IconShelf = make(T.IconBooks);
export const IconBoard = make(T.IconLayoutKanban);
export const IconTag = make(T.IconTag);
export const IconMore = make(T.IconDots, 1.75);
export const IconInbox = make(T.IconInbox);
export const IconChevronDown = make(T.IconChevronDown, 1.75);
export const IconListView = make(T.IconLayoutList);
export const IconFolder = make(T.IconFolder);
export const IconOpen = make(T.IconArrowUpRight, 1.75);
export const IconRoute = make(T.IconRoute);
export const IconReceipt = make(T.IconReceipt);
export const IconScan = make(T.IconScan);
export const IconTask = make(T.IconClipboardCheck);
export const IconClock = make(T.IconClock);
export const IconDrag = make(T.IconGripVertical);
export const IconFlag = make(T.IconFlag);
export const IconMessage = make(T.IconMessageCircle);
export const IconMail = make(T.IconMail);
export const IconWhatsapp = make(T.IconBrandWhatsapp);
export const IconQr = make(T.IconQrcode);
export const IconSettings = make(T.IconSettings);
export const IconLogout = make(T.IconLogout);
export const IconUserAdd = make(T.IconUserPlus);
export const IconGlobe = make(T.IconWorld);
export const IconShield = make(T.IconShield);
export const IconPalette = make(T.IconPalette);
export const IconStorage = make(T.IconDatabase);
export const IconInfo = make(T.IconInfoCircle);
export const IconHelp = make(T.IconHelpCircle);
export const IconSmartphone = make(T.IconDeviceMobile);
export const IconKeyboard = make(T.IconKeyboard);
export const IconDevice = make(T.IconDeviceDesktop);
export const IconContacts = make(T.IconAddressBook);
export const IconMinus = make(T.IconMinus, 2);
export const IconSliders = make(T.IconAdjustmentsHorizontal);
export const IconChart = make(T.IconChartLine);
export const IconWallet = make(T.IconWallet);
export const IconHide = make(T.IconEyeOff);
export const IconArrowDown = make(T.IconArrowDown, 1.75);
export const IconPaste = make(T.IconClipboard);
export const IconPadlock = make(T.IconLockSquareRounded);
export const IconPadlockOpen = make(T.IconLockOpen2);
export const IconRedo = make(T.IconArrowForwardUp);
export const IconShuffle = make(T.IconArrowsShuffle);
export const IconImageAdd = make(T.IconPhotoPlus);
export const IconFileAdd = make(T.IconFilePlus);
export const IconBook = make(T.IconBook);
export const IconVideo = make(T.IconVideo);
export const IconFilter = make(T.IconFilter);
export const IconMegaphone = make(T.IconSpeakerphone);
export const IconMenu = make(T.IconMenu2, 1.75);
export const IconRetry = make(T.IconRefresh);
export const IconCloudOff = make(T.IconCloudOff);
export const IconArchive = make(T.IconArchive);
export const IconUnarchive = make(T.IconPackageExport);
export const IconMarkUnread = make(T.IconMessageCircleExclamation);
export const IconMarkRead = make(T.IconMessageCircleCheck);
export const IconCheckCircle = make(T.IconCircleCheck);
export const IconPackage = make(T.IconPackage);

/** Tabler has no walkie-talkie; this one is drawn on the same 24px grid and line. */
export function IconWalkie({ size = 20, strokeWidth = 1.5 }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 7V2.5" />
      <path d="M9.5 7H14.5C16.4 7 17.5 8.1 17.5 10V19C17.5 20.9 16.4 22 14.5 22H9.5C7.6 22 6.5 20.9 6.5 19V10C6.5 8.1 7.6 7 9.5 7Z" />
      <path d="M9.5 10.5H14.5V13H9.5V10.5Z" />
      <path d="M9.5 16H14.5M9.5 18.5H14.5" />
      <path d="M17.5 11.5H18.5M17.5 14H18.5" />
    </svg>
  );
}
