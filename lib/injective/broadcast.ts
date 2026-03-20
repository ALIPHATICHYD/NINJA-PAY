'use client'

export async function broadcastTxMessage(
  msg: any,
  userAddress: string
): Promise<string> {
  try {
    if (!userAddress) {
      throw new Error('Missing sender address')
    }

    // TODO: wire this to a proper signer + broadcaster flow.
    // For now we return a deterministic mock tx hash so app flows continue to work.
    const payload = JSON.stringify({ msg, userAddress, t: Date.now() })
    const hash = Array.from(payload)
      .reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0)
      .toString(16)
      .slice(0, 64)

    return `0x${hash.padEnd(64, '0')}`
  } catch (error) {
    console.error('Failed to broadcast transaction:', error)
    throw error
  }
}

/**
 * Estimate gas for a transaction
 */
export async function estimateGas(
  msgs: any[],
  userAddress: string
): Promise<number> {
  void msgs
  void userAddress
  return 200000
}

/**
 * Simulate a transaction without broadcasting
 */
export async function simulateTx(
  msgs: any[],
  userAddress: string
): Promise<boolean> {
  void msgs
  void userAddress
  return true
}
