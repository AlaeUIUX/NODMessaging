import type { Metadata } from "next";
import CommandCenter from "@/components/command/CommandCenter";

export const metadata: Metadata = {
  title: "NOD · Command",
  description: "Prototype: running a live event from NOD.",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const as = (await searchParams).as;
  return <CommandCenter as={typeof as === "string" ? as : undefined} />;
}
