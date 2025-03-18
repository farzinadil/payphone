// app/api/vonage-bridge/route.tsx
import { NextResponse } from 'next/server';

// This endpoint returns the WebRTC to Vonage bridge configuration
// It's used when setting up a call to bridge WebRTC audio with the phone system

export async function GET(request: Request) {
  try {
    // Get the base URL for WebRTC signaling
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
    const wsBaseUrl = `${wsProtocol}://${baseUrl.replace('https://', '').replace('http://', '')}`;
    
    // Define the WebRTC configuration
    const webrtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Add your TURN servers here for production
      ],
      signalingEndpoint: `${wsBaseUrl}/api/signaling/`,
      vonageEndpoint: `${wsBaseUrl}/api/vonage-voice/`
    };
    
    return NextResponse.json({
      success: true,
      config: webrtcConfig
    });
  } catch (error: any) {
    console.error('Error retrieving bridge configuration:', error);
    return NextResponse.json(
      { 
        error: 'Failed to retrieve bridge configuration', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    // This endpoint is where Vonage will connect its WebSocket
    // for streaming audio to/from the phone call
    const body = await request.json();
    const { callId, sessionId } = body;
    
    if (!callId || !sessionId) {
      return NextResponse.json(
        { error: 'Call ID and Session ID are required' },
        { status: 400 }
      );
    }
    
    // Generate a unique token for this bridge
    const token = Math.random().toString(36).substring(2, 15);
    
    // Get the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    
    // Create a WebSocket endpoint for Vonage to connect to
    const webSocketUrl = `${baseUrl.replace('http', 'ws')}/api/vonage-voice/${callId}`;
    
    // This NCCO (Nexmo Call Control Object) tells Vonage how to handle the call
    const ncco = [
      {
        "action": "connect",
        "from": process.env.VONAGE_PHONE_NUMBER,
        "endpoint": [
          {
            "type": "websocket",
            "uri": webSocketUrl,
            "content-type": "audio/l16;rate=16000",
            "headers": {
              "sessionId": sessionId,
              "token": token
            }
          }
        ]
      }
    ];
    
    return NextResponse.json({
      success: true,
      ncco,
      webSocketUrl,
      token
    });
  } catch (error: any) {
    console.error('Error creating bridge NCCO:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create bridge NCCO', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}