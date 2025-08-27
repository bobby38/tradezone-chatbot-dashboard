import { NextRequest, NextResponse } from 'next/server'
import { ServerSettingsManager } from '@/lib/server-settings'

// Simple settings with server-side cache for email service access

export async function GET(request: NextRequest) {
  try {
    // Return settings from server cache
    const settings = ServerSettingsManager.getAllSettings()
    return NextResponse.json({ 
      settings,
      message: "Using server-side settings cache"
    })
  } catch (error) {
    console.error('Settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { settingType, settingKey, settingValue } = await request.json()

    if (!settingType || !settingKey || settingValue === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: settingType, settingKey, settingValue' },
        { status: 400 }
      )
    }

    // Save to server cache
    ServerSettingsManager.setSettings(settingType, settingKey, settingValue)

    return NextResponse.json({ 
      success: true, 
      message: "Setting saved to server cache"
    })
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

    // Save all settings to server cache
    Object.entries(settings).forEach(([settingType, typeSettings]) => {
      Object.entries(typeSettings as Record<string, any>).forEach(([key, value]) => {
        ServerSettingsManager.setSettings(settingType, key, value)
      })
    })

    return NextResponse.json({ 
      success: true,
      message: "All settings saved to server cache"
    })
  } catch (error) {
    console.error('Settings PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}