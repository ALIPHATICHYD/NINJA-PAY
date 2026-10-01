/**
 * An activity statement as CSV, built in the browser from on-chain history.
 * Nothing is sent to a server: the file is made and saved on the device.
 */

import { ACTIVITY_LABELS, formatCoinAmount, type ActivityItem } from './injective/activity'
import { explorerTxUrl } from './injective/network'

const COLUMNS = ['Date (UTC)', 'Type', 'Direction', 'Counterparty', 'Amount', 'Token', 'Denom', 'Status', 'Claim pool', 'Transaction', 'Explorer']

/**
 * One CSV field. Quotes and doubles quotes where needed, and puts an apostrophe
 * before text a spreadsheet would run as a formula (=, +, -, @).
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** One row per coin moved, newest first, as the history lists them. */
export function activityCsv(items: ActivityItem[]): string {
  const rows = items.flatMap(item =>
    item.coins.map(coin => [
      item.timestamp.toISOString(),
      ACTIVITY_LABELS[item.type],
      item.direction === 'out' ? 'Sent' : 'Received',
      item.counterparty,
      formatCoinAmount(coin, coin.decimals),
      coin.verified ? coin.token : `${coin.token} (unverified)`,
      coin.denom,
      item.success ? 'Confirmed' : 'Failed',
      item.label ?? '',
      item.hash,
      explorerTxUrl(item.hash),
    ]),
  )
  return [COLUMNS, ...rows].map(row => row.map(csvField).join(',')).join('\r\n') + '\r\n'
}

/** Saves the statement as a file on this device. */
export function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
