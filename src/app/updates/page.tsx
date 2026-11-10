import { permanentRedirect } from "next/navigation";

/** The week-of-2-November clips now live in the changelog, as that week's entry. */
export default function Page() {
  permanentRedirect("/changelog/2026-11-02");
}
