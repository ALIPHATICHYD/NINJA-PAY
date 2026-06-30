import axios from 'axios'

interface ResolveAccountResponse {
  accountName: string
  bankCode: string
}

/**
 * Resolve Nigerian bank account name through the server-side Paystack route.
 * The selected bank name is sent to the backend, which maps it to the correct
 * Paystack bank code before calling the Paystack API with the secret key.
 */
export async function resolveAccountName(
  accountNumber: string,
  bankName: string
): Promise<{ accountName: string }> {
  try {
    if (!accountNumber || accountNumber.length !== 10) {
      throw new Error('Account number must be exactly 10 digits')
    }

    if (!bankName) {
      throw new Error('Bank name is required')
    }

    const response = await axios.post<ResolveAccountResponse>('/api/paystack/resolve-account', {
      accountNumber,
      bankName,
    })

    return {
      accountName: response.data.accountName,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve account name'
    throw new Error(message)
  }
}
