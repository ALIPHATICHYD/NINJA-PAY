/**
 * Supabase Connection Test Utility
 * Run these tests in browser console or as API route
 */

import { createClient } from '@supabase/supabase-js'

export async function testSupabaseConnection() {
  console.log('🧪 Testing Supabase Connection...\n')

  try {
    // 1. Check if credentials are set
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    console.log('📋 Environment Variables:')
    console.log(`   URL: ${url ? '✅ Set' : '❌ NOT SET'}`)
    console.log(`   ANON Key: ${key ? '✅ Set' : '❌ NOT SET'}\n`)

    if (!url || !key) {
      return {
        success: false,
        error: 'Missing Supabase credentials in .env.local',
        details: {
          urlSet: !!url,
          keySet: !!key,
        },
      }
    }

    // 2. Create client
    console.log('🔗 Creating Supabase client...')
    const supabase = createClient(url, key)
    console.log('   ✅ Client created\n')

    // 3. Test basic connection (auth endpoint)
    console.log('🌐 Testing API connection...')
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      console.log(`   ❌ Session error: ${sessionError.message}`)
      throw sessionError
    }
    console.log('   ✅ API connection successful\n')

    // 4. Try to query (even empty table is fine)
    console.log('📊 Testing database query...')
    const { data, error, count } = await supabase
      .from('claim_pools')
      .select('*', { count: 'exact', head: true })
      .limit(1)

    if (error) {
      // If table doesn't exist, that's okay - we're just testing connection
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('   ⚠️  Table might not exist yet, but connection works')
      } else {
        throw error
      }
    } else {
      console.log(`   ✅ Database query successful (${count} rows in claim_pools)\n`)
    }

    // 5. All tests passed
    console.log('✨ All Tests Passed! Supabase is working correctly.\n')
    
    return {
      success: true,
      message: 'Supabase connection verified',
      details: {
        url: url.substring(0, 20) + '...',
        sessionAvailable: !!sessionData?.session,
        databaseAccessible: !error || error.message.includes('relation'),
      },
    }
  } catch (error: any) {
    console.error('❌ Test Failed:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}

export async function testSupabaseWrite() {
  console.log('🧪 Testing Supabase Write Operation...\n')

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Missing Supabase credentials')
    }

    const supabase = createClient(url, key)

    // Try to insert a test record
    console.log('📝 Attempting to write test data...')
    const { data, error } = await supabase
      .from('claim_pools')
      .insert([
        {
          creator_address: 'test_address_' + Date.now(),
          total_amount: '1000',
          claim_type: 'test',
        },
      ])
      .select()

    if (error) {
      console.error('   ❌ Write failed:', error.message)
      return {
        success: false,
        error: error.message,
      }
    }

    console.log('   ✅ Write successful!')
    console.log('   Data:', data)

    return {
      success: true,
      message: 'Write test passed',
      data,
    }
  } catch (error: any) {
    console.error('❌ Write test failed:', error.message)
    return {
      success: false,
      error: error.message,
    }
  }
}
