import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface N8nChatRequest {
  user_id: string
  prompt: string
  response: string
  session_id?: string
  status?: 'success' | 'error' | 'pending'
  processing_time?: number
  metadata?: any
}

// POST - Simplified endpoint for n8n to send chat logs with automatic session management
export async function POST(request: NextRequest) {
  try {
    const {
      user_id,
      prompt,
      response,
      session_id,
      status = 'success',
      processing_time,
      metadata = {}
    }: N8nChatRequest = await request.json()

    // Validate required fields
    if (!user_id || !prompt || !response) {
      return NextResponse.json(
        { 
          error: 'Missing required fields',
          required: ['user_id', 'prompt', 'response'],
          received: { user_id: !!user_id, prompt: !!prompt, response: !!response }
        },
        { status: 400 }
      )
    }

    // Get client IP and user agent from headers
    const userIp = request.headers.get('x-forwarded-for') || 
                   request.headers.get('x-real-ip') || 
                   'unknown'
    const userAgent = request.headers.get('user-agent') || 'n8n-webhook'

    let finalSessionId = session_id

    // Auto-session management: Find or create session
    if (!finalSessionId) {
      // Look for recent active session (within last 30 minutes) for this user
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()
      
      const { data: recentSession } = await supabase
        .from('chat_sessions')
        .select('session_id')
        .eq('user_id', user_id)
        .eq('status', 'active')
        .gte('last_activity', thirtyMinutesAgo)
        .order('last_activity', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (recentSession) {
        finalSessionId = recentSession.session_id
        console.log(`Using existing session: ${finalSessionId} for user: ${user_id}`)
      } else {
        // Create new session
        finalSessionId = crypto.randomUUID()
        console.log(`Creating new session: ${finalSessionId} for user: ${user_id}`)
      }
    }

    // Generate session name from first prompt (truncated)
    const sessionName = prompt.length > 50 
      ? prompt.substring(0, 47) + '...'
      : prompt

    // Get next turn index for this session
    const { count: turnCount } = await supabase
      .from('chat_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', finalSessionId)

    const turnIndex = (turnCount || 0) + 1

    // Insert chat log with all session information
    const { data: chatLog, error: chatLogError } = await supabase
      .from('chat_logs')
      .insert({
        user_id,
        prompt,
        response,
        session_id: finalSessionId,
        session_name: sessionName,
        status,
        turn_index: turnIndex,
        processing_time,
        user_ip: userIp,
        user_agent: userAgent,
        source: 'n8n',
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (chatLogError) {
      console.error('Error inserting chat log:', chatLogError)
      throw chatLogError
    }

    // The trigger will automatically handle session creation/update
    // But let's also return session info for n8n
    const { data: sessionInfo } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('session_id', finalSessionId)
      .single()

    return NextResponse.json({
      success: true,
      message: 'Chat log saved successfully',
      data: {
        chat_log_id: chatLog.id,
        session_id: finalSessionId,
        turn_index: turnIndex,
        session_info: sessionInfo,
        auto_session: !session_id // Indicates if session was auto-created
      }
    })

  } catch (error) {
    console.error('N8n chat endpoint error:', error)
    
    return NextResponse.json(
      { 
        error: 'Failed to save chat log',
        details: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// GET - Health check and session info for n8n
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('user_id')
    const sessionId = searchParams.get('session_id')

    if (sessionId) {
      // Get specific session info
      const { data: session, error } = await supabase
        .from('session_summaries')
        .select('*')
        .eq('session_id', sessionId)
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        session
      })
    }

    if (userId) {
      // Get recent sessions for user
      const { data: sessions, error } = await supabase
        .from('session_summaries')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity', { ascending: false })
        .limit(10)

      if (error) throw error

      return NextResponse.json({
        success: true,
        sessions: sessions || []
      })
    }

    // Health check
    const { data: stats, error } = await supabase
      .from('chat_sessions')
      .select('status', { count: 'exact' })

    if (error) throw error

    return NextResponse.json({
      success: true,
      message: 'N8n chat endpoint is healthy',
      stats: {
        total_sessions: stats.length,
        timestamp: new Date().toISOString()
      },
      endpoints: {
        'POST /api/n8n-chat': 'Send chat logs with automatic session management',
        'GET /api/n8n-chat?user_id=USER_ID': 'Get recent sessions for user',
        'GET /api/n8n-chat?session_id=SESSION_ID': 'Get specific session info'
      }
    })

  } catch (error) {
    console.error('N8n chat GET error:', error)
    return NextResponse.json(
      { 
        error: 'Health check failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
