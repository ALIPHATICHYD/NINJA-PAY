// Shown inside the app's frame while a page's code loads.
export default function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span className="sr-only">Loading</span>
      {[40, 100, 100].map((height, i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{ height, width: i === 0 ? '40%' : '100%', borderRadius: 0, background: 'var(--bg-card)' }}
        />
      ))}
    </div>
  )
}
