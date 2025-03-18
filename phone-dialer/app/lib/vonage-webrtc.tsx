// app/lib/vonage-webrtc.tsx
import jwt from 'jsonwebtoken';

// Define types for TypeScript
interface CallResponse {
  success: boolean;
  message: string;
  callId?: string;
  error?: string;
  details?: any;
}

export async function initiateCall(toNumber: string): Promise<CallResponse> {
  try {
    console.log(`Initiating call to ${toNumber}`);
    
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
    
    // Generate a unique call identifier
    const callId = Math.random().toString(36).substring(2, 15);
    
    // Get the base URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    console.log(`Using base URL: ${baseUrl}`);
    
    // Create a simplified NCCO - avoid trying to connect to the same number twice
    const ncco = [
      {
        "action": "talk",
        "text": "Hello, this is your digital payphone call. You will be connected shortly.",
        "language": "en-US"
      },
      {
        "action": "connect",
        "from": fromNumber,
        "endpoint": [
          {
            "type": "phone",
            "number": toNumber.replace(/[^0-9+]/g, '') // Clean the phone number
          }
        ]
      }
    ];
    
    // Create the call details object
    const callDetails = {
      "from": {
        "type": "phone",
        "number": fromNumber
      },
      "to": [{
        "type": "phone",
        "number": toNumber
      }],
      "ncco": ncco,
      "eventUrl": [`${baseUrl}/api/vonage-events`]
    };
    
    console.log('Making Vonage API call with:', JSON.stringify(callDetails, null, 2));
    
    // Make the call to Vonage API
    const response = await fetch('https://api.nexmo.com/v1/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(callDetails)
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      console.error('Vonage API error:', responseData);
      return {
        success: false,
        message: 'Failed to initiate call',
        error: responseData.title || responseData.error_title || 'Unknown error',
        details: responseData
      };
    }
    
    console.log('Successful call response:', responseData);
    
    // Return the call ID
    return {
      success: true,
      message: 'Call initiated successfully',
      callId: responseData.uuid || callId,
      details: {
        ourCallId: callId
      }
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
    console.log(`Attempting to end call ${callId}`);
    
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
    
    // Check if the call is already completed
    try {
      // Import the helper
      const { isCallCompleted } = await import('../api/vonage-events/route');
      
      if (isCallCompleted(callId)) {
        console.log(`Call ${callId} already completed, skipping Vonage API call`);
        return {
          success: true,
          message: 'Call was already completed'
        };
      }
    } catch (error) {
      console.error('Error checking if call is completed:', error);
      // Continue with the Vonage API call if we can't check the completion status
    }
    
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
    console.log(`End call response for ${callId}:`, responseData);
    
    if (!response.ok) {
      console.error('Vonage API error when ending call:', responseData);
      return {
        success: false,
        message: 'Failed to end call',
        error: responseData.error_title || responseData.title || 'Unknown error',
        details: responseData
      };
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