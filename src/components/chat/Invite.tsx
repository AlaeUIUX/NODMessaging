"use client";

import { initials } from "@/lib/chat/avatar";
import { usePrefs } from "@/lib/chat/account";
import { ADDRESS_BOOK, allPeople, formatPhone } from "@/lib/chat/people";
import { useChat, userById } from "@/lib/chat/store";
import Avatar from "./Avatar";
import { IconCheck, IconCopy, IconMail, IconMessage, IconShare, IconWhatsapp } from "./Icons";
import { Sheet } from "./ui";
import styles from "./chat.module.css";
import s from "./account.module.css";

/* ===========================================================================
   Invite: a link and a code to share (the sharing itself is UI only)
   =========================================================================== */

/** A QR-looking pattern made from your username: the three corner squares, and a stable scatter of dots. */
export function QrPattern({ seed }: { seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rand = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1000) / 1000; };
  const finder = (x: number, y: number) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
  const centre = (x: number, y: number) => Math.abs(x - 12) <= 3 && Math.abs(y - 12) <= 3;
  const cells: [number, number][] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && !centre(x, y) && rand() > 0.52) cells.push([x, y]);
  const eye = (x: number, y: number) => (
    <g key={`${x}-${y}`}>
      <rect x={x + 0.5} y={y + 0.5} width={6} height={6} rx={1.6} fill="none" stroke="currentColor" strokeWidth={1} />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.8} />
    </g>
  );
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={s.qr} fill="currentColor" aria-hidden="true">
      {cells.map(([x, y]) => <rect key={`${x}:${y}`} x={x + 0.1} y={y + 0.1} width={0.8} height={0.8} rx={0.3} />)}
      {eye(0, 0)}{eye(n - 7, 0)}{eye(0, n - 7)}
    </svg>
  );
}

export function InviteSheet({ onClose, onToast }: { onClose: () => void; onToast: (t: string) => void }) {
  const { me } = useChat();
  const u = userById(me);
  const [prefs, setPrefs] = usePrefs(me);
  const link = `nod.app/i/${u.username ?? me}`;
  const text = `Join me on NOD, where we talk things through and keep what matters. ${link}`;
  const people = allPeople();
  const invite = ADDRESS_BOOK.filter((e) => e.phone !== u.phone && !people.some((p) => p.phone === e.phone));
  const copy = async () => {
    try { await navigator.clipboard.writeText(`https://${link}`); onToast("Invite link copied"); } catch { onToast(link); }
  };
  const via = (app: string) => onToast(`${app} would open with your invite`);
  return (
    <Sheet title="Invite friends" onClose={onClose}>
      <div className={s.invite}>
        <div className={s.qrCard}>
          <div className={s.qrWrap}>
            <QrPattern seed={u.username ?? me} />
            <span className={s.qrFace}><Avatar glyph={initials(u.fullName)} tone={u.tone} photo={u.photo} size={40} shape="circle" /></span>
          </div>
          <b>{u.fullName}</b>
          <small>Scan to chat with me on NOD</small>
        </div>
        <div className={s.linkRow}>
          <span>{link}</span>
          <button className={s.pill} onClick={copy}><IconCopy size={13} /> Copy</button>
        </div>
        <div className={s.shareRow}>
          <button onClick={() => via("Messages")}><span style={{ background: "#34C759" }}><IconMessage size={20} /></span>Messages</button>
          <button onClick={() => via("WhatsApp")}><span style={{ background: "#25D366" }}><IconWhatsapp size={20} /></span>WhatsApp</button>
          <button onClick={() => via("Mail")}><span style={{ background: "#3E67A6" }}><IconMail size={20} /></span>Mail</button>
          <button onClick={() => via("The share sheet")}><span style={{ background: "var(--ink)" }}><IconShare size={20} /></span>More</button>
        </div>
        <p className={styles.sheetLabel}>What they’ll get</p>
        <p className={s.invitePreview}>{text}</p>
        {invite.length > 0 && (
          <>
            <p className={styles.sheetLabel}>From your contacts</p>
            <div className={s.groupBody}>
              {invite.map((e) => {
                const sent = prefs.invited.includes(e.phone);
                return (
                  <div key={e.phone} className={s.personRow}>
                    <span className={s.personMain}>
                      <span className={s.ghostAvatar}>{initials(e.name)}</span>
                      <span className={s.rowText}><b>{e.name}</b><small>{formatPhone(e.phone)}</small></span>
                    </span>
                    <button className={`${s.pill} ${sent ? s.pillDone : s.pillAccent}`} disabled={sent} onClick={() => { setPrefs({ invited: [...prefs.invited, e.phone] }); onToast(`Invite sent to ${e.name.split(" ")[0]}`); }}>
                      {sent ? <><IconCheck size={12} /> Invited</> : "Invite"}
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}
        <p className={styles.demoNote}>Sharing is part of the design only: nothing is sent from the demo.</p>
      </div>
    </Sheet>
  );
}
