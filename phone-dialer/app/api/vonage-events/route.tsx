// app/api/vonage-events/route.tsx
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

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
    console.log('Vonage event received. Headers:', JSON.stringify(request.headers, null, 2));
    
    // Get request body as text first
    const bodyText = await request.text();
    console.log('Raw event body:', bodyText);
    
    // Parse as JSON if possible
    let eventData;
    try {
      eventData = JSON.parse(bodyText);
    } catch (error) {
      console.log('Not JSON, treating as form data');
      // Handle form data or other formats
      eventData = { rawBody: bodyText };
    }
    
    // Log to file for detailed analysis
    await logToFile({ headers: Object.fromEntries(request.headers.entries()), body: eventData });
    
    // Process different event types
    if (eventData.status) {
      switch (eventData.status) {
        case 'started':
          console.log(`Call ${eventData.uuid} has started`);
          break;
        
        case 'ringing':
          console.log(`Call ${eventData.uuid} is ringing`);
          break;
          
        case 'answered':
          console.log(`Call ${eventData.uuid} was answered`);
          break;
          
        case 'completed':
          console.log(`Call ${eventData.uuid} has completed. Reason: ${eventData.reason || 'None provided'}`);
          break;
          
        case 'rejected':
        case 'busy':
        case 'cancelled':
        case 'failed':
          console.log(`Call ${eventData.uuid} failed with status: ${eventData.status}. Reason: ${eventData.reason || 'None provided'}`);
          break;
          
        default:
          console.log(`Call ${eventData.uuid} has status: ${eventData.status}`);
      }
    }
    
    // Handle websocket specific events
    if (eventData.type) {
      if (eventData.type.includes('websocket')) {
        console.log(`WebSocket event for call ${eventData.uuid}: ${eventData.type}`);
        
        if (eventData.type === 'websocket:error') {
          console.error(`WebSocket error for call ${eventData.uuid}:`, eventData.error || 'No error details');
        }
      }
    }
    
    return NextResponse.json({ 
      received: true, 
      status: 'success',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
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
  
  // Process status events from query params
  if (params.status) {
    const status = params.status;
    const uuid = params.uuid || 'unknown';
    
    console.log(`Call ${uuid} status update: ${status}`);
    
    switch (status) {
      case 'started':
        console.log(`Call ${uuid} has started`);
        break;
      
      case 'ringing':
        console.log(`Call ${uuid} is ringing`);
        break;
        
      case 'answered':
        console.log(`Call ${uuid} was answered`);
        break;
        
      case 'completed':
        console.log(`Call ${uuid} has completed. Reason: ${params.reason || 'None provided'}`);
        break;
        
      case 'rejected':
      case 'busy':
      case 'cancelled':
      case 'failed':
        console.log(`Call ${uuid} failed with status: ${status}. Reason: ${params.reason || 'None provided'}`);
        break;
        
      default:
        console.log(`Call ${uuid} has status: ${status}`);
    }
  }
  
  return NextResponse.json({ 
    received: true, 
    status: 'success',
    timestamp: new Date().toISOString()
  });
}