import { NextResponse } from 'next/server';
import { initiateCall, endCall } from '../../lib/vonage';

export async function POST(request: Request) {
  try {
    const { toNumber } = await request.json();
    
    if (!toNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    const result = await initiateCall(toNumber);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to initiate call' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process call request' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const { callId } = await request.json();
    
    if (!callId) {
      return NextResponse.json(
        { error: 'Call ID is required' },
        { status: 400 }
      );
    }
    
    const result = await endCall(callId);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to end call' },
        { status: 500 }
      );
    }
    
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process end call request' },
      { status: 500 }
    );
  }
}