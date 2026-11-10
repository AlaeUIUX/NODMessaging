import type { Metadata } from "next";
import Changelog from "@/components/changelog/Changelog";

export const metadata: Metadata = {
  title: "NOD · Changelog",
  description: "What changed in the NOD prototype, a week at a time, with recordings.",
};

export default function Page() {
  return <Changelog />;
}
