/**
 * The permissions step, lifted out of onboarding.
 *
 * It worked — it asked the browser for real and reported exactly what came back,
 * rendering nothing for an API the browser lacks. It is here rather than in the
 * flow because neither permission earns its keep on the web yet: nothing sends a
 * notification (no service worker, no VAPID keys, no push endpoint), and location
 * is asked for at the moment it is actually needed, which is a better moment to
 * ask. A screen whose only outcome is a system dialog you will see again anyway
 * is a screen worth skipping.
 *
 * Restore it in the native build, where a permission granted up front is worth
 * having and where push actually goes somewhere.
 */
import { useEffect, useState } from 'react'
import { Bell, Check, MapPin } from 'lucide-react'

type PermissionKind = 'notifications' | 'location'
/** `unsupported` is not a failure — it is a browser that has no such API. */
type PermissionStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unsupported'

const PERMISSIONS: Array<{
  id: PermissionKind
  title: string
  description: string
  icon: typeof Bell
}> = [
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Hear when a friend passes you a place or a haunt wakes nearby.',
    icon: Bell,
  },
  {
    id: 'location',
    title: 'Location',
    description: 'Reveal a haunt only when you cross into its hidden edge.',
    icon: MapPin,
  },
]

/** What the browser already thinks, so the screen doesn't ask twice or lie once. */
function initialPermissions(): Record<PermissionKind, PermissionStatus> {
  const notifications: PermissionStatus =
    typeof Notification === 'undefined'
      ? 'unsupported'
      : Notification.permission === 'granted'
        ? 'granted'
        : Notification.permission === 'denied'
          ? 'denied'
          : 'idle'
  const location: PermissionStatus =
    typeof navigator !== 'undefined' && navigator.geolocation ? 'idle' : 'unsupported'
  return { notifications, location }
}

export default function PermissionSteps() {
  const [permissions, setPermissions] =
    useState<Record<PermissionKind, PermissionStatus>>(initialPermissions)

  // A browser can be asked about location without prompting for it.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return
    let live = true
    void navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (!live || result.state === 'prompt') return
        setPermissions((current) => ({
          ...current,
          location: result.state === 'granted' ? 'granted' : 'denied',
        }))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const update = (kind: PermissionKind, status: PermissionStatus) =>
    setPermissions((current) => ({ ...current, [kind]: status }))

  /** Asks the browser, and reports exactly what it said — never a hopeful tick. */
  const request = async (kind: PermissionKind) => {
    update(kind, 'requesting')
    try {
      if (kind === 'notifications') {
        const result = await Notification.requestPermission()
        update(kind, result === 'granted' ? 'granted' : result === 'denied' ? 'denied' : 'idle')
        return
      }
      navigator.geolocation.getCurrentPosition(
        () => update(kind, 'granted'),
        (error) => update(kind, error.code === error.PERMISSION_DENIED ? 'denied' : 'idle'),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
      )
    } catch (error) {
      const dismissed = error instanceof DOMException && error.name === 'AbortError'
      update(kind, dismissed ? 'idle' : 'denied')
    }
  }

  const askable = PERMISSIONS.filter((permission) => permissions[permission.id] !== 'unsupported')

  return (
    <div className="onboarding-stagger flex flex-col gap-2.5">
      {askable.map(({ id, title, description, icon: Icon }) => {
        const status = permissions[id]
        const granted = status === 'granted'
        return (
          <div key={id} className="onboarding-permission-card flex items-center gap-3 rounded-[22px] p-3.5">
            <div className="onboarding-permission-icon flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white/80">
              <Icon size={17} strokeWidth={1.5} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-white/92">{title}</p>
              <p className="mt-0.5 text-[10px] leading-[1.35] text-white/42">{description}</p>
            </div>
            <button
              type="button"
              onClick={() => void request(id)}
              disabled={status === 'requesting' || granted}
              aria-label={`${granted ? 'allowed' : 'allow'} ${title}`}
              className={`pressable flex min-h-8 min-w-[61px] shrink-0 cursor-pointer items-center justify-center rounded-full border px-3 text-[10px] font-semibold transition-[color,background-color,border-color] duration-200 ${
                granted
                  ? 'border-visited/40 bg-visited/12 text-visited'
                  : status === 'denied'
                    ? 'border-white/10 bg-white/[0.04] text-white/42'
                    : 'border-white/16 bg-white/[0.075] text-white/78 hover:bg-white/[0.12]'
              }`}
            >
              {granted ? <Check size={13} /> : status === 'requesting' ? 'asking…' : status === 'denied' ? 'retry' : 'allow'}
            </button>
          </div>
        )
      })}
      {askable.length === 0 && (
        <p className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] px-4 py-5 text-center text-[12px] leading-relaxed text-white/36">
          this browser has none of these to give.
        </p>
      )}
    </div>
  )
}
