/**
 * Four-stage progress pips, from an earlier multi-step Drop a Haunt.
 * Not wired up — that flow is one page now. See README.md in this folder.
 */
const STAGE_NAMES = ['tone', 'write', 'place', 'seal'] as const

export default function HauntStepCounter({
  step,
}: {
  step: number
  direction?: 'forward' | 'back' | 'none'
}) {
  const stage = STAGE_NAMES[step - 1] ?? STAGE_NAMES[0]

  return (
    <div
      className="flex items-center gap-2.5 rounded-full border border-white/[0.12] bg-white/[0.06] px-3.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_8px_20px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      role="progressbar"
      aria-label={`Step ${step} of ${STAGE_NAMES.length}: ${stage}`}
      aria-valuemin={1}
      aria-valuemax={STAGE_NAMES.length}
      aria-valuenow={step}
    >
      <div className="flex items-center gap-1" aria-hidden="true">
        {STAGE_NAMES.map((_, index) => {
          const isActive = index + 1 === step
          const isDone = index + 1 < step
          return (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                isActive
                  ? 'w-3.5 bg-white shadow-[0_0_8px_rgba(255,255,255,0.75)]'
                  : isDone
                    ? 'w-1.5 bg-white/45'
                    : 'w-1.5 bg-white/15'
              }`}
            />
          )
        })}
      </div>

      <div className="flex items-center gap-1.5 text-[11px]">
        <span className="font-medium tracking-tight text-white/75">{stage}</span>
        <span className="font-mono text-[10px] text-white/40">
          {step}/{STAGE_NAMES.length}
        </span>
      </div>
    </div>
  )
}
