'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { WalletButton } from './WalletButton'

export function Navigation() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/dashboard" className="text-2xl font-bold text-blue-600">
              💎 NinjaPay
            </Link>

            <div className="hidden md:flex space-x-1">
              <Link
                href="/dashboard"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard')
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Dashboard
              </Link>
              <Link
                href="/dashboard/send"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard/send')
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Send
              </Link>
              <Link
                href="/dashboard/bills"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard/bills')
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Bills
              </Link>
              <Link
                href="/dashboard/claims"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard/claims')
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Claims
              </Link>
              <Link
                href="/dashboard/payroll"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                  isActive('/dashboard/payroll')
                    ? 'bg-blue-100 text-blue-600'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Payroll
              </Link>
            </div>
          </div>

          <WalletButton />
        </div>
      </div>
    </nav>
  )
}
