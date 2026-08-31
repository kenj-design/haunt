/**
 * The way in, on a device that has no account yet.
 *
 * Two doors: start something new, or bring an existing account across with its
 * recovery code. There is no third option and nothing to sign up for — the
 * account is made by opening the app.
 *
 * Laid out like an onboarding step, because it is the step before them: the same
 * header, the same art zone, the same actions at the foot. It says what the app
 * is in one line rather than repeating what the first step is about to explain.
 *
 * Only appears with a backend that has accounts. On the mock backend there is
 * one imaginary person and this screen never renders.
 */

import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import {
  formatRecoveryCode,
  isRecoveryCodeComplete,
  normalizeRecoveryCode,
} from '../lib/recoveryCode'
import { PrimaryButton } from '../components/ui'
import Stamp from '../components/Stamp'

export default function SignIn({
  onStartFresh,
  onRecoverWithCode,
}: {
  onStartFresh: () => Promise<void>
  onRecoverWithCode: (code: string) => Promise<void>
}) {
  const [mode, setMode] = useState<'choose' | 'code'>('choose')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ready = isRecoveryCodeComplete(code)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      // On success this screen is replaced, so `busy` is left set deliberately:
      // clearing it would flash the buttons back to life mid-transition.
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'something went wrong')
      setBusy(false)
    }
  }

  return (
    <div className="onboarding-shell relative flex h-full flex-col overflow-hidden bg-black px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="relative z-20 flex min-h-11 items-center justify-between">
        <div className="flex min-w-11 items-center">
          {mode === 'code' ? (
            <button
              type="button"
              onClick={() => {
                setMode('choose')
                setError(null)
              }}
              className="onboarding-icon-button pressable flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white/74"
              aria-label="go back"
            >
              <ArrowLeft size={17} strokeWidth={1.6} />
            </button>
          ) : (
            <span className="onboarding-mini-orb" aria-hidden="true" />
          )}
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">
          Haunt
        </p>
        <span className="w-11" />
      </header>

      <main className="onboarding-step relative z-10 flex min-h-0 flex-1 flex-col">
        {mode === 'choose' ? (
          <>
            <div className="onboarding-art">
              <Stamp slot="signIn" eager className="note-reveal w-[240px]" />
            </div>
            <h1 className="text-[34px] font-semibold leading-[1.06] tracking-[-0.05em] text-white">
              A private map of real places.
            </h1>
            <p className="mt-4 text-[15px] leading-[1.52] text-white/54">
              Friends hand them to each other one at a time. No email and no
              password: this device is the account, and a recovery code is how you
              carry it to another one.
            </p>

            <div className="onboarding-actions">
              <PrimaryButton disabled={busy} onClick={() => void run(onStartFresh)}>
                {busy ? 'opening…' : 'start here'}
              </PrimaryButton>
              <PrimaryButton variant="ghost" disabled={busy} onClick={() => setMode('code')}>
                I have a recovery code
              </PrimaryButton>
            </div>
          </>
        ) : (
          <>
            <div className="onboarding-art onboarding-art-small">
              <Stamp slot="recovery" eager tilt={1.4} className="w-[132px]" />
            </div>
            <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Enter your recovery code.
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/50">
              The sixteen characters you saved when you started. Case and dashes
              don't matter.
            </p>

            <div className="onboarding-field mt-7 flex items-center rounded-[24px] px-5 py-4">
              <input
                autoFocus
                value={code}
                aria-label="recovery code"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                placeholder="XXXX-XXXX-XXXX-XXXX"
                onChange={(event) =>
                  setCode(formatRecoveryCode(normalizeRecoveryCode(event.target.value)))
                }
                className="w-full bg-transparent text-center font-mono text-[18px] tracking-[0.08em] text-white placeholder:text-white/22"
              />
            </div>

            <div className="mt-3 min-h-5 text-center">
              {error && <p className="fade-in text-[12px] text-fof">{error}</p>}
            </div>

            <p className="mt-2 px-2 text-center text-[11px] leading-[1.5] text-white/34">
              Anything already on this device stays behind — an account is not
              merged into another one.
            </p>

            <div className="onboarding-actions">
              <PrimaryButton
                disabled={!ready || busy}
                onClick={() => void run(() => onRecoverWithCode(code))}
              >
                {busy ? 'looking…' : 'bring it here'}
              </PrimaryButton>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
