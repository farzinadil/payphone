import jwt from 'jsonwebtoken';

// Define types for TypeScript
interface CallResponse {
  success: boolean;
  message: string;
  callId?: string;
  error?: string;
}

export async function initiateCall(toNumber: string): Promise<CallResponse> {
  try {
    // Validate the phone number
    if (!toNumber || toNumber.length < 5) {
      throw new Error('Invalid phone number');
    }
    
    // Get Vonage credentials from environment variables
    const privateKey = process.env.VONAGE_PRIVATE_KEY;
    const applicationId = process.env.VONAGE_APPLICATION_ID;
    const fromNumber = process.env.VONAGE_PHONE_NUMBER;
    
    if (!privateKey || !applicationId || !fromNumber) {
      console.error('Missing Vonage credentials:', {
        hasPrivateKey: !!privateKey,
        hasApplicationId: !!applicationId,
        hasFromNumber: !!fromNumber
      });
      throw new Error('Missing Vonage credentials');
    }
    
    // Generate JWT for Vonage API authentication
    const token = jwt.sign(
      {
        application_id: applicationId,
        iat: Math.floor(Date.now() / 1000),
        jti: Math.random().toString(36).substring(2, 15),
      },
      privateKey,
      { algorithm: 'RS256' }
    );
    
    // Create a websocket endpoint for real-time audio
    const eventUrl = `${process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'https://example.com'}/api/vonage-events`;
    
    // Make the call to Vonage API for a live call
    const response = await fetch('https://api.nexmo.com/v1/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        "from": {
          "type": "phone",
          "number": fromNumber
        },
        "to": [{
          "type": "phone",
          "number": toNumber
        }],
        "ncco": [
          {
            "action": "connect",
            "endpoint": [{
              "type": "websocket",
              "uri": `wss://${process.env.NEXT_PUBLIC_APP_URL || 'localhost:3000'}/api/vonage-socket`,
              "content-type": "audio/l16;rate=16000"
            }],
            "eventUrl": [eventUrl]
          }
        ]
      })
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('Vonage API error:', responseData);
      throw new Error(responseData.title || 'Failed to initiate call');
    }
    
    return {
      success: true,
      message: 'Call initiated successfully',
      callId: responseData.uuid || 'unknown'
    };
    
  } catch (error: any) {
    console.error('Error initiating call:', error);
    return {
      success: false,
      message: 'Failed to initiate call',
      error: error.message
    };
  }
}

export async function endCall(callId: string): Promise<CallResponse> {
  try {
    // Get Vonage credentials from environment variables
    const privateKey = process.env.VONAGE_PRIVATE_KEY;
    const applicationId = process.env.VONAGE_APPLICATION_ID;
    
    if (!privateKey || !applicationId) {
      throw new Error('Missing Vonage credentials');
    }
    
    // Generate JWT for Vonage API authentication
    const token = jwt.sign(
      {
        application_id: applicationId,
        iat: Math.floor(Date.now() / 1000),
        jti: Math.random().toString(36).substring(2, 15),
      },
      privateKey,
      { algorithm: 'RS256' }
    );
    
    // End the call using Vonage API
    const response = await fetch(`https://api.nexmo.com/v1/calls/${callId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        "action": "hangup"
      })
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('Vonage API error when ending call:', responseData);
      throw new Error(responseData.title || 'Failed to end call');
    }
    
    return {
      success: true,
      message: 'Call ended successfully'
    };
    
  } catch (error: any) {
    console.error('Error ending call:', error);
    return {
      success: false,
      message: 'Failed to end call',
      error: error.message
    };
  }
}