// app/api/signaling/[callId]/route.ts
import { NextRequest } from 'next/server';
import { initiateCall, endCall } from '../../../lib/vonage';

// This will hold all active WebSocket connections, grouped by callId
const activeConnections = new Map<string, Set<WebSocket>>();

// Handle WebSocket connections
export async function GET(request: NextRequest, { params }: { params: { callId: string } }) {
  const callId = params.callId;
  
  // Ensure we're handling a WebSocket request
  const { socket: webSocketServer } = (await import('next/dist/compiled/ws')) as any;
  if (!webSocketServer) {
    return new Response('WebSocket server not available', { status: 500 });
  }
  
  // Check if we have an upgrade header (required for WebSocket)
  const upgradeHeader = request.headers.get('upgrade');
  if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket request', { status: 426 });
  }

  // Create a WebSocket connection
  const webSocketRes = await new Promise<Response>((resolve) => {
    let serverSocket: any = null;
    let clientSocket: any = null;
    
    // Setup a socket pair
    const { createServer } = require('http');
    const { parse } = require('url');
    const { Server } = require('ws');
    
    const server = createServer();
    const wss = new Server({ noServer: true });
    
    // Handle upgrade
    server.on('upgrade', (req: any, socket: any, head: any) => {
      wss.handleUpgrade(req, socket, head, (ws: any) => {
        wss.emit('connection', ws, req);
      });
    });
    
    // Handle connections
    wss.on('connection', (ws: WebSocket) => {
      clientSocket = ws;
      
      // Initialize set for this call if it doesn't exist
      if (!activeConnections.has(callId)) {
        activeConnections.set(callId, new Set());
      }
      
      // Add this connection to the set
      activeConnections.get(callId)?.add(ws);
      
      // Handle messages
      ws.addEventListener('message', async (event) => {
        try {
          const message = JSON.parse(event.data as string);
          console.log(`Received signaling message: ${message.type} for call ${callId}`);
          
          // Handle messages based on type
          switch (message.type) {
            case 'join':
              // Send to all other connections for this call
              broadcastToOthers(callId, ws, message);
              break;
              
            case 'offer':
            case 'answer':
            case 'ice-candidate':
              // Forward to all other connections for this call
              broadcastToOthers(callId, ws, message);
              break;
              
            case 'vonage-call':
              // Initiate a call to a phone number
              if (message.phoneNumber) {
                try {
                  const result = await initiateCall(message.phoneNumber);
                  
                  ws.send(JSON.stringify({
                    type: 'vonage-call-result',
                    success: result.success,
                    callId: result.callId,
                    error: result.error
                  }));
                  
                  // If successful, associate the Vonage call ID with this WebRTC session
                  if (result.success && result.callId) {
                    // You might want to store this mapping in a database for production
                    console.log(`Associated WebRTC session ${callId} with Vonage call ${result.callId}`);
                  }
                } catch (error) {
                  console.error('Error initiating Vonage call:', error);
                  ws.send(JSON.stringify({
                    type: 'vonage-call-result',
                    success: false,
                    error: 'Failed to initiate call'
                  }));
                }
              }
              break;
              
            case 'end-call':
              // End the call
              if (message.vonageCallId) {
                try {
                  await endCall(message.vonageCallId);
                } catch (error) {
                  console.error('Error ending Vonage call:', error);
                }
              }
              
              // Notify all connections that the call has ended
              broadcastToAll(callId, {
                type: 'call-ended',
                callId
              });
              
              // Close all connections for this call
              closeAllConnections(callId);
              break;
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
        }
      });
      
      // Handle close
      ws.addEventListener('close', () => {
        console.log(`WebSocket closed for call: ${callId}`);
        
        // Remove this connection
        activeConnections.get(callId)?.delete(ws);
        
        // If no connections left, clean up
        if (activeConnections.get(callId)?.size === 0) {
          activeConnections.delete(callId);
        }
      });
      
      // Send initial message
      ws.send(JSON.stringify({
        type: 'welcome',
        callId,
        timestamp: new Date().toISOString()
      }));
    });
    
    // Resolve with the response
    resolve(new Response(null, {
      status: 101,
      webSocket: { clientSocket, serverSocket }
    }));
  });
  
  return webSocketRes;
}

// Broadcast a message to all connections for a call except the sender
function broadcastToOthers(callId: string, sender: WebSocket, message: any) {
  const connections = activeConnections.get(callId);
  if (!connections) return;
  
  for (const connection of connections) {
    if (connection !== sender && connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    }
  }
}

// Broadcast a message to all connections for a call
function broadcastToAll(callId: string, message: any) {
  const connections = activeConnections.get(callId);
  if (!connections) return;
  
  for (const connection of connections) {
    if (connection.readyState === WebSocket.OPEN) {
      connection.send(JSON.stringify(message));
    }
  }
}

// Close all connections for a call
function closeAllConnections(callId: string) {
  const connections = activeConnections.get(callId);
  if (!connections) return;
  
  for (const connection of connections) {
    if (connection.readyState === WebSocket.OPEN) {
      connection.close();
    }
  }
  
  activeConnections.delete(callId);
}