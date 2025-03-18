// app/api/call-completed/route.tsx
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId');
    
    if (!callId) {
      return NextResponse.json({ error: 'Call ID is required' }, { status: 400 });
    }
    
    // Import the helper from vonage-events
    const { isCallCompleted } = await import('../vonage-events/route');
    
    return NextResponse.json({
      callId,
      completed: isCallCompleted(callId)
    });
  } catch (error) {
    console.error('Error checking call completion status:', error);
    
    return NextResponse.json({
      error: 'Failed to check call completion status',
      details: error.message
    }, { status: 500 });
  }
}