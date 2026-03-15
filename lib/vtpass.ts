import axios from 'axios'

const VTPASS_BASE_URL = 'https://api-service.vtpass.com/api'
const VTPASS_USERNAME = process.env.NEXT_PUBLIC_VTPASS_USERNAME || 'demo'
const VTPASS_PASSWORD = process.env.NEXT_PUBLIC_VTPASS_PASSWORD || 'demo'

// Bill service IDs
export const BILL_SERVICES = {
  AIRTIME: {
    mtn: 'mtn-ng',
    glo: 'glo-ng',
    airtel: 'airtel-ng',
    _9mobile: '9mobile-ng',
  },
  DATA: {
    mtn: 'mtn-data-ng',
    glo: 'glo-data-ng',
    airtel: 'airtel-data-ng',
    _9mobile: '9mobile-data-ng',
  },
  ELECTRICITY: {
    ekedc: 'ekedc-ng',
    ikedc: 'ikedc-ng',
    phcn: 'phcn-ng',
    bedc: 'bedc-ng',
  },
  CABLE: {
    dstv: 'dstv-ng',
    gotv: 'gotv-ng',
    startimes: 'startimes-ng',
  },
}

interface BillRequest {
  serviceId: string
  billId: string // Phone number, meter ID, or account number
  amount: number // in Naira
}

interface BillResponse {
  code: string
  status: boolean
  message: string
  data?: any
}

/**
 * Get available variations for a bill service
 */
export async function getBillVariations(
  serviceId: string
): Promise<{ id: string; name: string; amount?: number }[]> {
  try {
    const response = await axios.get<BillResponse>(
      `${VTPASS_BASE_URL}/service-variations`,
      {
        params: {
          service_id: serviceId,
        },
        auth: {
          username: VTPASS_USERNAME,
          password: VTPASS_PASSWORD,
        },
      }
    )

    if (!response.data.status) {
      throw new Error(response.data.message)
    }

    return response.data.data
      ? Object.values(response.data.data).map((v: any) => ({
          id: v.variation_code,
          name: v.name,
          amount: v.variation_amount,
        }))
      : []
  } catch (error) {
    console.error('Failed to get bill variations:', error)
    return []
  }
}

/**
 * Purchase a bill using VTPass API
 */
export async function purchaseBill(
  request: BillRequest
): Promise<{ status: string; transactionId: string }> {
  try {
    const response = await axios.post<BillResponse>(
      `${VTPASS_BASE_URL}/pay`,
      {
        service_id: request.serviceId,
        billtype_id: request.billId,
        amount: request.amount,
        phone: request.billId, // For airtime/data
        meter_number: request.billId, // For electricity
        smartcard_number: request.billId, // For cable
      },
      {
        auth: {
          username: VTPASS_USERNAME,
          password: VTPASS_PASSWORD,
        },
      }
    )

    if (!response.data.status) {
      throw new Error(response.data.message)
    }

    return {
      status: 'success',
      transactionId: response.data.data?.unique_element || '',
    }
  } catch (error) {
    console.error('Failed to purchase bill:', error)
    throw error
  }
}

/**
 * Check bill payment status
 */
export async function checkBillStatus(
  transactionId: string
): Promise<{ status: string; message: string }> {
  try {
    const response = await axios.get<BillResponse>(
      `${VTPASS_BASE_URL}/transaction/query`,
      {
        params: {
          request_id: transactionId,
        },
        auth: {
          username: VTPASS_USERNAME,
          password: VTPASS_PASSWORD,
        },
      }
    )

    if (!response.data.status) {
      return {
        status: 'failed',
        message: response.data.message,
      }
    }

    return {
      status: response.data.data?.status || 'pending',
      message: response.data.message,
    }
  } catch (error) {
    console.error('Failed to check bill status:', error)
    throw error
  }
}

/**
 * Mock bill purchase for hackathon
 */
export async function mockPurchaseBill(
  serviceId: string,
  billId: string,
  amount: number
): Promise<{ status: string; transactionId: string }> {
  console.log(
    `[MOCK] Bill purchase: ${serviceId} for ${billId}, amount: ${amount} NGN`
  )
  // Simulate bill purchase
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        status: 'success',
        transactionId: `mock_bill_${Date.now()}`,
      })
    }, 1500)
  })
}
