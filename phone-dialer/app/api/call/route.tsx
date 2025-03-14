// app/api/call/route.tsx
import { NextResponse } from 'next/server';
import { initiateCall, endCall } from '../../lib/vonage';

export async function POST(request: Request) {
  try {
    console.log('Received call initiation request');
    const body = await request.json();
    const { toNumber } = body;
    
    console.log(`Call request to number: ${toNumber}`);
    
    if (!toNumber) {
      console.error('Missing phone number in request');
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    // Attempt to initiate call
    const result = await initiateCall(toNumber);
    
    console.log('Call initiation result:', result);
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to initiate call',
          details: result.details || {}
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process call request',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    console.log('Received end call request');
    const body = await request.json();
    const { callId } = body;
    
    console.log(`End call request for ID: ${callId}`);
    
    if (!callId) {
      console.error('Missing call ID in request');
      return NextResponse.json(
        { error: 'Call ID is required' },
        { status: 400 }
      );
    }
    
    // Attempt to end call
    const result = await endCall(callId);
    
    console.log('End call result:', result);
    
    if (!result.success) {
      return NextResponse.json(
        { 
          error: result.error || 'Failed to end call',
          details: result.details || {}
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to process end call request',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}