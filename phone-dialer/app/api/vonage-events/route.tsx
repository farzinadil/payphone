// app/api/vonage-events/route.tsx
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// Maintain a simple in-memory store of completed call IDs
// In a production app, you would use a database or Redis for this
const completedCallIds = new Set();

// Export this function to check if a call is completed
export function isCallCompleted(callId: string): boolean {
  return completedCallIds.has(callId);
}

// Helper to log events to a file for better debugging
const logToFile = async (data: any) => {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = path.join(logsDir, `vonage-event-${timestamp}.json`);
    
    fs.writeFileSync(
      logFile, 
      JSON.stringify({ timestamp, data }, null, 2)
    );
    
    console.log(`Event logged to ${logFile}`);
  } catch (error) {
    console.error('Failed to log event to file:', error);
  }
};

export async function POST(request: Request) {
  try {
    // Log raw request details
    console.log('Vonage event received. Headers:', JSON.stringify(Object.fromEntries(request.headers.entries()), null, 2));
    
    // Get request body as text first
    const bodyText = await request.text();
    console.log('Raw event body:', bodyText);
    
    // Parse as JSON if possible
    let eventData;
    try {
      eventData = JSON.parse(bodyText);
    } catch (error) {
      console.log('Not JSON, treating as form data');
      // Parse form data
      const formData = new URLSearchParams(bodyText);
      eventData = Object.fromEntries(formData.entries());
    }
    
    // Log to file for detailed analysis
    await logToFile({ 
      headers: Object.fromEntries(request.headers.entries()), 
      body: eventData 
    });
    
    // Check for completed calls
    if (eventData.status === 'completed' && eventData.uuid) {
      console.log(`Call ${eventData.uuid} marked as completed`);
      completedCallIds.add(eventData.uuid);
    }
    
    // Process different event types
    if (eventData.status) {
      switch (eventData.status) {
        case 'started':
          console.log(`Call ${eventData.uuid} has started`);
          
          // Return NCCO for this call - use a simpler NCCO
          return NextResponse.json([
            {
              "action": "talk",
              "text": "Hello, this is your digital payphone call. You are now connected.",
              "language": "en-US"
            }
            // We don't add a "connect" action here - let Vonage handle the connection
          ]);
          
        case 'ringing':
          console.log(`Call ${eventData.uuid} is ringing`);
          break;
          
        case 'answered':
          console.log(`Call ${eventData.uuid} was answered`);
          break;
          
        case 'completed':
          console.log(`Call ${eventData.uuid} has completed. Reason: ${eventData.reason || 'None provided'}`);
          completedCallIds.add(eventData.uuid);
          break;
          
        case 'rejected':
        case 'busy':
        case 'cancelled':
        case 'failed':
          console.log(`Call ${eventData.uuid} failed with status: ${eventData.status}. Reason: ${eventData.reason || 'None provided'}`);
          completedCallIds.add(eventData.uuid);
          break;
          
        default:
          console.log(`Call ${eventData.uuid} has status: ${eventData.status}`);
      }
    }
    
    return NextResponse.json({ 
      received: true, 
      status: 'success',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Error processing Vonage event:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process event', 
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Also handle GET requests as Vonage might send some events as GET
export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  
  console.log('Vonage GET event received:', params);
  
  // Log to file for analysis
  await logToFile({ method: 'GET', params });
  
  // Check for completed calls
  if (params.status === 'completed' && params.uuid) {
    console.log(`Call ${params.uuid} marked as completed via GET`);
    completedCallIds.add(params.uuid);
  }
  
  // Process status events from query params
  if (params.status) {
    const status = params.status;
    const uuid = params.uuid || 'unknown';
    
    console.log(`Call ${uuid} status update: ${status}`);
    
    // Similar handling as in the POST method
    if (status === 'answered') {
      console.log(`Call ${uuid} was answered`);
    } else if (status === 'completed' || status === 'rejected' || status === 'busy' || status === 'cancelled' || status === 'failed') {
      console.log(`Call ${uuid} ended with status: ${status}`);
      if (uuid !== 'unknown') {
        completedCallIds.add(uuid);
      }
    }
  }
  
  return NextResponse.json({ 
    received: true, 
    status: 'success',
    timestamp: new Date().toISOString()
  });
}