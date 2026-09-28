"use client";

import { defaultStyles, FileIcon, type FileIconProps } from "react-file-icon";
import styles from "./chat.module.css";

/**
 * A document glyph for any file, labelled with its extension (react-file-icon).
 * The library's own palette is loud, so each family of formats gets one calm
 * colour of ours: a tinted page, a deeper fold, and a label in the family ink.
 * Tinted, not white, so the page still reads on a light bubble.
 */
type Family = { ink: string; page: string; fold: string; exts: string[]; type?: FileIconProps["type"] };

const FAMILIES: Family[] = [
  { ink: "#D93831", page: "#FDEDEC", fold: "#F6C9C6", exts: ["pdf"], type: "acrobat" },
  { ink: "#2B63D9", page: "#EAF1FD", fold: "#C4D6F7", exts: ["doc", "docx", "odt", "pages", "rtf", "gdoc"], type: "document" },
  { ink: "#1D8F55", page: "#E7F5EE", fold: "#BFE3CE", exts: ["xls", "xlsx", "csv", "numbers", "ods", "tsv", "gsheet"], type: "spreadsheet" },
  { ink: "#D2621F", page: "#FDF0E7", fold: "#F4CFB5", exts: ["ppt", "pptx", "key", "odp", "gslides"], type: "presentation" },
  { ink: "#8A6A3B", page: "#F5EFE6", fold: "#E0D2BD", exts: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "dmg", "iso"], type: "compressed" },
  { ink: "#8E4FD1", page: "#F3ECFC", fold: "#D9C6F4", exts: ["mp3", "wav", "aac", "m4a", "flac", "ogg", "aiff", "opus"], type: "audio" },
  { ink: "#C23A73", page: "#FBEAF1", fold: "#F0C2D6", exts: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "wmv"], type: "video" },
  { ink: "#0E8FA0", page: "#E5F5F7", fold: "#BCE4EA", exts: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "tif", "tiff", "raw"], type: "image" },
  { ink: "#6E56CF", page: "#EFECFB", fold: "#D3CBF5", exts: ["svg", "fig", "sketch", "ai", "psd", "xd", "eps", "indd", "afdesign"], type: "vector" },
  {
    ink: "#475569", page: "#EEF1F4", fold: "#CFD6DE", type: "code",
    exts: ["js", "ts", "tsx", "jsx", "json", "html", "css", "scss", "py", "rb", "go", "java", "kt", "swift", "c", "cpp", "cs", "php", "sh", "yml", "yaml", "xml", "sql"],
  },
  { ink: "#57534E", page: "#F2F1EF", fold: "#D8D5D1", exts: ["txt", "md", "log", "ttf", "otf", "woff", "woff2"], type: "document" },
];
const OTHER: Family = { ink: "#78716C", page: "#F2F1EF", fold: "#D8D5D1", exts: [], type: "document" };

/** Guesses a family from the MIME type when the name has no telling extension. */
function byMime(mime = ""): Family {
  if (mime === "application/pdf") return FAMILIES[0];
  if (mime.startsWith("image/")) return FAMILIES[7];
  if (mime.startsWith("audio/")) return FAMILIES[5];
  if (mime.startsWith("video/")) return FAMILIES[6];
  if (mime.includes("zip") || mime.includes("compressed")) return FAMILIES[4];
  return OTHER;
}

function extensionOf(name: string) {
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : "";
}

export default function FileTypeIcon({ name, mime, size = 32 }: { name: string; mime?: string; size?: number }) {
  const ext = extensionOf(name);
  const family = FAMILIES.find((f) => f.exts.includes(ext)) ?? byMime(mime);
  const known = (defaultStyles as Record<string, Partial<FileIconProps>>)[ext];
  // Long or missing extensions fall back to a short label that still fits the badge.
  const label = ext && ext.length <= 5 ? ext : family === OTHER ? "file" : (mime?.split("/")[1] ?? "file").slice(0, 4);
  return (
    <span className={styles.fileType} style={{ width: size }} aria-hidden="true">
      <FileIcon
        {...known}
        type={known?.type ?? family.type}
        extension={label}
        labelUppercase
        color={family.page}
        foldColor={family.fold}
        glyphColor={family.ink}
        labelColor={family.ink}
        labelTextColor="#FFFFFF"
        gradientOpacity={0}
        radius={4}
      />
    </span>
  );
}
