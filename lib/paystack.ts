import axios from 'axios'

const PAYSTACK_BASE_URL = 'https://api.paystack.co'
const PAYSTACK_KEY = process.env.NEXT_PUBLIC_PAYSTACK_KEY || ''

interface OnRampRequest {
  email: string
  amount: number // in Naira
  metadata: {
    userId: string
    walletAddress: string
  }
}

interface OffRampRequest {
  amount: string // in Wei
  bankCode: string
  accountNumber: string
  accountName: string
}

interface PaystackResponse {
  status: boolean
  message: string
  data?: any
}

/**
 * Initialize on-ramp payment via Paystack
 * Returns authorization URL for user to send money
 */
export async function initializeOnRamp(
  request: OnRampRequest
): Promise<{ authorizationUrl: string; reference: string }> {
  try {
    const response = await axios.post<PaystackResponse>(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email: request.email,
        amount: request.amount * 100, // Paystack expects amount in kobo
        metadata: request.metadata,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_KEY}`,
        },
      }
    )

    if (!response.data.status) {
      throw new Error(response.data.message)
    }

    return {
      authorizationUrl: response.data.data.authorization_url,
      reference: response.data.data.reference,
    }
  } catch (error) {
    console.error('Failed to initialize on-ramp:', error)
    throw error
  }
}

/**
 * Verify on-ramp payment status
 */
export async function verifyOnRampPayment(
  reference: string
): Promise<{ status: string; amount: number }> {
  try {
    const response = await axios.get<PaystackResponse>(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_KEY}`,
        },
      }
    )

    if (!response.data.status) {
      throw new Error('Payment verification failed')
    }

    return {
      status: response.data.data.status,
      amount: response.data.data.amount / 100, // Convert back to Naira
    }
  } catch (error) {
    console.error('Failed to verify on-ramp payment:', error)
    throw error
  }
}

/**
 * Initialize off-ramp payout via Paystack (requires business account)
 */
export async function initiateOffRampPayout(
  request: OffRampRequest
): Promise<{ transferCode: string }> {
  try {
    // First, create a transfer recipient
    const recipientResponse = await axios.post<PaystackResponse>(
      `${PAYSTACK_BASE_URL}/transferrecipient`,
      {
        type: 'nuban',
        name: request.accountName,
        account_number: request.accountNumber,
        bank_code: request.bankCode,
        currency: 'NGN',
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_KEY}`,
        },
      }
    )

    if (!recipientResponse.data.status) {
      throw new Error('Failed to create transfer recipient')
    }

    const recipientCode = recipientResponse.data.data.recipient_code

    // Then, initiate the transfer
    const transferResponse = await axios.post<PaystackResponse>(
      `${PAYSTACK_BASE_URL}/transfer`,
      {
        source: 'balance',
        reason: 'NinjaPay off-ramp',
        amount: parseInt(request.amount), // Amount in Naira
        recipient: recipientCode,
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_KEY}`,
        },
      }
    )

    if (!transferResponse.data.status) {
      throw new Error('Failed to initiate transfer')
    }

    return {
      transferCode: transferResponse.data.data.transfer_code,
    }
  } catch (error) {
    console.error('Failed to initiate off-ramp payout:', error)
    throw error
  }
}

/**
 * Mock Paystack flow for hackathon
 * In production, use the real functions above
 */
export async function mockOnRamp(
  email: string,
  amount: number,
  walletAddress: string
): Promise<{ success: boolean; reference: string }> {
  console.log(
    `[MOCK] On-ramp: ${amount} NGN to ${walletAddress} for ${email}`
  )
  // Simulate payment completion after 2 seconds
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        reference: `mock_ref_${Date.now()}`,
      })
    }, 2000)
  })
}

/**
 * Mock off-ramp flow for hackathon
 */
export async function mockOffRamp(
  amount: string,
  accountNumber: string
): Promise<{ success: boolean; transferCode: string }> {
  console.log(`[MOCK] Off-ramp: ${amount} to account ${accountNumber}`)
  // Simulate payout initiation
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        success: true,
        transferCode: `mock_transfer_${Date.now()}`,
      })
    }, 2000)
  })
}
