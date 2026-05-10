'use client'

import { ChevronDown } from 'lucide-react'
import { Container } from './Container'
import { SectionHeader } from './SectionHeader'

const FAQS = [
  {
    q: 'What networks does NinjaPay support?',
    a: "NinjaPay runs natively on Injective. Wallet connect supports Keplr and Leap (Cosmos) as well as MetaMask (EVM-compatible via Injective's EVM layer).",
  },
  {
    q: 'Is NinjaPay non-custodial?',
    a: 'Yes. Your wallet keys never leave your device. All on-chain transactions are signed by your wallet and broadcast to Injective directly.',
  },
  {
    q: 'How does off-ramping work?',
    a: "You send INJ or USDC to NinjaPay's escrow, which triggers an Onboard API disbursement to your Nigerian bank account at the current market rate. The process takes < 60 seconds.",
  },
  {
    q: 'What are the fees?',
    a: 'Injective charges minimal network fees (~$0.002). NinjaPay adds a 0.5% service fee on off-ramp conversions. All fees are shown before you confirm.',
  },
  {
    q: 'Can I pay Nigerian utility bills with crypto?',
    a: 'Yes — Airtime, Data, Electricity, and Cable TV are all supported via our VTpass integration. Pay in USDC and the equivalent NGN is disbursed to your provider instantly.',
  },
]

interface FAQProps {
  openFaq: number | null
  onToggle: (idx: number) => void
}

export function FAQ({ openFaq, onToggle }: FAQProps) {
  return (
    <section style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
      <Container style={{ maxWidth: '720px', padding: '88px 24px' }}>
        <SectionHeader title="Frequently asked questions" />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {FAQS.map((faq, idx) => (
            <div
              key={idx}
              className={`reveal delay-${(idx % 4) + 1}`}
              style={{
                borderRadius: '11px',
                border: '1px solid',
                borderColor: openFaq === idx ? 'var(--border-light)' : 'var(--border)',
                background: openFaq === idx ? 'var(--bg-card)' : 'transparent',
                overflow: 'hidden',
                transition: 'all 0.2s',
              }}
            >
              <button
                onClick={() => onToggle(idx)}
                style={{
                  width: '100%',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '18px 20px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: '16px',
                }}
              >
                <span
                  style={{
                    fontSize: '15px',
                    fontWeight: '500',
                    color: 'var(--text-primary)',
                  }}
                >
                  {faq.q}
                </span>
                <ChevronDown
                  size={16}
                  style={{
                    color: 'var(--text-muted)',
                    flexShrink: 0,
                    transform: openFaq === idx ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s',
                  }}
                />
              </button>
              {openFaq === idx && (
                <div
                  style={{
                    padding: '0 20px 18px',
                    paddingTop: '4px',
                    fontSize: '14px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.75',
                    borderTop: '1px solid var(--border)',
                    paddingBlock: '16px 18px',
                  }}
                >
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}
