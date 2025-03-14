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
const vonageConnections = new Map();
const browserConnections = new Map();

// Prepare Next.js app, then set up the server
app.prepare().then(() => {
  const server = createServer((req, res) => {
    console.log(`HTTP: ${req.method} ${req.url}`);
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create WebSocket server with base path
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'  // Handle all connections under /ws
  });

  // Log connection attempts
  wss.on('connection', (ws, req) => {
    const { pathname } = parse(req.url);
    console.log(`WebSocket connected: ${pathname}`);
    
    // Extract call ID and connection type from pathname
    // Pathname will be like /ws or /ws/vonage/callId or /ws/browser/callId
    let callId = null;
    let connectionType = 'generic';
    
    if (pathname.includes('/vonage/')) {
      connectionType = 'vonage';
      callId = pathname.split('/vonage/')[1];
      console.log(`Vonage connection for call: ${callId}`);
      vonageConnections.set(callId, ws);
    } else if (pathname.includes('/browser/')) {
      connectionType = 'browser';
      callId = pathname.split('/browser/')[1];
      console.log(`Browser connection for call: ${callId}`);
      browserConnections.set(callId, ws);
    }
    
    // Send welcome message
    ws.send(JSON.stringify({ 
      message: 'Connected to WebSocket server',
      type: connectionType,
      callId,
      time: new Date().toISOString()
    }));
    
    // Handle messages
    ws.on('message', (message) => {
      if (connectionType === 'vonage' && callId) {
        console.log(`Received ${message.length} bytes from Vonage for call ${callId}`);
        // Forward to browser if connected
        const browserWs = browserConnections.get(callId);
        if (browserWs && browserWs.readyState === WebSocket.OPEN) {
          browserWs.send(message);
        }
      } else if (connectionType === 'browser' && callId) {
        console.log(`Received ${message.length} bytes from browser for call ${callId}`);
        // Forward to Vonage if connected
        const vonageWs = vonageConnections.get(callId);
        if (vonageWs && vonageWs.readyState === WebSocket.OPEN) {
          vonageWs.send(message);
        }
      } else {
        console.log(`Received message from generic connection: ${message.toString().substring(0, 100)}`);
        // Echo back
        ws.send(`Echo: ${message.toString().substring(0, 100)}`);
      }
    });
    
    // Handle close
    ws.on('close', (code, reason) => {
      console.log(`WebSocket closed. Type: ${connectionType}, CallID: ${callId}, Code: ${code}, Reason: ${reason || 'None'}`);
      if (connectionType === 'vonage' && callId) {
        vonageConnections.delete(callId);
      } else if (connectionType === 'browser' && callId) {
        browserConnections.delete(callId);
      }
    });
    
    // Handle errors
    ws.on('error', (error) => {
      console.error(`WebSocket error. Type: ${connectionType}, CallID: ${callId}`, error);
    });
  });
  
  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket server running on ws://localhost:${PORT}/ws`);
  });
});