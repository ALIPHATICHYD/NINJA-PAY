'use client'

import { useQuery } from '@tanstack/react-query'
import { checkCosmosHealth, checkEvmHealth, fetchUpgradePlan, type RailHealth, type UpgradePlan } from '@/lib/injective/health'

export type ChainHealthState = {
  /** True while the first check runs. */
  checking: boolean
  /** Null until checked. */
  health: RailHealth | null
  upgrade: UpgradePlan | null
  /** Sends are allowed only once a check has passed. */
  canSend: boolean
}

/**
 * Health of the rail a page sends on: `evm` for INJ from EVM wallets,
 * `cosmos` for Keplr/Leap transfers, payroll and claim links. Re-checked
 * every 30 seconds.
 */
export function useChainHealth(rail: 'evm' | 'cosmos'): ChainHealthState {
  const health = useQuery({
    queryKey: ['chain-health', rail],
    queryFn: () => (rail === 'evm' ? checkEvmHealth() : checkCosmosHealth()),
    refetchInterval: 30_000,
  })
  const upgrade = useQuery({
    queryKey: ['upgrade-plan'],
    queryFn: fetchUpgradePlan,
    refetchInterval: 5 * 60_000,
  })
  return {
    checking: health.isLoading,
    health: health.data ?? null,
    upgrade: upgrade.data ?? null,
    canSend: health.data?.ok === true,
  }
}
