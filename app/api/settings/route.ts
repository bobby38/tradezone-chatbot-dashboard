import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseServiceKey
  })
}

const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

// Default organization ID - you can make this dynamic later
const DEFAULT_ORG_ID = '765e1172-b666-471f-9b42-f80c9b5006de'

export async function GET(request: NextRequest) {
  try {
    // Get settings from organization settings field instead of separate table
    const { data: org, error } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single()

    if (error) {
      console.error('Error fetching organization settings:', error)
      return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
    }

    const settings = org?.settings || {}
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

    // Get current settings
    const { data: org, error: fetchError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single()

    if (fetchError) {
      console.error('Error fetching organization:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    // Update the nested settings
    const currentSettings = org?.settings || {}
    if (!currentSettings[settingType]) {
      currentSettings[settingType] = {}
    }
    currentSettings[settingType][settingKey] = settingValue

    // Save back to organization
    const { data, error } = await supabase
      .from('organizations')
      .update({ settings: currentSettings })
      .eq('id', DEFAULT_ORG_ID)
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
    const { settings } = await request.json()

    if (!settings || typeof settings !== 'object') {
      return NextResponse.json(
        { error: 'Invalid settings object' },
        { status: 400 }
      )
    }

    // Get current settings
    const { data: org, error: fetchError } = await supabase
      .from('organizations')
      .select('settings')
      .eq('id', DEFAULT_ORG_ID)
      .single()

    if (fetchError) {
      console.error('Error fetching organization:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    // Merge with existing settings
    const currentSettings = org?.settings || {}
    const mergedSettings = { ...currentSettings, ...settings }

    // Save back to organization
    const { data, error } = await supabase
      .from('organizations')
      .update({ settings: mergedSettings })
      .eq('id', DEFAULT_ORG_ID)
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
