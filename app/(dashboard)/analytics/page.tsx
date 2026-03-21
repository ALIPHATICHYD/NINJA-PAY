'use client'

import { useState, useEffect } from 'react'
import { useWallet } from '@/hooks/useWallet'
import { useTokenPrice } from '@/hooks/useTokenPrice'
import { useUSDCConversion } from '@/hooks/useUSDCConversion'
import { getTransactionHistory } from '@/lib/supabase'
import { TrendingUp, TrendingDown, RefreshCcw } from 'lucide-react'
import { formatEther } from 'viem'
import { format, subDays, isAfter } from 'date-fns'

type Period = '7D' | '30D' | '90D'

export default function AnalyticsPage() {
  const { address, isConnected } = useWallet()
  const { injUsd } = useTokenPrice()
  const { injUsdcRate, usdcPrice } = useUSDCConversion(1)
  const [period, setPeriod] = useState<Period>('30D')
  
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  useEffect(() => {
    let mounted = true
    async function fetchTx() {
      if (!address) return
      setLoading(true)
      const data = await getTransactionHistory(address, 500) // fetch up to 500
      if (mounted) {
        setTransactions(data)
        setLoading(false)
      }
    }
    fetchTx()
    return () => { mounted = false }
  }, [address])

  if (!isConnected) {
    return (
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div className="alert-warning">Connect your wallet to view analytics.</div>
      </div>
    )
  }

  // Filter transactions by period
  const cutoffDays = period === '7D' ? 7 : period === '30D' ? 30 : 90
  const cutoffDate = subDays(new Date(), cutoffDays)
  
  const periodTxs = transactions.filter(tx => 
    tx.status !== 'failed' && isAfter(new Date(tx.created_at), cutoffDate)
  )

  // Calculate stats
  let totalWei = BigInt(0)
  const uniqueRecipients = new Set<string>()
  const breakdown: Record<string, number> = { send: 0, bills: 0, payroll: 0, claim: 0 }

  periodTxs.forEach(tx => {
    try {
      totalWei += BigInt(tx.amount || '0')
    } catch(e) {}
    if (tx.recipient) uniqueRecipients.add(tx.recipient)
    breakdown[tx.type] = (breakdown[tx.type] || 0) + 1
  })

  // Convert to USD values using injUsd
  const totalVolumeUSD = parseFloat(formatEther(totalWei)) * (injUsd || 0)
  const avgTxUSD = periodTxs.length > 0 ? totalVolumeUSD / periodTxs.length : 0

  // Build chart bars
  const groupingFormat = period === '7D' ? 'EEE' : period === '30D' ? 'w' : 'MMM'
  const chartDataMap: Record<string, number> = {}

  periodTxs.forEach(tx => {
    const key = period === '30D' 
      ? `W${format(new Date(tx.created_at), 'w')}` // Week number
      : format(new Date(tx.created_at), groupingFormat)
    
    let usd = 0
    try { usd = parseFloat(formatEther(BigInt(tx.amount || '0'))) * (injUsd || 0) } catch(e) {}
    chartDataMap[key] = (chartDataMap[key] || 0) + usd
  })

  // Format bars based on the period (this is simplified to just show available data)
  const bars = Object.keys(chartDataMap).map(k => ({ month: k, value: chartDataMap[k] }))
  // If no data, provide an empty structure
  if (bars.length === 0) {
    bars.push({ month: 'None', value: 0 })
  }

  const maxVal = Math.max(...bars.map(b => b.value))

  // Breakdown percentages
  const txCount = periodTxs.length || 1
  const bData = [
    { type: 'Send',    count: breakdown.send || 0,    pct: Math.round(((breakdown.send || 0)/txCount)*100),    color: 'var(--accent)' },
    { type: 'Bills',   count: breakdown.bills || 0,   pct: Math.round(((breakdown.bills || 0)/txCount)*100),   color: 'var(--warning)' },
    { type: 'Payroll', count: breakdown.payroll || 0, pct: Math.round(((breakdown.payroll || 0)/txCount)*100), color: '#a78bfa' },
    { type: 'Claims',  count: breakdown.claim || 0,   pct: Math.round(((breakdown.claim || 0)/txCount)*100),   color: 'var(--inj-color)' },
  ].filter(b => b.count > 0).sort((a,b) => b.count - a.count)

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>Analytics</h1>
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Overview of your on-chain activity.</p>
        </div>
        <div className="seg-control" style={{ width: 'fit-content' }}>
          {(['7D', '30D', '90D'] as Period[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={`seg-btn${period === p ? ' active' : ''}`}>{p}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <RefreshCcw size={24} className="spinner" style={{ color: 'var(--accent)', margin: '0 auto' }} />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            {[
              { label: 'Total Volume',     value: `$${totalVolumeUSD.toFixed(2)}`, trend: '', up: true },
              { label: 'Transactions',     value: `${periodTxs.length}`,          trend: '', up: true },
              { label: 'Avg Transaction',  value: `$${avgTxUSD.toFixed(2)}`,       trend: '', up: true },
              { label: 'Beneficiaries',    value: `${uniqueRecipients.size}`,      trend: '', up: true },
            ].map(stat => (
              <div key={stat.label} className="card-sm">
                <p style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                  {stat.label}
                </p>
                <p style={{ fontSize: '20px', fontWeight: '800', color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Bar chart */}
          <div className="card" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)' }}>Volume (USD)</h3>
              <span className="badge badge-accent">{period}</span>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '6px', height: '160px', padding: '0 4px' }}>
              {bars.map((b, i) => {
                const hovered = hoveredBar === i
                const height = maxVal === 0 ? 0 : Math.max((b.value / maxVal) * 140, 4)
                return (
                  <div
                    key={i}
                    style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                  >
                    {/* Tooltip */}
                    <div
                      style={{
                        fontSize: '11px', fontWeight: '700', color: 'var(--text-primary)',
                        background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                        borderRadius: '5px', padding: '2px 7px',
                        opacity: hovered ? 1 : 0, transition: 'opacity 0.15s',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ${b.value.toFixed(2)}
                    </div>
                    {/* Bar */}
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '130px' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${height}px`,
                          background: hovered ? 'var(--accent-gradient)' : 'var(--accent-subtle)',
                          border: `1px solid ${hovered ? 'transparent' : 'rgba(91,88,240,0.25)'}`,
                          borderRadius: '5px 5px 0 0',
                          transition: 'all 0.2s',
                          position: 'relative',
                          overflow: 'hidden',
                        }}
                      />
                    </div>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontWeight: '500' }}>{b.month}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Breakdown */}
          <div className="card">
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '20px' }}>Transaction Breakdown</h3>
            {bData.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No transactions in this period.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {bData.map(row => (
                  <div key={row.type}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '7px', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: row.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: '600' }}>{row.type}</span>
                      </div>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{row.count} txns · {row.pct}%</span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${row.pct}%`, background: row.color, opacity: 0.8 }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
