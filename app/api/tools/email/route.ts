import { NextRequest, NextResponse } from 'next/server';
import { handleEmailSend } from '@/lib/tools';

export async function POST(request: NextRequest) {
  try {
    const params = await request.json();
    
    if (!params.emailType || !params.name || !params.email || !params.message) {
      return NextResponse.json(
        { error: 'Missing required fields: emailType, name, email, message' },
        { status: 400 }
      );
    }

    const result = await handleEmailSend(params);

    return NextResponse.json({ result });
    
  } catch (error) {
    console.error('[Email API Error]:', error);
    return NextResponse.json(
      { error: 'Failed to send email' },
      { status: 500 }
    );
  }
}
