'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () =>
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }, () => {})
  return (
    <button onClick={copy} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
      {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> {label}</>}
    </button>
  )
}
