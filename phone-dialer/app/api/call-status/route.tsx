// app/api/call-status/route.tsx
import { NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const callId = url.searchParams.get('callId');
    
    if (!callId) {
      return NextResponse.json(
        { error: 'Call ID is required' },
        { status: 400 }
      );
    }
    
    // Get Vonage credentials from environment variables
    const privateKey = process.env.VONAGE_PRIVATE_KEY;
    const applicationId = process.env.VONAGE_APPLICATION_ID;
    
    if (!privateKey || !applicationId) {
      return NextResponse.json(
        { error: 'Missing Vonage credentials' },
        { status: 500 }
      );
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
    
    // Check call status with Vonage API
    try {
      const response = await fetch(`https://api.nexmo.com/v1/calls/${callId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      // If call not found, return 404
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Call not found' },
          { status: 404 }
        );
      }
      
      // Parse the response
      const data = await response.json();
      
      return NextResponse.json({
        success: true,
        callId,
        status: data.status,
        direction: data.direction,
        duration: data.duration || 0,
        details: data
      });
    } catch (error: any) {
      console.error('Error checking call status with Vonage:', error);
      
      return NextResponse.json(
        { 
          error: 'Failed to check call status with Vonage',
          details: error.message
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error('Error in call status endpoint:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check call status',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}