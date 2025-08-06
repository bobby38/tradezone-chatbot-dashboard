import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const settingType = searchParams.get('type')
    const userId = searchParams.get('userId') || 'default'

    let query = supabase
      .from('settings')
      .select('*')
      .eq('user_id', userId)

    if (settingType) {
      query = query.eq('setting_type', settingType)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    // Transform data into a more usable format
    const settings: Record<string, any> = {}
    data?.forEach(setting => {
      if (!settings[setting.setting_type]) {
        settings[setting.setting_type] = {}
      }
      settings[setting.setting_type][setting.setting_key] = setting.setting_value
    })

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { settingType, settingKey, settingValue, userId = 'default' } = await request.json()

    if (!settingType || !settingKey || settingValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: settingType, settingKey, settingValue' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('settings')
      .upsert({
        user_id: userId,
        setting_type: settingType,
        setting_key: settingKey,
        setting_value: settingValue,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,setting_type,setting_key'
      })
      .select()

    if (error) {
      console.error('Error saving setting:', error)
      return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Settings POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { settings, userId = 'default' } = await request.json()

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings object' },
        { status: 400 }
      )
    }

    // Prepare batch upsert data
    const upsertData = []
    for (const [settingType, typeSettings] of Object.entries(settings)) {
      for (const [settingKey, settingValue] of Object.entries(typeSettings as Record<string, any>)) {
        upsertData.push({
          user_id: userId,
          setting_type: settingType,
          setting_key: settingKey,
          setting_value: settingValue,
          updated_at: new Date().toISOString()
        })
      }
    }

    const { data, error } = await supabase
      .from('settings')
      .upsert(upsertData, {
        onConflict: 'user_id,setting_type,setting_key'
      })
      .select()

    if (error) {
      console.error('Error batch saving settings:', error)
      return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
