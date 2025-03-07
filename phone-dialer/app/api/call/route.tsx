import { NextResponse } from 'next/server';
import { initiateCall } from '../../lib/vonage';

export async function POST(request) {
  try {
    const { toNumber } = await request.json();
    
    if (!toNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }
    
    const result = await initiateCall(toNumber);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process call request' },
      { status: 500 }
    );
  }
}