import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

interface ChatLogRequest {
  user_id: string
  prompt: string
  response: string
  session_id?: string
  session_name?: string
  status?: 'success' | 'error' | 'pending'
  processing_time?: number
  user_ip?: string
  user_agent?: string
  source?: string
}

interface SessionRequest {
  user_id: string
  session_name?: string
  user_ip?: string
  user_agent?: string
  source?: string
}

// GET - Retrieve sessions or session details
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get('session_id')
    const userId = searchParams.get('user_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const includeMessages = searchParams.get('include_messages') === 'true'

    if (sessionId) {
      // Get specific session with messages
      const { data: session, error: sessionError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('session_id', sessionId)
        .single()

      if (sessionError) throw sessionError

      if (includeMessages) {
        const { data: messages, error: messagesError } = await supabase
          .from('chat_logs')
          .select('*')
          .eq('session_id', sessionId)
          .order('turn_index', { ascending: true })

        if (messagesError) throw messagesError

        return NextResponse.json({
          session,
          messages: messages || []
        })
      }

      return NextResponse.json({ session })
    }

    // Get sessions list
    let query = supabase
      .from('session_summaries')
      .select('*')
      .order('last_activity', { ascending: false })
      .limit(limit)

    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data: sessions, error } = await query

    if (error) throw error

    return NextResponse.json({ sessions: sessions || [] })
  } catch (error) {
    console.error('Error fetching sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions' },
      { status: 500 }
    )
  }
}

// POST - Create new session or add message to existing session
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const action = body.action || 'add_message' // 'create_session' or 'add_message'

    if (action === 'create_session') {
      const { user_id, session_name, user_ip, user_agent, source = 'n8n' }: SessionRequest = body

      if (!user_id) {
        return NextResponse.json(
          { error: 'user_id is required' },
          { status: 400 }
        )
      }

      // Generate new session
      const sessionId = crypto.randomUUID()
      
      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          session_id: sessionId,
          user_id,
          session_name: session_name || `Chat Session ${new Date().toISOString().split('T')[0]}`,
          source,
          user_ip,
          user_agent,
          status: 'active'
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        session_id: sessionId,
        session
      })
    }

    if (action === 'add_message') {
      const {
        user_id,
        prompt,
        response,
        session_id,
        session_name,
        status = 'success',
        processing_time,
        user_ip,
        user_agent,
        source = 'n8n'
      }: ChatLogRequest = body

      if (!user_id || !prompt || !response) {
        return NextResponse.json(
          { error: 'user_id, prompt, and response are required' },
          { status: 400 }
        )
      }

      let finalSessionId = session_id

      // If no session_id provided, create a new session or find recent active session
      if (!finalSessionId) {
        // Look for recent active session (within last hour) for this user
        const { data: recentSession } = await supabase
          .from('chat_sessions')
          .select('session_id')
          .eq('user_id', user_id)
          .eq('status', 'active')
          .gte('last_activity', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Within 1 hour
          .order('last_activity', { ascending: false })
          .limit(1)
          .single()

        if (recentSession) {
          finalSessionId = recentSession.session_id
        } else {
          // Create new session
          finalSessionId = crypto.randomUUID()
        }
      }

      // Get next turn index for this session
      const { count: turnCount } = await supabase
        .from('chat_logs')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', finalSessionId)

      const turnIndex = (turnCount || 0) + 1

      // Insert chat log
      const { data: chatLog, error } = await supabase
        .from('chat_logs')
        .insert({
          user_id,
          prompt,
          response,
          session_id: finalSessionId,
          session_name: session_name || `Chat ${new Date().toISOString().split('T')[0]}`,
          status,
          turn_index: turnIndex,
          processing_time,
          user_ip,
          user_agent,
          source,
          timestamp: new Date().toISOString(),
          created_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({
        success: true,
        session_id: finalSessionId,
        turn_index: turnIndex,
        chat_log: chatLog
      })
    }

    return NextResponse.json(
      { error: 'Invalid action. Use "create_session" or "add_message"' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error handling session request:', error)
    return NextResponse.json(
      { error: 'Failed to process session request' },
      { status: 500 }
    )
  }
}

// PUT - Update session (end session, update metadata, etc.)
export async function PUT(request: NextRequest) {
  try {
    const { session_id, status, metadata, session_name } = await request.json()

    if (!session_id) {
      return NextResponse.json(
        { error: 'session_id is required' },
        { status: 400 }
      )
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (status) updateData.status = status
    if (metadata) updateData.metadata = metadata
    if (session_name) updateData.session_name = session_name

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('session_id', session_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      session
    })
  } catch (error) {
    console.error('Error updating session:', error)
    return NextResponse.json(
      { error: 'Failed to update session' },
      { status: 500 }
    )
  }
}
