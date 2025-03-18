// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocket = require('ws');

// Initialize Next.js
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Maps to track connections
const sessions = new Map();
const vonageConnections = new Map();

// Prepare Next.js app, then set up the server
app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create WebSocket server
  const wss = new WebSocket.Server({ noServer: true });

  // WebRTC signaling server
  const signalingWss = new WebSocket.Server({ noServer: true });
  
  // Handle WebSocket upgrade requests
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url);
    
    if (pathname.startsWith('/api/signaling/')) {
      // Extract call ID from the path
      const callId = pathname.split('/api/signaling/')[1];
      console.log(`WebRTC signaling connection for call: ${callId}`);
      
      signalingWss.handleUpgrade(req, socket, head, (ws) => {
        setupSignalingConnection(ws, callId);
      });
    } else if (pathname.startsWith('/api/vonage-voice/')) {
      // Extract Vonage call ID from the path
      const vonageCallId = pathname.split('/api/vonage-voice/')[1];
      console.log(`Vonage voice connection for call: ${vonageCallId}`);
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        setupVonageConnection(ws, vonageCallId);
      });
    } else {
      // Reject other WebSocket connections
      socket.destroy();
    }
  });
  
  // Setup WebRTC signaling connection
  function setupSignalingConnection(ws, callId) {
    console.log(`Setting up WebRTC signaling for call: ${callId}`);
    
    // Create session if it doesn't exist
    if (!sessions.has(callId)) {
      sessions.set(callId, {
        id: callId,
        connections: new Set(),
        vonageCallId: null
      });
    }
    
    const session = sessions.get(callId);
    session.connections.add(ws);
    
    // Send welcome message
    ws.send(JSON.stringify({
      type: 'welcome',
      callId,
      time: new Date().toISOString()
    }));

    // Handle WebRTC signaling messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message);
        console.log(`Received signaling message: ${data.type}`);
        
        // Store Vonage call ID if provided
        if (data.type === 'vonage-call-id' && data.vonageCallId) {
          session.vonageCallId = data.vonageCallId;
          console.log(`Associated session ${callId} with Vonage call ${data.vonageCallId}`);
        }
        
        // Broadcast to all other peers in this session
        session.connections.forEach((peer) => {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) {
            peer.send(message);
          }
        });
      } catch (error) {
        console.error('Error handling signaling message:', error);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      console.log(`WebRTC signaling connection closed for call: ${callId}`);
      
      // Remove this connection
      session.connections.delete(ws);
      
      // If no connections left, clean up the session
      if (session.connections.size === 0) {
        sessions.delete(callId);
      }
    });
  }
  
  // Setup Vonage voice connection
  function setupVonageConnection(ws, vonageCallId) {
    console.log(`Setting up Vonage voice connection for call: ${vonageCallId}`);
    
    // Store this connection
    vonageConnections.set(vonageCallId, ws);
    
    // Find associated WebRTC session
    let associatedSession = null;
    
    for (const [_, session] of sessions.entries()) {
      if (session.vonageCallId === vonageCallId) {
        associatedSession = session;
        break;
      }
    }
    
    if (associatedSession) {
      console.log(`Found associated WebRTC session ${associatedSession.id} for Vonage call ${vonageCallId}`);
    } else {
      console.log(`No WebRTC session found for Vonage call ${vonageCallId}`);
    }
    
    // Handle Vonage audio data
    ws.on('message', (message) => {
      if (associatedSession) {
        // Forward audio data to all WebRTC connections in the session
        associatedSession.connections.forEach((peer) => {
          if (peer.readyState === WebSocket.OPEN) {
            // Forward binary audio data to WebRTC clients
            peer.send(JSON.stringify({
              type: 'voice-data',
              callId: associatedSession.id,
              // Convert binary data to base64 for transmission
              data: message.toString('base64')
            }));
          }
        });
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      console.log(`Vonage voice connection closed for call: ${vonageCallId}`);
      vonageConnections.delete(vonageCallId);
      
      // Notify WebRTC clients that the call has ended
      if (associatedSession) {
        associatedSession.connections.forEach((peer) => {
          if (peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({
              type: 'call-ended',
              callId: associatedSession.id,
              reason: 'Vonage connection closed'
            }));
          }
        });
      }
    });
  }
  
  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebRTC signaling server running on ws://localhost:${PORT}/api/signaling/[callId]`);
    console.log(`> Vonage voice server running on ws://localhost:${PORT}/api/vonage-voice/[vonageCallId]`);
  });
});