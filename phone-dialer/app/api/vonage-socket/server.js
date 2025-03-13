// app/api/vonage-socket/server.js (standalone WebSocket server)
const WebSocket = require('ws');
const http = require('http');
const { Transform } = require('stream');

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server for Vonage Voice API');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Store active connections
const connections = new Map();

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  const id = Math.random().toString(36).substring(2, 15);
  console.log(`New WebSocket connection: ${id}`);
  
  // Store this connection
  connections.set(id, {
    ws,
    browser: null // This will store the browser WebSocket connection
  });
  
  // Listen for messages from Vonage
  ws.on('message', (message) => {
    const connection = connections.get(id);
    if (connection && connection.browser) {
      // Forward audio data to the browser
      if (connection.browser.readyState === WebSocket.OPEN) {
        connection.browser.send(message);
      }
    }
  });
  
  // Handle connection close
  ws.on('close', () => {
    console.log(`WebSocket connection closed: ${id}`);
    const connection = connections.get(id);
    if (connection && connection.browser) {
      connection.browser.close();
    }
    connections.delete(id);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    console.error(`WebSocket error for ${id}:`, error);
  });
});

// Endpoint for browser connections
const browserWss = new WebSocket.Server({ noServer: true });

browserWss.on('connection', (ws, req) => {
  const id = req.url.split('/').pop();
  console.log(`Browser connected for call: ${id}`);
  
  const connection = connections.get(id);
  if (connection) {
    connection.browser = ws;
    
    // Listen for audio data from the browser
    ws.on('message', (message) => {
      if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
        // Forward browser audio to Vonage
        connection.ws.send(message);
      }
    });
    
    // Handle browser disconnect
    ws.on('close', () => {
      console.log(`Browser disconnected for call: ${id}`);
      if (connection.ws) {
        // Optionally close the Vonage connection when browser disconnects
        // connection.ws.close();
      }
    });
  } else {
    ws.close();
  }
});

// Handle upgrade requests for browser connections
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  
  if (pathname.startsWith('/browser/')) {
    browserWss.handleUpgrade(request, socket, head, (ws) => {
      browserWss.emit('connection', ws, request);
    });
  } else {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  }
});

// Start the server
const PORT = process.env.WS_PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`);
});
