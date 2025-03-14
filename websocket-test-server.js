// websocket-test-server.js
const WebSocket = require('ws');
const http = require('http');

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket test server running');
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// Handle connections
wss.on('connection', (ws, req) => {
  console.log('Client connected:', req.url);
  
  // Send welcome message
  ws.send(JSON.stringify({ message: 'Welcome to the WebSocket server!' }));
  
  // Handle messages
  ws.on('message', (message) => {
    console.log('Received:', message.toString());
    // Echo back the message
    ws.send(`Echo: ${message}`);
  });
  
  // Handle close
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

// Start server
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`WebSocket test server running on port ${PORT}`);
});