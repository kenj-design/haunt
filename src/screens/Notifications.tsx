/**
 * Quiet News.
 *
 * Haunt only speaks when something happened in the real world — someone reached
 * a place, or handed one on. There is no feed and nothing algorithmic to catch
 * up on, which is why this screen is usually short.
 *
 * A pass opens the haunt itself, still locked. A visit opens the chain instead,
 * because the news is that the chain grew.
 */
import { useEffect } from 'react'
import { Footprints, Mail, MapPin } from 'lucide-react'
import { useApp } from '../context/appState'
import { Avatar, ScreenHeader } from '../components/ui'
import type { Notification } from '../domain'

function iconFor(notification: Notification) {
  switch (notification.kind) {
    case 'visit':
      return <Footprints size={15} strokeWidth={1.5} className="text-[#6fd4ac]" />
    case 'pass':
      return <Mail size={15} strokeWidth={1.5} className="text-note-ink" />
    case 'anon':
      return <MapPin size={15} strokeWidth={1.5} className="text-ink-2" />
  }
}

export default function Notifications() {
  const { notifications, haunts, goBack, navigate, markNotificationsRead } = useApp()

  // Opening the screen is the read receipt. Nothing here depends on it landing.
  useEffect(() => {
    void markNotificationsRead()
  }, [markNotificationsRead])

  const open = (n: Notification) => {
    const haunt = haunts.find((h) => h.id === n.hauntId)
    if (!haunt) return
    // visit + anonymous route to the lineage; a pass routes to the locked haunt
    if (n.kind === 'pass') navigate({ name: 'haunt', hauntId: haunt.id })
    else navigate({ name: 'lineage', hauntId: haunt.id })
  }

  return (
    <div className="screen-in h-full overflow-y-auto no-scrollbar pb-10">
      <ScreenHeader title="Quiet News" serif onBack={goBack} />
      <div className="stagger flex flex-col px-4">
        {notifications.map((n) => (
          <button
            key={n.id}
            onClick={() => open(n)}
            className="premium-card mb-2 flex pressable cursor-pointer items-center gap-3.5 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-200 hover:bg-white/[0.09]"
          >
            {n.actorHandle ? (
              <Avatar handle={n.actorHandle} role={n.kind === 'visit' ? 'visitor' : 'passer'} size={38} />
            ) : (
              <Avatar handle="?" role="anon" size={38} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] leading-snug text-ink">{n.text}</p>
              <p className="mt-0.5 text-[11px] text-ink-3">{n.time}</p>
            </div>
            {iconFor(n)}
          </button>
        ))}
      </div>
      <p className="mt-10 px-10 text-center text-[11px] leading-relaxed text-ink-3">
        haunt only speaks when something happened in the real world
      </p>
    </div>
  )
}
