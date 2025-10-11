import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Appwrite configuration from env
    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID!;
    const bucketId = process.env.NEXT_PUBLIC_APPWRITE_BUCKET_ID!;
    const apiKey = process.env.APPWRITE_API_KEY!;

    // Create unique file ID
    const fileId = `chat-${sessionId}-${Date.now()}`;

    // Prepare upload to Appwrite
    const uploadFormData = new FormData();
    uploadFormData.append('fileId', fileId);
    uploadFormData.append('file', file);

    // Upload to Appwrite Storage with API key
    const response = await fetch(`${endpoint}/storage/buckets/${bucketId}/files`, {
      method: 'POST',
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
      },
      body: uploadFormData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Appwrite Upload] Error:', errorText);
      return NextResponse.json(
        { error: `Appwrite upload failed: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    // Return public URL
    const imageUrl = `${endpoint}/storage/buckets/${bucketId}/files/${data.$id}/view?project=${projectId}`;

    console.log('[Appwrite Upload] Success:', imageUrl);

    return NextResponse.json({
      success: true,
      url: imageUrl,
      fileId: data.$id,
    });
  } catch (error: any) {
    console.error('[Appwrite Upload] Server error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
