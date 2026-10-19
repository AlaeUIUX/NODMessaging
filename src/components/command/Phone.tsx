"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useNow } from "@/components/chat/ui";
import { IconCheck, IconCloud } from "@/components/chat/Icons";
import { canCommand, clock, person, type OpState } from "./data";
import * as op from "./store";
import { CriticalTakeover, MovePrompt, UiProvider, type Ui } from "./parts";
import { BoardView, BroadcastsView, ChatView, GroupChat, Inbox, NewOperationSheet, OpPage, ZonePage } from "./Screens";
import { RadioScreen } from "./RadioScreen";
import { Console } from "./Console";
import c from "./command.module.css";

/* ---------------------------------------------------------------------------
   A screen host: sheets, toasts and navigation for whatever is inside it.
--------------------------------------------------------------------------- */

export function useHost(me: string, nav: Omit<Ui, "me" | "now" | "toast" | "sheet">) {
  const now = useNow(1000);
  const [sheet, setSheet] = useState<ReactNode | null>(null);
  const [toast, setToast] = useState<{ text: string; key: number } | null>(null);
  const ui: Ui = {
    me,
    now,
    sheet: setSheet,
    toast: (text) => {
      const key = Date.now();
      setToast({ text, key });
      setTimeout(() => setToast((t) => (t?.key === key ? null : t)), 2400);
    },
    ...nav,
  };
  const overlays = (
    <>
      {sheet}
      {toast && <div key={toast.key} className={c.toast} role="status"><IconCheck size={14} />{toast.text}</div>}
    </>
  );
  return { ui, overlays };
}

export type PhoneRoute =
  | { s: "inbox" }
  | { s: "group"; channel?: string }
  | { s: "radio" }
  | { s: "op"; tab?: "zones" | "live" | "mind" }
  | { s: "zone"; zoneId: string }
  | { s: "chat"; zoneId: string }
  | { s: "broadcasts" }
  | { s: "board" }
  | { s: "console" };

export function Phone({ s, me, start, startSheet, onDisplay }: {
  s: OpState;
  me: string;
  start: PhoneRoute[];
  startSheet?: "newop";
  /** Opens the wide Command display (on the stage); without it, the console opens inside the phone. */
  onDisplay?: () => void;
}) {
  const [stack, setStack] = useState<PhoneRoute[]>(start);
  const push = (r: PhoneRoute) => setStack((x) => [...x, r]);
  const pop = () => setStack((x) => (x.length > 1 ? x.slice(0, -1) : x));
  const route = stack[stack.length - 1];
  const { ui, overlays } = useHost(me, {
    openZone: (zoneId) => push({ s: "zone", zoneId }),
    openChat: (zoneId) => push({ s: "group", channel: zoneId }),
    openConsole: canCommand(me) ? () => (onDisplay ? onDisplay() : push({ s: "console" })) : undefined,
  });

  // While this person is on screen they answer for themselves (no simulated replies).
  useEffect(() => op.watch(me), [me]);

  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (startSheet !== "newop" || opened) return;
    const t = setTimeout(() => { setOpened(true); ui.sheet(<NewOperationSheet onDone={() => push({ s: "group" })} />); }, 350);
    return () => clearTimeout(t);
    // Only once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSheet, opened]);

  const crew = !canCommand(me);
  const critical = crew ? [...s.broadcasts].reverse().find((b) => b.level === "critical" && !b.acks[me] && op.audienceOf(s, b.audience).includes(me)) : undefined;
  const move = s.requests.find((r) => r.accepts[me] === "pending");
  const sending = s.requests.filter((r) => r.sending && r.by === me).length;
  const backLabel = stack.length > 1 ? (stack[stack.length - 2].s === "op" ? "EWC" : stack[stack.length - 2].s === "group" ? "Chat" : "Back") : "Back";

  let screen: ReactNode;
  switch (route.s) {
    case "inbox": screen = <Inbox s={s} onOpen={() => push({ s: "group" })} />; break;
    case "group": screen = <GroupChat s={s} channel={route.channel} onBack={pop} onInfo={() => push({ s: "op" })} onRadio={() => push({ s: "radio" })} />; break;
    case "radio": screen = <RadioScreen s={s} onBack={pop} />; break;
    case "op": screen = <OpPage s={s} initialTab={route.tab} onBack={pop} onBroadcasts={() => push({ s: "broadcasts" })} onBoard={() => push({ s: "board" })} onRadio={() => push({ s: "radio" })} onChannel={(id) => push({ s: "group", channel: id })} />; break;
    case "zone": screen = <ZonePage key={route.zoneId} s={s} zoneId={route.zoneId} onBack={pop} backLabel={backLabel} />; break;
    case "chat": screen = <ChatView s={s} zoneId={route.zoneId} onBack={pop} />; break;
    case "broadcasts": screen = <BroadcastsView s={s} onBack={pop} />; break;
    case "board": screen = <BoardView s={s} onBack={pop} />; break;
    case "console": screen = <div className={c.page}><Console s={s} onClose={pop} /></div>; break;
  }

  return (
    <UiProvider value={ui}>
      <div className={c.phone}>
        <div className={c.phoneScreen}>
          <div className={c.statusBar}>
            <b>{clock(ui.now)}</b>
            <span className={c.notch} />
            <span className={c.statusIcons}>
              {sending > 0 && <span className={c.statusSending}><IconCloud size={12} />{sending}</span>}
              <span className={c.bars}><i /><i /><i /><i /></span>
            </span>
          </div>
          <div className={c.phoneBody} key={stack.length + route.s}>{screen}</div>
          {move && !critical && (
            <div className={c.moveHost}><MovePrompt s={s} r={move} /></div>
          )}
          {critical && <CriticalTakeover b={critical} muted={!!s.muted[me]} />}
          {overlays}
          <span className={c.homeBar} />
        </div>
      </div>
    </UiProvider>
  );
}

export const personaName = (id: string) => person(id).name;
