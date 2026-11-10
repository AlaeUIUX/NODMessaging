import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Changelog from "@/components/changelog/Changelog";
import { WEEKS, weekBySlug } from "@/components/changelog/weeks";

/** One week's address: the changelog with that week's sheet already open. */
export function generateStaticParams() {
  return WEEKS.map((w) => ({ week: w.slug }));
}
export const dynamicParams = false;

type Props = { params: Promise<{ week: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const w = weekBySlug((await params).week);
  if (!w) return {};
  return { title: `Week ${w.n}: ${w.title} · NOD changelog`, description: w.summary[0] };
}

export default async function Page({ params }: Props) {
  const { week } = await params;
  if (!weekBySlug(week)) notFound();
  return <Changelog initial={week} />;
}
