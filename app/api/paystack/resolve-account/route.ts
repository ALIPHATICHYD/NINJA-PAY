import { NextRequest, NextResponse } from 'next/server'
import { resolvePaystackAccountName } from '@/lib/paystack.server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const accountNumber = String(body.accountNumber || '').trim()
    const bankName = String(body.bankName || '').trim()

    const result = await resolvePaystackAccountName(accountNumber, bankName)

    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve account name'
    const status =
      message.includes('Bank not supported') ||
      message.includes('Account number') ||
      message.includes('secret key')
        ? 400
        : 500

    return NextResponse.json({ error: message }, { status })
  }
}
