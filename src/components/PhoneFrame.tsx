import type { ReactNode } from 'react'

/**
 * The device the prototype lives inside.
 *
 * Every top-level surface renders through this — the app shell, the boot screen,
 * and the sign-in screen — so switching between them never moves or resizes the
 * frame. On a phone it fills the viewport; on a desktop it becomes a device sat
 * on a dark ground.
 */
export default function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0b0b0d] sm:py-6">
      <div className="relative flex h-dvh w-full max-w-[393px] flex-col overflow-hidden bg-bg shadow-[0_38px_120px_rgba(0,0,0,.72)] sm:h-[852px] sm:max-h-[92dvh] sm:rounded-[48px] sm:border sm:border-white/[0.12]">
        {children}
      </div>
    </div>
  )
}
