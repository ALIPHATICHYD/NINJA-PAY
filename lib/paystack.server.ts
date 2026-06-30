import axios from 'axios'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || process.env.NEXT_PUBLIC_PAYSTACK_KEY || ''

export const PAYSTACK_BANK_CODES: Record<string, string> = {
  'Access Bank': '044',
  Ecobank: '050',
  'Fidelity Bank': '070',
  'First Bank': '011',
  GTBank: '058',
  'Kuda Bank': '50211',
  Moniepoint: '50515',
  OPay: '999992',
  Palmpay: '999991',
  'Stanbic IBTC': '221',
  'Sterling Bank': '232',
  UBA: '033',
  'Wema Bank': '035',
  'Zenith Bank': '057',
}

interface ResolveAccountResponse {
  status: boolean
  message: string
  data?: {
    account_name: string
    account_number: string
    bank_id: number
  }
}

export async function resolvePaystackAccountName(accountNumber: string, bankName: string): Promise<{ accountName: string; bankCode: string }> {
  if (!accountNumber || accountNumber.length !== 10) {
    throw new Error('Account number must be exactly 10 digits')
  }

  const bankCode = PAYSTACK_BANK_CODES[bankName]
  if (!bankCode) {
    throw new Error('Bank not supported or not found')
  }

  if (!PAYSTACK_SECRET_KEY) {
    throw new Error('Paystack secret key not configured on the server')
  }

  const response = await axios.get<ResolveAccountResponse>(
    `${PAYSTACK_BASE_URL}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
    {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    },
  )

  if (!response.data.status) {
    throw new Error(response.data.message || 'Account resolution failed')
  }

  return {
    accountName: response.data.data?.account_name || '',
    bankCode,
  }
}
