// app/api/websocket-test/route.tsx
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  // Get the base URL
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const wsProtocol = baseUrl.startsWith('https') ? 'wss' : 'ws';
  const wsBaseUrl = `${wsProtocol}://${baseUrl.replace('https://', '').replace('http://', '')}`;
  
  // Test WebSocket paths
  const testPaths = [
    `${wsBaseUrl}/ws/test`,
    `${wsBaseUrl}/ws/vonage/test123`,
    `${wsBaseUrl}/ws/browser/test123`
  ];
  
  return NextResponse.json({
    baseUrl,
    wsBaseUrl,
    testPaths,
    instructions: 'Use these URLs in a WebSocket client to test your WebSocket server'
  });
}