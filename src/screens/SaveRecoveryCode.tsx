/**
 * The one time a recovery code is readable.
 *
 * Two ways in. As `first`, it appears once onboarding is done and blocks the map
 * behind it — the code is not stored anywhere, so someone who taps past it and
 * then loses their phone has lost everything and nobody can help. As `replace`,
 * it is reached from the profile by someone who thinks their code got out.
 *
 * `replace` asks before generating, because minting a new code kills the old one
 * the instant it happens. An accidental tap must not be able to strand a code
 * that is written down somewhere.
 *
 * The confirmation checkbox is deliberate friction in both. Someone who
 * dismisses a banner has not saved anything.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, Copy, Download, Share, TriangleAlert } from 'lucide-react'
import { PrimaryButton } from '../components/ui'
import Stamp from '../components/Stamp'
import { shouldSuggestHomeScreen } from '../lib/install'
import { downloadRecoveryCard } from '../lib/recoveryCode'

type Stage = 'confirm' | 'showing'

export default function SaveRecoveryCode({
  variant = 'first',
  createCode,
  onDone,
  onBack,
}: {
  variant?: 'first' | 'replace'
  createCode: () => Promise<string>
  onDone: () => void
  onBack?: () => void
}) {
  const replacing = variant === 'replace'
  const [stage, setStage] = useState<Stage>(replacing ? 'confirm' : 'showing')
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savingImage, setSavingImage] = useState(false)
  const [imageSaved, setImageSaved] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  // Said here because this is the one screen where somebody is already thinking
  // about not losing the account.
  const suggestHomeScreen = useMemo(shouldSuggestHomeScreen, [])

  const generate = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setCode(await createCode())
      setStage('showing')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "couldn't secure this account")
    } finally {
      setBusy(false)
    }
  }, [createCode])

  const minted = useRef(false)

  /*
   * A first code is minted on arrival; a replacement waits to be asked for.
   *
   * Guarded by a ref because minting is not a read — each call replaces the
   * account's credentials, so the second one silently kills the code the first
   * one put on screen. React's development double-invoke of effects was doing
   * exactly that: two mints, and the person is looking at whichever came back
   * first. It only surfaced as a visible error because the second attempt
   * happened to fail.
   */
  useEffect(() => {
    if (replacing || minted.current) return
    minted.current = true
    void generate()
  }, [replacing, generate])

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

  const saveImage = async () => {
    if (!code || savingImage) return
    setSavingImage(true)
    setError(null)
    try {
      await downloadRecoveryCard(code)
      setImageSaved(true)
      setTimeout(() => setImageSaved(false), 2400)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "couldn't save the recovery image")
    } finally {
      setSavingImage(false)
    }
  }

  return (
    <div className="onboarding-shell relative flex h-full flex-col overflow-hidden bg-black px-5 pt-[max(28px,env(safe-area-inset-top))] pb-[max(24px,env(safe-area-inset-bottom))]">
      <header className="relative z-20 flex min-h-11 items-center">
        {onBack && stage === 'confirm' ? (
          <button
            type="button"
            onClick={onBack}
            className="onboarding-icon-button pressable flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-white/74"
            aria-label="go back"
          >
            <ArrowLeft size={17} strokeWidth={1.6} />
          </button>
        ) : (
          <span className="w-10" />
        )}
        <p className="flex-1 text-center text-[10px] font-semibold uppercase tracking-[0.2em] text-white/38">
          {replacing ? 'Replace your code' : 'Keep this somewhere'}
        </p>
        <span className="w-10" />
      </header>

      <main className="onboarding-step relative z-10 flex min-h-0 flex-1 flex-col">
        {/* Same art zone and same actions at the foot as the onboarding steps
            either side of this screen, so the sequence does not lurch. */}
        <div className="onboarding-art onboarding-art-small">
          <Stamp slot="recovery" eager tilt={1.4} className="w-[148px]" />
        </div>

        {stage === 'confirm' ? (
          <>
            <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              Make a new code?
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/52">
              Your current code stops working the moment this one is made. If it
              is written down anywhere, that copy becomes useless — including any
              device you were planning to use it on.
            </p>

            <div className="mt-6 flex items-start gap-2.5 px-1 text-[11px] leading-[1.45] text-white/40">
              <TriangleAlert size={13} strokeWidth={1.6} className="mt-0.5 shrink-0 text-fof" />
              <span>
                Devices already signed in stay signed in. Only the code changes.
              </span>
            </div>

            {error && <p className="fade-in mt-4 text-center text-[12px] text-fof">{error}</p>}

            <div className="onboarding-actions">
              <PrimaryButton disabled={busy} onClick={() => void generate()}>
                {busy ? 'making…' : 'make a new code'}
              </PrimaryButton>
              {onBack && (
                <PrimaryButton variant="ghost" disabled={busy} onClick={onBack}>
                  keep the one I have
                </PrimaryButton>
              )}
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[30px] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
              {replacing ? 'Here is the new one.' : 'This is your way back.'}
            </h1>
            <p className="mt-3 text-[14px] leading-[1.5] text-white/52">
              {replacing
                ? 'The old code no longer opens anything. This one takes its place.'
                : 'Your account lives on this device. This code is the only thing that can move it to another one, or bring it back if this one is lost.'}
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

            <button
              type="button"
              onClick={() => void saveImage()}
              disabled={!code || savingImage}
              className="onboarding-invite-action pressable mt-3 flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-[18px] px-4 text-[12px] font-semibold text-white/76"
            >
              <Download size={14} strokeWidth={1.6} />
              {savingImage ? 'making image…' : imageSaved ? 'image saved' : 'save image'}
            </button>

            <div className="mt-5 flex items-start gap-2.5 px-1 text-[11px] leading-[1.45] text-white/40">
              <TriangleAlert size={13} strokeWidth={1.6} className="mt-0.5 shrink-0 text-fof" />
              <span>
                You will not be shown this again. Nobody can look it up for you —
                it isn't stored anywhere, which is also why nobody else can find it.
              </span>
            </div>

            {suggestHomeScreen && (
              <div className="mt-3 flex items-start gap-2.5 px-1 text-[11px] leading-[1.45] text-white/40">
                <Share size={13} strokeWidth={1.6} className="mt-0.5 shrink-0 text-unvisited/80" />
                <span>
                  Then add Haunt to your Home Screen —{' '}
                  <span className="font-medium text-white/64">Share → Add to Home Screen</span>.
                  Safari forgets a website you haven't opened for a week; the Home
                  Screen copy it keeps signed in.
                </span>
              </div>
            )}

            {error && <p className="fade-in mt-4 text-center text-[12px] text-fof">{error}</p>}

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
              <span className="text-[13px] text-white/72">
                I've written it down somewhere safe
              </span>
            </button>

            <div className="onboarding-actions">
              <PrimaryButton disabled={!confirmed || !code} onClick={onDone}>
                {replacing ? 'done' : 'open the map'}
              </PrimaryButton>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
