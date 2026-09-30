/**
 * Slow text marquee under the hero. injective.com scrolls partner logos here; NinjaPay has no
 * partners, so it scrolls what it does. Never put partner, bank or exchange logos in it.
 * Pauses on hover and stops under reduced motion (styles in globals.css).
 */
export function Marquee({ items }: { items: string[] }) {
  return (
    <div className="marquee overflow-hidden border-y border-line">
      <p className="sr-only">{items.join(', ')}</p>
      <div className="marquee-track flex w-max" aria-hidden="true">
        {[0, 1].map(copy => (
          <ul key={copy} className="flex">
            {items.map(item => (
              <li
                key={item}
                className="flex items-center gap-6 whitespace-nowrap py-5 pl-6 font-display text-2xl text-ink-2 after:size-[7px] after:rotate-45 after:bg-ocean after:content-['']"
              >
                {item}
              </li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  )
}
