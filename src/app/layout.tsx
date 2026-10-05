import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
});

export const metadata: Metadata = {
  // Makes the generated link-preview image an absolute URL.
  metadataBase: new URL("https://nod-messaging.vercel.app"),
  title: "NOD — Where projects get talked through",
  description: "NOD is a messenger for people who run projects: groups with channels for every team, polls, checklists and payments right in the thread, and Mind to keep what matters.",
};

// On a phone the app is the whole page: draw under the notch and home bar
// (the app pads itself with env(safe-area-inset-*)), and let the keyboard
// shrink the layout so the composer stays above it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAF9" },
    { media: "(prefers-color-scheme: dark)", color: "#0C0A09" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
