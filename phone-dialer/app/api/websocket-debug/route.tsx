// app/api/websocket-debug/route.tsx
import { NextResponse } from 'next/server';
import https from 'https';
import http from 'http';

export async function GET(request: Request) {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!baseUrl) {
      return NextResponse.json({ error: "NEXT_PUBLIC_APP_URL not set" }, { status: 500 });
    }

    // Test WebSocket path
    const testCallId = 'test-call-' + Date.now();
    const wsUrl = `${baseUrl}/ws/vonage/${testCallId}`;
    const wsUri = wsUrl.replace('https://', '').replace('http://', '');
    
    // Split into host and path
    const [host, ...pathParts] = wsUri.split('/');
    const path = '/' + pathParts.join('/');
    
    // Use HTTP/HTTPS to check if the server is reachable
    const protocol = baseUrl.startsWith('https') ? https : http;
    
    // Create a promise to check server connection
    const checkServer = new Promise<{success: boolean, message: string}>((resolve) => {
      const req = protocol.request({
        host,
        path,
        method: 'GET',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ=='  // Sample value
        }
      }, (res) => {
        // If the server is working correctly for WebSockets, we'll get a 101 response
        if (res.statusCode === 101) {
          resolve({ success: true, message: 'WebSocket upgrade successful' });
        } else {
          let data = '';
          res.on('data', (chunk) => {
            data += chunk;
          });
          res.on('end', () => {
            resolve({ 
              success: false, 
              message: `Unexpected status code: ${res.statusCode}. Body: ${data.substring(0, 100)}...` 
            });
          });
        }
        
        // Abort the request after receiving headers
        req.abort();
      });
      
      req.on('error', (err) => {
        resolve({ success: false, message: `Connection error: ${err.message}` });
      });
      
      req.on('upgrade', (res, socket, upgradeHead) => {
        // This is called when the WebSocket upgrade is successful
        socket.end(); // Close the connection
        resolve({ success: true, message: 'WebSocket upgrade accepted' });
      });
      
      req.end();
      
      // Set a timeout
      setTimeout(() => {
        req.abort();
        resolve({ success: false, message: 'Connection timeout' });
      }, 5000);
    });
    
    const result = await checkServer;
    
    return NextResponse.json({
      baseUrl,
      wsUrl,
      host,
      path,
      testCallId,
      ...result,
      instructions: 'This endpoint tests if your WebSocket server can be reached and if it properly handles the WebSocket upgrade.'
    });
  } catch (error) {
    return NextResponse.json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}