// server.js
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocket = require('ws');

// Initialize Next.js
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// Store active WebSocket connections
const activeConnections = new Map();

// Prepare Next.js app, then set up the server
app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  // Create WebSocket server
  const wss = new WebSocket.Server({ noServer: true });
  
  // WebSocket upgrade handling
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url);
    
    // Check if this is a Vonage WebSocket path
    if (pathname.startsWith('/ws/vonage/')) {
      const callId = pathname.replace('/ws/vonage/', '');
      console.log(`Vonage WebSocket connection for call: ${callId}`);
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleVonageConnection(ws, callId);
      });
    }
    // Check if this is a browser WebSocket path
    else if (pathname.startsWith('/ws/browser/')) {
      const callId = pathname.replace('/ws/browser/', '');
      console.log(`Browser WebSocket connection for call: ${callId}`);
      
      wss.handleUpgrade(req, socket, head, (ws) => {
        handleBrowserConnection(ws, callId);
      });
    }
    else {
      // Not a valid WebSocket path
      socket.destroy();
    }
  });
  
  // Handle Vonage WebSocket connection
  function handleVonageConnection(ws, callId) {
    console.log(`New Vonage connection for call: ${callId}`);
    
    // Store the connection
    if (!activeConnections.has(callId)) {
      activeConnections.set(callId, { 
        vonage: null, 
        browser: null,
        callId: callId,
        startTime: new Date() 
      });
    }
    
    const connection = activeConnections.get(callId);
    connection.vonage = ws;
    
    // Send initial connection message as described in Vonage docs
    // This is the "First message" that needs to be sent when Vonage connects
    ws.send(JSON.stringify({
      "event": "websocket:connected",
      "content-type": "audio/l16;rate=16000",
      "call-id": callId
    }));
    
    // Handle incoming messages from Vonage
    ws.on('message', (message) => {
      // Check if this is a text message (JSON) or binary (audio)
      if (typeof message === 'string' || message instanceof Buffer && message.toString().startsWith('{')) {
        // It's a text message, likely JSON
        try {
          const jsonMessage = JSON.parse(message.toString());
          console.log('Received JSON message from Vonage:', jsonMessage);
          
          // Forward the message to the browser if connected
          if (connection.browser && connection.browser.readyState === WebSocket.OPEN) {
            connection.browser.send(message.toString());
          }
        } catch (error) {
          console.error('Error parsing JSON message from Vonage:', error);
        }
      } else {
        // It's a binary message, likely audio data
        // Forward it to the browser if connected
        if (connection.browser && connection.browser.readyState === WebSocket.OPEN) {
          connection.browser.send(message);
        }
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      console.log(`Vonage connection closed for call: ${callId}`);
      if (connection) {
        connection.vonage = null;
        
        // Notify browser that Vonage disconnected
        if (connection.browser && connection.browser.readyState === WebSocket.OPEN) {
          connection.browser.send(JSON.stringify({
            event: 'call-ended',
            reason: 'Vonage disconnected',
            timestamp: new Date().toISOString()
          }));
        }
        
        // Clean up if no connections left
        if (!connection.browser) {
          activeConnections.delete(callId);
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error(`Vonage WebSocket error for call ${callId}:`, error);
    });
  }
  
  // Handle browser WebSocket connection
  function handleBrowserConnection(ws, callId) {
    console.log(`New browser connection for call: ${callId}`);
    
    // Store the connection
    if (!activeConnections.has(callId)) {
      activeConnections.set(callId, { 
        vonage: null, 
        browser: null,
        callId: callId,
        startTime: new Date() 
      });
    }
    
    const connection = activeConnections.get(callId);
    connection.browser = ws;
    
    // Send welcome message to browser
    ws.send(JSON.stringify({
      event: 'connected',
      callId: callId,
      timestamp: new Date().toISOString()
    }));
    
    // Handle incoming messages from browser
    ws.on('message', (message) => {
      // Check if we have a Vonage connection
      if (connection.vonage && connection.vonage.readyState === WebSocket.OPEN) {
        // Forward the message to Vonage
        // Note: Browser should send binary audio data in the correct format
        // (PCM 16-bit, 16kHz or 8kHz sample rate as configured)
        connection.vonage.send(message);
      }
    });
    
    // Handle connection close
    ws.on('close', () => {
      console.log(`Browser connection closed for call: ${callId}`);
      if (connection) {
        connection.browser = null;
        
        // Clean up if no connections left
        if (!connection.vonage) {
          activeConnections.delete(callId);
        }
      }
    });
    
    ws.on('error', (error) => {
      console.error(`Browser WebSocket error for call ${callId}:`, error);
    });
  }
  
  // Start the server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket server running on ws://localhost:${PORT}/ws/`);
  });
});