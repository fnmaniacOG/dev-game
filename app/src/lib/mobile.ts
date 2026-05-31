// Haptic feedback — no-op on desktop, native on mobile PWA
export function hapticRaidSuccess() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([50, 30, 80]);
  }
}

export function hapticRaidFail() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([100]);
  }
}

export function hapticLevelUp() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([50, 50, 50, 50, 100]);
  }
}
