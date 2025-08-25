import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 })
    }

    // Delete the submission
    const { error } = await supabaseAdmin
      .from('submissions')
      .delete()
      .eq('id', id)
      .eq('content_type', 'Form Submission') // Extra safety to only delete form submissions

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to delete submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Submission deleted successfully' })

  } catch (error) {
    console.error('Delete submission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params
    const body = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Submission ID is required' }, { status: 400 })
    }

    // Update the submission status
    const { data, error } = await supabaseAdmin
      .from('submissions')
      .update({ status: body.status })
      .eq('id', id)
      .eq('content_type', 'Form Submission')
      .select()

    if (error) {
      console.error('Database error:', error)
      return NextResponse.json({ error: 'Failed to update submission' }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })

  } catch (error) {
    console.error('Update submission error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}