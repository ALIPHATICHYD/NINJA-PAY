'use client'

import { useState, useEffect, useRef } from 'react'
import { useWallet } from '@/hooks/useWallet'

interface WalletOption {
  id: 'keplr' | 'leap' | 'metamask'
  name: string
  description: string
}

const WALLET_OPTIONS: WalletOption[] = [
  {
    id: 'keplr',
    name: 'Keplr',
    description: 'Cosmos ecosystem wallet',
  },
  {
    id: 'leap',
    name: 'Leap',
    description: 'Multi-chain Cosmos wallet',
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    description: 'EVM-compatible wallet',
  },
]

export function WalletButton() {
  const { address, isConnected, loading, connect, disconnect } = useWallet()
  const [showModal, setShowModal] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  const handleConnect = async (walletId: 'keplr' | 'leap' | 'metamask') => {
    setShowModal(false)
    await connect(walletId)
  }

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`

  if (isConnected && address) {
    return (
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMenu(!showMenu)}
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
            ;(e.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--text-muted)'
          }}
          onMouseLeave={e => {
            ;(e.currentTarget as HTMLButtonElement).style.borderColor =
              'var(--border-light)'
          }}
        >
          <span
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: 'var(--success)',
              flexShrink: 0,
            }}
          />
          {formatAddress(address)}
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            style={{ color: 'var(--text-muted)', marginLeft: '2px' }}
          >
            <path
              d="M2 4L6 8L10 4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {showMenu && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 8px)',
              width: '180px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              overflow: 'hidden',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              zIndex: 50,
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <p
                style={{
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  marginBottom: '2px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Connected
              </p>
              <p
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                }}
              >
                {formatAddress(address)}
              </p>
            </div>
            <button
              onClick={async () => {
                setShowMenu(false)
                await disconnect()
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'transparent',
                border: 'none',
                color: 'var(--error)',
                fontSize: '14px',
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  'var(--bg-hover)')
              }
              onMouseLeave={e =>
                ((e.currentTarget as HTMLButtonElement).style.background =
                  'transparent')
              }
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="btn-primary"
        style={{ minWidth: '140px' }}
      >
        {loading ? (
          <>
            <span className="spinner" />
            Connecting
          </>
        ) : (
          'Connect Wallet'
        )}
      </button>

      {showModal && (
        <div
          className="modal-overlay"
          onClick={e => {
            if (e.target === e.currentTarget) setShowModal(false)
          }}
        >
          <div className="modal-box">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <div>
                <h2
                  style={{
                    fontSize: '18px',
                    fontWeight: '600',
                    color: 'var(--text-primary)',
                    marginBottom: '4px',
                  }}
                >
                  Connect Wallet
                </h2>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  Choose a wallet to get started
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'var(--bg-hover)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  fontSize: '16px',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {WALLET_OPTIONS.map(wallet => (
                <button
                  key={wallet.id}
                  onClick={() => handleConnect(wallet.id)}
                  disabled={loading}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    width: '100%',
                    padding: '14px 16px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '10px',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    transition: 'border-color 0.15s, background 0.15s',
                    opacity: loading ? 0.6 : 1,
                    textAlign: 'left',
                  }}
                  onMouseEnter={e => {
                    if (!loading) {
                      const el = e.currentTarget as HTMLButtonElement
                      el.style.borderColor = 'var(--accent)'
                      el.style.background = 'var(--bg-hover)'
                    }
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLButtonElement
                    el.style.borderColor = 'var(--border)'
                    el.style.background = 'var(--bg-secondary)'
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '8px',
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border-light)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      color: 'var(--text-secondary)',
                      fontWeight: '700',
                      fontSize: '13px',
                    }}
                  >
                    {wallet.name.slice(0, 2)}
                  </div>
                  <div>
                    <p
                      style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: 'var(--text-primary)',
                        marginBottom: '2px',
                      }}
                    >
                      {wallet.name}
                    </p>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {wallet.description}
                    </p>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    style={{
                      marginLeft: 'auto',
                      color: 'var(--text-muted)',
                      flexShrink: 0,
                    }}
                  >
                    <path
                      d="M6 3L11 8L6 13"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
              ))}
            </div>

            <p
              style={{
                marginTop: '16px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              By connecting, you agree to our Terms of Service. NinjaPay never
              stores your private keys.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
