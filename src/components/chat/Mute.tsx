"use client";

import { useState } from "react";
import { describe, MUTE_FOR, readMutes, ruleFor, setMute, untilFor, type MessagesSetting, type MuteFor, type MuteRule } from "@/lib/chat/mutes";
import { IconAt, IconBell, IconBellOff, IconCheck, IconPhone } from "./Icons";
import { Sheet, Toggle, useNow } from "./ui";
import styles from "./chat.module.css";
import m from "./mute.module.css";

/**
 * One sheet for every mute: what still notifies (everything, only @mentions,
 * nothing), for how long, and calls on their own. Inside a group, a channel
 * can also simply follow the group. Unmute is one tap at the bottom.
 */

type Choice = MessagesSetting | "follow";

export function MuteSheet({ me, chatId, name, group, onClose, onToast }: {
  me: string;
  chatId: string;
  /** "NOD Team", "#design", "Charles". */
  name: string;
  /** For a channel: its group, which it follows unless it has its own rule. */
  group?: { id: string; name: string };
  onClose: () => void;
  onToast?: (t: string) => void;
}) {
  const now = useNow(60_000);
  const rules = readMutes(me);
  const own = ruleFor(rules, chatId, now);
  const groupRule = group ? ruleFor(rules, group.id, now) : null;
  const [choice, setChoice] = useState<Choice>(own ? own.messages : group ? "follow" : "all");
  const [length, setLength] = useState<MuteFor>(own?.until ? "8h" : "always");
  const [calls, setCalls] = useState(own?.calls ?? false);

  const options: { id: Choice; label: string; sub: string; icon: React.ReactNode }[] = [
    ...(group ? [{ id: "follow" as const, label: `Same as ${group.name}`, sub: describe(groupRule, now), icon: <span className={m.follow}>↩</span> }] : []),
    { id: "all", label: "Everything", sub: "Every message notifies you", icon: <IconBell size={18} /> },
    { id: "mentions", label: "Only @mentions", sub: "Quiet, unless someone mentions you", icon: <IconAt size={18} /> },
    { id: "none", label: "Nothing", sub: `No notifications from ${name}`, icon: <IconBellOff size={18} /> },
  ];

  const save = () => {
    if (choice === "follow" || (choice === "all" && !calls)) {
      setMute(me, chatId, null);
      onToast?.(choice === "follow" ? `${name} follows ${group!.name}` : `Notifications on for ${name}`);
      return;
    }
    const rule: MuteRule = { messages: choice, calls, until: choice === "all" && !calls ? null : untilFor(length, Date.now()) };
    setMute(me, chatId, rule);
    onToast?.(`${name}: ${describe(rule, Date.now())}`);
  };

  return (
    <Sheet title="Notifications" onClose={onClose} action={{ label: "Done", onClick: save }}>
      {(close) => (
        <>
          <p className={m.lede}>{name}{own ? <span> · now {describe(own, now).toLowerCase()}</span> : null}</p>
          <div className={styles.listGroup} role="radiogroup" aria-label="What notifies you">
            {options.map((o) => (
              <button key={o.id} role="radio" aria-checked={choice === o.id} className={`${m.option} ${choice === o.id ? m.on : ""}`} onClick={() => setChoice(o.id)}>
                <span className={m.icon}>{o.icon}</span>
                <span className={styles.contactText}><b>{o.label}</b><small>{o.sub}</small></span>
                <span className={`${styles.pickCircle} ${choice === o.id ? styles.pickOn : ""}`}>{choice === o.id && <IconCheck size={12} />}</span>
              </button>
            ))}
          </div>

          {(choice === "mentions" || choice === "none" || calls) && (
            <>
              <p className={styles.sheetLabel}>For</p>
              <div className={styles.chipGrid}>
                {MUTE_FOR.map((f) => (
                  <button key={f.id} className={`${styles.choice} ${length === f.id ? styles.choiceOn : ""}`} onClick={() => setLength(f.id)}>{f.label}</button>
                ))}
              </div>
            </>
          )}

          {choice !== "follow" && (
            <div className={m.calls}>
              <span className={m.icon}><IconPhone size={17} /></span>
              <span className={styles.contactText}><b>Mute calls</b><small>Calls from {name} don’t ring</small></span>
              <Toggle on={calls} onChange={setCalls} label="Mute calls" />
            </div>
          )}

          {own && (
            <button className={styles.secondaryWide} onClick={() => close(() => { setMute(me, chatId, null); onToast?.(`Notifications on for ${name}`); })}>
              Unmute now
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}
