import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyApiKey, authErrorResponse, isAuthRequired } from '@/lib/security/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Save voice chat logs to Supabase
 * Called by Python LiveKit agent
 */
export async function POST(req: NextRequest) {
  // Authentication
  if (isAuthRequired()) {
    const authResult = verifyApiKey(req);
    if (!authResult.authenticated) {
      return authErrorResponse(authResult.error);
    }
  }

  try {
    const {
      session_id,
      user_message,
      agent_message,
      room_name,
      participant_identity
    } = await req.json();

    if (!session_id || (!user_message && !agent_message)) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Get current turn index
    const { count: turnCount } = await supabase
      .from('chat_logs')
      .select('*', { count: 'exact', head: true })
      .eq('session_id', session_id);

    const turnIndex = (turnCount || 0) + 1;

    // Save user message if provided
    if (user_message) {
      await supabase.from('chat_logs').insert({
        user_id: participant_identity || 'voice-user',
        prompt: user_message,
        response: '',
        session_id,
        session_name: `Voice: ${user_message.substring(0, 50)}...`,
        status: 'user_message',
        turn_index: turnIndex,
        source: 'livekit-voice',
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    }

    // Save agent message if provided
    if (agent_message) {
      await supabase.from('chat_logs').insert({
        user_id: participant_identity || 'voice-user',
        prompt: user_message || '',
        response: agent_message,
        session_id,
        session_name: `Voice: ${(user_message || agent_message).substring(0, 50)}...`,
        status: 'completed',
        turn_index: turnIndex + (user_message ? 1 : 0),
        source: 'livekit-voice',
        metadata: { room_name, participant_identity },
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString()
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[LiveKit Chat Log] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save chat log'
      },
      { status: 500 }
    );
  }
}
