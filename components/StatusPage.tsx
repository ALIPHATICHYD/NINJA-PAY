import Link from 'next/link'
import Image from 'next/image'
import { Dither } from '@/components/Dither'

/** A full-page message in the brand's look, for not-found and error pages. */
export function StatusPage({
  code,
  title,
  children,
  action,
}: {
  code: string
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-page px-4 py-12 text-ink sm:px-6">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <Link href="/" aria-label="NinjaPay home" className="inline-flex items-center gap-2.5 self-start">
            <Image src="/brand/ninja-mark.svg" alt="" width={30} height={30} />
            <span className="text-lg font-semibold">NinjaPay</span>
          </Link>
          <p className="kicker mt-4">[{code}]</p>
          <h1 className="text-4xl font-medium leading-[1.05] tracking-[-0.035em] text-balance md:text-5xl">{title}</h1>
          <div className="max-w-[52ch] text-base leading-relaxed text-ink-2">{children}</div>
          <div className="flex flex-wrap gap-3">
            {action}
            <Link href="/" className="btn-secondary">Go to the home page</Link>
          </div>
        </div>
        <div className="mx-auto aspect-square w-full max-w-[340px] border border-line bg-page-2">
          <Dither field="wave" image="/brand/ninja-hero.svg" width={150} height={150} fieldDensity={0.4} imageScale={0.7} imageGain={0.82} />
        </div>
      </div>
    </main>
  )
}
