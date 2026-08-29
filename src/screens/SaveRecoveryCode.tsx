/**
 * The one time the recovery code is readable.
 *
 * Shown once onboarding is done, before the map. It blocks rather than nags,
 * because the code is not stored anywhere: not on the device, not in Postgres,
 * not derivable from the account. Skipping this step and then losing the phone
 * would lose everything, and there would be nothing anyone could do about it.
 *
 * The confirmation checkbox is deliberate friction. Someone who taps past a
 * dismissable banner has not saved anything.
 */

import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react'
import { PrimaryButton } from '../components/ui'

export default function SaveRecoveryCode({
  createCode,
  onSaved,
}: {
  createCode: () => Promise<string>
  onSaved: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    let cancelled = false
    createCode()
      .then((created) => {
        if (!cancelled) setCode(created)
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "couldn't secure this account")
        }
      })
    return () => {
      cancelled = true
    }
  }, [createCode])

  const copy = async () => {
    if (!code) return
    try {
      await navigator.clipboard.writeText(code)
    } catch {
      // Clipboard access is refused in plenty of contexts; the code is on screen
      // either way, which is the part that matters.
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2400)
  }

  return (
    <div className="onboarding-shell relative flex h-full flex-col overflow-hidden bg-black px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="relative z-20 flex min-h-11 items-center justify-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">
          Keep this somewhere
        </p>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col justify-center">
        <div className="onboarding-final-orb mx-auto mb-8" aria-hidden="true">
          <KeyRound size={22} strokeWidth={1.25} />
        </div>

        <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
          This is your way back.
        </h1>
        <p className="mt-3 text-[14px] leading-[1.5] text-white/52">
          Your account lives on this device. This code is the only thing that can
          move it to another one, or bring it back if this one is lost.
        </p>

        <button
          type="button"
          onClick={() => void copy()}
          disabled={!code}
          aria-label={code ? `recovery code ${code}. tap to copy` : 'preparing your code'}
          className="onboarding-field pressable mt-8 flex cursor-pointer flex-col items-center gap-2.5 rounded-[24px] px-5 py-6"
        >
          <span className="font-mono text-[21px] tracking-[0.12em] text-white">
            {code ?? '····-····-····-····'}
          </span>
          <span className="flex items-center gap-1.5 text-[11px] text-white/44">
            {copied ? (
              <>
                <Check size={12} strokeWidth={2} /> copied
              </>
            ) : (
              <>
                <Copy size={12} strokeWidth={1.6} /> tap to copy
              </>
            )}
          </span>
        </button>

        <div className="mt-5 flex items-start gap-2.5 px-1 text-[11px] leading-[1.45] text-white/40">
          <TriangleAlert size={13} strokeWidth={1.6} className="mt-0.5 shrink-0 text-fof" />
          <span>
            You will not be shown this again. Nobody can look it up for you —
            it isn't stored anywhere, which is also why nobody else can find it.
          </span>
        </div>

        {error && (
          <p className="fade-in mt-4 text-center text-[12px] text-fof">{error}</p>
        )}

        <button
          type="button"
          role="checkbox"
          aria-checked={confirmed}
          onClick={() => setConfirmed((saved) => !saved)}
          disabled={!code}
          className="pressable mt-8 flex cursor-pointer items-center gap-3 rounded-[18px] px-1 py-2 text-left"
        >
          <span
            aria-hidden="true"
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors duration-200 ${
              confirmed ? 'border-white bg-white text-black' : 'border-white/22 bg-white/[0.04]'
            }`}
          >
            {confirmed && <Check size={13} strokeWidth={2.4} />}
          </span>
          <span className="text-[13px] text-white/72">I've written it down somewhere safe</span>
        </button>

        <div className="mt-6">
          <PrimaryButton disabled={!confirmed || !code} onClick={onSaved}>
            open the map
          </PrimaryButton>
        </div>
      </main>
    </div>
  )
}
