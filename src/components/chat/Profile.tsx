"use client";

import { useRef } from "react";
import { initials, TONES } from "@/lib/chat/avatar";
import { usernameProblem } from "@/lib/chat/people";
import type { AvatarTone } from "@/lib/chat/types";
import Avatar from "./Avatar";
import { IconCamera, IconCheck } from "./Icons";
import s from "./account.module.css";

export interface ProfileDraft { fullName: string; username: string; tone: AvatarTone; photo?: string; bio?: string }

/** A photo, cropped to a centred square and shrunk to 256px, as a small JPEG data URL. */
export async function squarePhoto(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 256, 256);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const TONE_NAMES: Record<AvatarTone, string> = { clay: "Clay", sage: "Sage", ochre: "Ochre", denim: "Denim", plum: "Plum", graphite: "Graphite" };

/** The big avatar: tap for a photo; the swatches (optional) colour the initials when there's no photo. */
export function AvatarPicker({ draft, onChange, tones = true }: { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void; tones?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className={s.avatarPicker}>
      <button className={s.avatarBig} onClick={() => fileRef.current?.click()} aria-label={draft.photo ? "Change photo" : "Add a photo"}>
        <Avatar glyph={initials(draft.fullName)} tone={draft.tone} photo={draft.photo} size={96} shape="circle" />
        <span className={s.avatarBadge}><IconCamera size={15} /></span>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const photo = await squarePhoto(f);
          if (photo) onChange({ photo });
        }}
      />
      {draft.photo ? (
        <button className={s.textBtn} onClick={() => onChange({ photo: undefined })}>Remove photo</button>
      ) : !tones ? (
        <button className={s.textBtn} onClick={() => fileRef.current?.click()}>Upload a photo</button>
      ) : (
        <div className={s.tones} role="radiogroup" aria-label="Avatar colour">
          {(Object.keys(TONES) as AvatarTone[]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={draft.tone === t}
              aria-label={TONE_NAMES[t]}
              className={draft.tone === t ? s.toneOn : undefined}
              style={{ background: TONES[t] }}
              onClick={() => onChange({ tone: t })}
            >
              {draft.tone === t && <IconCheck size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Display name, username (optional, checked as you type) and a short bio. All optional: the phone number is what identifies you. */
export function ProfileFields({ draft, onChange, userId, withBio, namePlaceholder = "How people see you" }: { draft: ProfileDraft; onChange: (patch: Partial<ProfileDraft>) => void; userId?: string; withBio?: boolean; namePlaceholder?: string }) {
  const problem = usernameProblem(draft.username, userId);
  const bio = draft.bio ?? "";
  return (
    <div className={s.fields}>
      <label className={s.field}>
        <span>Display name</span>
        <input
          value={draft.fullName}
          onChange={(e) => onChange({ fullName: e.target.value.slice(0, 40) })}
          placeholder={namePlaceholder}
          autoComplete="name"
          data-autofocus
        />
      </label>
      <label className={`${s.field} ${draft.username && problem ? s.fieldBad : ""}`}>
        <span>Username</span>
        <span className={s.handle}>
          <i aria-hidden="true">@</i>
          <input
            value={draft.username}
            onChange={(e) => onChange({ username: e.target.value.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 20) })}
            placeholder="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            aria-describedby="username-status"
          />
        </span>
      </label>
      <p id="username-status" className={`${s.fieldNote} ${problem ? s.noteBad : draft.username ? s.noteOk : ""}`} aria-live="polite">
        {problem ?? (draft.username ? <><IconCheck size={12} /> @{draft.username} is yours</> : "Optional. Letters, numbers and _; people can find you by it.")}
      </p>
      {withBio && (
        <label className={s.field}>
          <span>Bio</span>
          <textarea value={bio} onChange={(e) => onChange({ bio: e.target.value.slice(0, 70) })} placeholder="A few words about you" rows={2} />
          <em className={s.counter}>{70 - bio.length}</em>
        </label>
      )}
    </div>
  );
}

/** Nothing is required; only a username that's typed has to be a good one. */
export const profileReady = (d: ProfileDraft, userId?: string) => !usernameProblem(d.username, userId);
