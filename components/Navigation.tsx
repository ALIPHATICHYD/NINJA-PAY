'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { User } from 'lucide-react'

const NAV_LINKS = [
  { label: 'Send',          href: '/send' },
  { label: 'Bills',         href: '/bills' },
  { label: 'Claims',        href: '/claims' },
  { label: 'Beneficiaries', href: '/beneficiaries' },
  { label: 'Payroll',       href: '/payroll' },
  { label: 'Transactions',  href: '/transactions' },
  { label: 'Analytics',     href: '/analytics' },
]

export function Navigation() {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  return (
    <nav
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(8, 10, 14, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        className="nav-shell"
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '0 24px',
          height: '62px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexShrink: 0,
            textDecoration: 'none',
          }}
        >
          <img
            src="/favicon.png"
            alt="NinjaPay"
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              objectFit: 'contain',
            }}
          />
          <span
            style={{
              fontWeight: '700',
              fontSize: '17px',
              color: 'var(--text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            NinjaPay
          </span>
        </Link>

        {/* Centered Nav Links — desktop */}
        <div
          className="nav-links"
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            gap: '2px',
            alignItems: 'center',
          }}
        >
          {NAV_LINKS.map(link => {
            const active = isActive(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                style={{
                  position: 'relative',
                  padding: '6px 11px',
                  borderRadius: '7px',
                  fontSize: '13.5px',
                  fontWeight: active ? '600' : '400',
                  color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'color 0.15s, background 0.15s',
                  textDecoration: 'none',
                  background: active ? 'rgba(91,88,240,0.12)' : 'transparent',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-primary)'
                    ;(e.currentTarget as HTMLAnchorElement).style.background = 'var(--bg-hover)'
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.color = 'var(--text-secondary)'
                    ;(e.currentTarget as HTMLAnchorElement).style.background = 'transparent'
                  }
                }}
              >
                {link.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: '-1px',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: '16px',
                      height: '2px',
                      background: 'var(--accent)',
                      borderRadius: '2px',
                    }}
                  />
                )}
              </Link>
            )
          })}
        </div>

        {/* Connect Wallet */}
        <div className="nav-wallet" style={{ flexShrink: 0 }}>
          <ConnectButton.Custom>
            {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
              const connected = mounted && account && chain
              if (!mounted) {
                return (
                  <button className="btn-primary" style={{ minWidth: '140px', opacity: 0 }} aria-hidden="true">
                    Connect Wallet
                  </button>
                )
              }
              if (!connected) {
                return (
                  <button onClick={openConnectModal} className="btn-primary" style={{ minWidth: '140px' }}>
                    Connect Wallet
                  </button>
                )
              }
              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} className="alert-error" style={{ border: 'none', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', fontWeight: '600' }}>
                    Wrong Network
                  </button>
                )
              }
              return (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={openAccountModal}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 14px',
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border-light)',
                      borderRadius: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-muted)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-light)'
                    }}
                  >
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                      <User size={13} strokeWidth={2.5} />
                    </div>
                    {account.displayName}
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-muted)', marginLeft: '2px' }}>
                      <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              )
            }}
          </ConnectButton.Custom>
        </div>

        {/* Mobile toggle */}
        <button
          aria-label="Toggle navigation"
          aria-expanded={menuOpen}
          className="nav-mobile-toggle"
          onClick={() => setMenuOpen(v => !v)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            padding: '8px',
            borderRadius: '8px',
            marginLeft: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>

        {/* Mobile nav panel */}
        {menuOpen && (
          <div
            className="mobile-nav-panel"
            role="menu"
            style={{
              position: 'absolute',
              top: '62px',
              left: 0,
              right: 0,
              background: 'rgba(8,10,14,0.96)',
              borderTop: '1px solid var(--border)',
              padding: '12px 16px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              zIndex: 60,
            }}
          >
            <div className="mobile-nav-wallet">
              <ConnectButton.Custom>
                {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
                  const connected = mounted && account && chain
                  if (!mounted) {
                    return (
                      <button className="btn-primary" style={{ width: '100%' }} aria-hidden="true">
                        Connect Wallet
                      </button>
                    )
                  }
                  if (!connected) {
                    return (
                      <button onClick={openConnectModal} className="btn-primary" style={{ width: '100%' }}>
                        Connect Wallet
                      </button>
                    )
                  }
                  if (chain.unsupported) {
                    return (
                      <button onClick={openChainModal} className="alert-error" style={{ width: '100%', border: 'none', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', fontWeight: '600' }}>
                        Wrong Network
                      </button>
                    )
                  }
                  return (
                    <button
                      onClick={openAccountModal}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '8px',
                        padding: '10px 14px',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        fontWeight: '500',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--bg-hover)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
                          <User size={13} strokeWidth={2.5} />
                        </span>
                        {account.displayName}
                      </span>
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: 'var(--text-muted)' }}>
                        <path d="M2 4L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )
                }}
              </ConnectButton.Custom>
            </div>
            {NAV_LINKS.map(link => (
              <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} style={{ padding: '10px 12px', borderRadius: '8px', color: 'var(--text-secondary)', textDecoration: 'none' }}>{link.label}</Link>
            ))}
          </div>
        )}
      </div>

    </nav>
  )
}
