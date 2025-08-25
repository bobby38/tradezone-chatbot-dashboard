import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function GET(req: NextRequest) {
  try {
    // Get notifications with pagination
    const { searchParams } = new URL(req.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const { data: notifications, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') { // Ignore table not found for now
      throw error
    }

    // Mock notifications if table doesn't exist yet
    const mockNotifications = notifications || [
      {
        id: '1',
        type: 'form_submission',
        title: 'New Trade-in Form',
        message: 'John Doe submitted a trade-in request for iPhone 14 Pro',
        priority: 'high',
        read: false,
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 mins ago
        action_url: '/dashboard/submissions',
        data: { customerName: 'John Doe', deviceType: 'iPhone 14 Pro' }
      },
      {
        id: '2',
        type: 'chat_alert',
        title: 'High-Value Inquiry',
        message: 'Customer asking about iPhone 15 Pro Max purchase',
        priority: 'medium',
        read: false,
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
        action_url: '/dashboard/logs',
        data: { sessionId: 'Guest-123' }
      },
      {
        id: '3',
        type: 'email_extracted',
        title: 'New Email Extracted',
        message: 'Found contact email in recent chat: jane@example.com',
        priority: 'low',
        read: true,
        created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
        action_url: '/dashboard/emails',
        data: { email: 'jane@example.com' }
      },
      {
        id: '4',
        type: 'system_alert',
        title: 'Daily Report Ready',
        message: 'Your daily analytics report has been generated',
        priority: 'low',
        read: true,
        created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        action_url: '/dashboard/insights',
        data: {}
      }
    ]

    return NextResponse.json({
      success: true,
      notifications: mockNotifications,
      total: mockNotifications.length
    })

  } catch (error) {
    console.error('Notifications fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, title, message, priority = 'medium', data = {}, action_url } = body

    // Validate required fields
    if (!type || !title || !message) {
      return NextResponse.json({ 
        error: 'Missing required fields: type, title, message' 
      }, { status: 400 })
    }

    const notification = {
      id: crypto.randomUUID(),
      type,
      title,
      message,
      priority,
      read: false,
      created_at: new Date().toISOString(),
      action_url,
      data
    }

    // Try to insert into database
    try {
      const { data: insertedNotification, error } = await supabaseAdmin
        .from('notifications')
        .insert([notification])
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        notification: insertedNotification
      })
    } catch (dbError) {
      console.warn('Database insert failed, returning mock response:', dbError)
      
      // Return mock response if database isn't set up yet
      return NextResponse.json({
        success: true,
        notification,
        note: 'Notification created (database not configured)'
      })
    }

  } catch (error) {
    console.error('Create notification error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Mark all notifications as read
export async function PUT(req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .update({ read: true, updated_at: new Date().toISOString() })
      .eq('read', false)

    if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
      throw error
    }

    return NextResponse.json({
      success: true,
      message: 'All notifications marked as read'
    })

  } catch (error) {
    console.error('Mark all read error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}