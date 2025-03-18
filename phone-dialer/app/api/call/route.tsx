// app/api/call/route.tsx
import { NextResponse } from 'next/server';
import { initiateCall, endCall } from '../../lib/vonage-webrtc';

export async function POST(request: Request) {
  try {
    console.log('Received call initiation request');
    
    // Safeguard for empty request bodies
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Error parsing request body:', error);
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }
    
    const { toNumber, sessionId } = body;
    
    console.log(`Call request to number: ${toNumber}, Session ID: ${sessionId}`);
    
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
    
    // Store the mapping between session ID and Vonage call ID
    // In a production app, you'd want to use a database for this
    console.log(`Mapping session ${sessionId} to Vonage call ${result.callId}`);
    
    return NextResponse.json({
      success: true,
      message: 'Call initiated successfully',
      callId: result.callId,
      sessionId
    });
    
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
    
    // Safeguard for empty request bodies
    let body;
    try {
      body = await request.json();
    } catch (error) {
      console.error('Error parsing request body:', error);
      return NextResponse.json(
        { success: true, message: 'Error parsing request but call marked as ended' },
        { status: 200 } // Return 200 even on error to prevent UI from getting stuck
      );
    }
    
    const { callId } = body;
    
    if (!callId) {
      console.error('Missing call ID in request');
      return NextResponse.json(
        { success: true, message: 'Call marked as ended (no ID provided)' },
        { status: 200 } // Return 200 to let UI reset
      );
    }
    
    console.log(`End call request for ID: ${callId}`);
    
    // Check if the call is already completed
    try {
      // Import the helper
      const { isCallCompleted } = await import('../vonage-events/route');
      
      if (isCallCompleted(callId)) {
        console.log(`Call ${callId} already completed, skipping Vonage API call`);
        return NextResponse.json({
          success: true,
          message: 'Call was already completed, marked as ended in UI'
        });
      }
    } catch (error) {
      console.error('Error checking if call is completed:', error);
      // Continue with the Vonage API call if we can't check the completion status
    }
    
    // Attempt to end call via Vonage API
    try {
      const result = await endCall(callId);
      console.log('End call result:', result);
      
      // Always return success to let the UI reset
      return NextResponse.json({
        success: true,
        message: result.success ? 'Call ended successfully' : 'Call marked as ended',
        vonageResult: result
      });
    } catch (error) {
      console.error('Error calling Vonage API:', error);
      
      // Even in case of errors, return success to allow UI to reset
      return NextResponse.json({
        success: true,
        message: 'Call marked as ended despite Vonage API error',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Overall error in end call API route:', error);
    
    // Always return success to let the UI reset
    return NextResponse.json({
      success: true,
      message: 'Call marked as ended due to error',
      error: error.message
    });
  }
}