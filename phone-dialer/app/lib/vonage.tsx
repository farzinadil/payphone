import jwt from 'jsonwebtoken';

export async function initiateCall(toNumber) {
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
    
    console.log('Making call to Vonage API:', {
      fromNumber,
      toNumber,
      applicationId
    });
    
    // Make the call to Vonage API
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
        "ncco": [{
          "action": "talk",
          "language": "en-US",
          "style": "0",
          "text": "Hello, this is a test call from the phone dialer app."
        }]
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
    
  } catch (error) {
    console.error('Error initiating call:', error);
    throw error;
  }
}