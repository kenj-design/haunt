/**
 * Whether this device is one visit away from forgetting the account.
 *
 * iOS deletes script-writable storage — including the one localStorage key the
 * session lives in — after seven days without a visit to the site. Since the
 * recovery code is derived rather than stored, nobody can put that account back:
 * eviction is loss. A web app added to the Home Screen is exempt, because it gets
 * its own storage container, so on iOS that is not a nicety but the difference
 * between a durable account and a temporary one.
 *
 * Nothing here can trigger the install — no browser exposes it — so the app can
 * only say where the button is.
 */

/** iPhone or iPad, including iPadOS which reports itself as a Mac. */
function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/iPad|iPhone|iPod/.test(ua)) return true
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1
}

/** Already running from the Home Screen rather than inside the browser. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const legacy = (navigator as Navigator & { standalone?: boolean }).standalone
  return legacy === true || window.matchMedia('(display-mode: standalone)').matches
}

/** True only when saying something about the Home Screen would be useful. */
export function shouldSuggestHomeScreen(): boolean {
  return isIos() && !isStandalone()
}
