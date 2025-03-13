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
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create WebSocket server attached to the same HTTP server
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws'  // All WebSocket connections will use this path
  });

  // Handle WebSocket connections
  wss.on('connection', (ws, req) => {
    const { pathname } = parse(req.url);
    
    if (pathname.startsWith('/ws/vonage')) {
      // This is a connection from Vonage
      const callId = pathname.split('/').pop();
      console.log(`Vonage connected for call: ${callId}`);
      
      vonageConnections.set(callId, ws);
      
      // Check if we already have a browser connection for this call
      const browserWs = browserConnections.get(callId);
      if (browserWs && browserWs.readyState === WebSocket.OPEN) {
        console.log(`Linking existing browser connection for call: ${callId}`);
      }
      
      // Handle audio data from Vonage
      ws.on('message', (message) => {
        const browserWs = browserConnections.get(callId);
        if (browserWs && browserWs.readyState === WebSocket.OPEN) {
          // Forward audio to browser
          browserWs.send(message);
        }
      });
      
      // Handle Vonage disconnection
      ws.on('close', () => {
        console.log(`Vonage disconnected for call: ${callId}`);
        vonageConnections.delete(callId);
        
        // Optionally close the browser connection too
        const browserWs = browserConnections.get(callId);
        if (browserWs && browserWs.readyState === WebSocket.OPEN) {
          browserWs.close();
          browserConnections.delete(callId);
        }
      });
      
    } else if (pathname.startsWith('/ws/browser')) {
      // This is a connection from the browser
      const callId = pathname.split('/').pop();
      console.log(`Browser connected for call: ${callId}`);
      
      browserConnections.set(callId, ws);
      
      // Check if we already have a Vonage connection for this call
      const vonageWs = vonageConnections.get(callId);
      if (vonageWs && vonageWs.readyState === WebSocket.OPEN) {
        console.log(`Linking existing Vonage connection for call: ${callId}`);
      }
      
      // Handle audio data from browser
      ws.on('message', (message) => {
        const vonageWs = vonageConnections.get(callId);
        if (vonageWs && vonageWs.readyState === WebSocket.OPEN) {
          // Forward audio to Vonage
          vonageWs.send(message);
        }
      });
      
      // Handle browser disconnection
      ws.on('close', () => {
        console.log(`Browser disconnected for call: ${callId}`);
        browserConnections.delete(callId);
      });
    }
  });

  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket server running on ws://localhost:${PORT}/ws`);
  });
});