"use client";

/**
 * A small tick under the finger: when a swipe arms, an action takes over, a
 * hold opens a menu. Android browsers have navigator.vibrate. iPhone Safari
 * has no vibration API, but since iOS 18 flipping a native switch control
 * (<input type="checkbox" switch>) plays the system's selection haptic, so a
 * hidden one is flipped instead. Neither does anything on a desktop.
 */

let switchLabel: HTMLLabelElement | null = null;

function iosSwitch() {
  if (!switchLabel) {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    switchLabel = label;
  }
  // Clicking the label can move focus to the switch: give it straight back.
  const before = document.activeElement as HTMLElement | null;
  switchLabel.click();
  if (before && document.activeElement !== before) before.focus({ preventScroll: true });
}

const isIOS = () =>
  typeof navigator !== "undefined"
  && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export function haptic(ms = 8) {
  if (typeof window === "undefined") return;
  // Chrome logs an error for vibrate() before the first real user gesture.
  if (!navigator.userActivation?.hasBeenActive) return;
  try {
    if (isIOS()) iosSwitch();
    else navigator.vibrate?.(ms);
  } catch { /* unsupported */ }
}
