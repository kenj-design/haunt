import PhoneFrame from './PhoneFrame'
import { PrimaryButton } from './ui'

/**
 * What the app shows before there is anything to show.
 *
 * `AppProvider` renders this in place of the app until the first snapshot
 * arrives, so no screen ever has to cope with half-loaded data. It carries the
 * same phone frame as the app shell, so nothing jumps when it swaps out.
 *
 * With the mock backend answering instantly this is usually invisible. Set
 * `VITE_MOCK_LATENCY_MS` and `VITE_MOCK_FAILURE_RATE` to see both states.
 */
export default function BootScreen({
  status,
  error,
  onRetry,
}: {
  status: 'loading' | 'error'
  error: string | null
  onRetry: () => void
}) {
  const failed = status === 'error'

  return (
    <PhoneFrame>
      <div className="flex flex-1 flex-col items-center justify-center px-10 text-center">
        <div
          className={`flex h-16 w-16 items-center justify-center rounded-full border border-white/[0.13] bg-white/[0.05] shadow-[inset_0_1px_0_rgba(255,255,255,.09)] backdrop-blur-xl ${
            failed ? '' : 'zone-breathe'
          }`}
          aria-hidden="true"
        >
          <span className="h-5 w-5 rounded-full bg-white/22" />
        </div>

        {failed ? (
          <>
            <h1 className="mt-8 text-[22px] font-semibold tracking-[-0.035em] text-ink">
              the map stayed dark
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{error}</p>
            <div className="mt-9 w-full">
              <PrimaryButton onClick={onRetry}>try again</PrimaryButton>
            </div>
          </>
        ) : (
          <p className="mt-8 text-[13px] text-ink-3" role="status">
            finding your places…
          </p>
        )}
      </div>
    </PhoneFrame>
  )
}
