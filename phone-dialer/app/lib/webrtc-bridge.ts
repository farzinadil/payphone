// app/lib/webrtc-bridge.ts
// This module handles bridging WebRTC connections to phone calls via Vonage

import { NextRequest } from 'next/server';
import WebSocket from 'ws';

// Store active calls and their connections
interface CallConnection {
  webrtc: WebSocket | null;
  vonage: WebSocket | null;
  callId: string;
  vonageCallId: string;
  startTime: Date;
}

const activeConnections = new Map<string, CallConnection>();

// Create a connection for a new call
export function createCallConnection(callId: string, vonageCallId: string): boolean {
  if (activeConnections.has(callId)) {
    console.warn(`Call connection ${callId} already exists`);
    return false;
  }
  
  activeConnections.set(callId, {
    webrtc: null,
    vonage: null,
    callId,
    vonageCallId,
    startTime: new Date()
  });
  
  console.log(`Created call connection for ${callId} with Vonage call ${vonageCallId}`);
  return true;
}

// Register a WebRTC connection for a call
export function registerWebRTCConnection(callId: string, ws: WebSocket): boolean {
  const connection = activeConnections.get(callId);
  
  if (!connection) {
    console.warn(`No call connection found for ${callId}`);
    return false;
  }
  
  connection.webrtc = ws;
  console.log(`Registered WebRTC connection for call ${callId}`);
  
  // Set up WebRTC message handler
  ws.on('message', (message) => {
    // Forward messages to Vonage WebSocket if connected
    if (connection.vonage && connection.vonage.readyState === WebSocket.OPEN) {
      connection.vonage.send(message);
    }
  });
  
  // Handle WebRTC connection close
  ws.on('close', () => {
    console.log(`WebRTC connection closed for call ${callId}`);
    connection.webrtc = null;
    
    // If Vonage connection is still active, close it too
    if (connection.vonage && connection.vonage.readyState === WebSocket.OPEN) {
      connection.vonage.close();
    }
    
    // Remove the call connection
    activeConnections.delete(callId);
  });
  
  return true;
}

// Register a Vonage connection for a call
export function registerVonageConnection(vonageCallId: string, ws: WebSocket): boolean {
  // Find the call connection with this Vonage call ID
  let callConnection: CallConnection | undefined;
  
  for (const [_, connection] of activeConnections.entries()) {
    if (connection.vonageCallId === vonageCallId) {
      callConnection = connection;
      break;
    }
  }
  
  if (!callConnection) {
    console.warn(`No call connection found for Vonage call ${vonageCallId}`);
    return false;
  }
  
  callConnection.vonage = ws;
  console.log(`Registered Vonage connection for call ${callConnection.callId} (Vonage ID: ${vonageCallId})`);
  
  // Set up Vonage message handler
  ws.on('message', (message) => {
    // Forward messages to WebRTC connection if connected
    if (callConnection?.webrtc && callConnection.webrtc.readyState === WebSocket.OPEN) {
      callConnection.webrtc.send(message);
    }
  });
  
  // Handle Vonage connection close
  ws.on('close', () => {
    console.log(`Vonage connection closed for call ${callConnection?.callId}`);
    
    if (callConnection) {
      callConnection.vonage = null;
      
      // If WebRTC connection is still active, close it too
      if (callConnection.webrtc && callConnection.webrtc.readyState === WebSocket.OPEN) {
        callConnection.webrtc.close();
      }
      
      // Remove the call connection
      activeConnections.delete(callConnection.callId);
    }
  });
  
  return true;
}

// End a call and close all connections
export function endCall(callId: string): boolean {
  const connection = activeConnections.get(callId);
  
  if (!connection) {
    console.warn(`No call connection found for ${callId}`);
    return false;
  }
  
  // Close WebRTC connection
  if (connection.webrtc && connection.webrtc.readyState === WebSocket.OPEN) {
    connection.webrtc.close();
  }
  
  // Close Vonage connection
  if (connection.vonage && connection.vonage.readyState === WebSocket.OPEN) {
    connection.vonage.close();
  }
  
  // Remove from active connections
  activeConnections.delete(callId);
  
  console.log(`Ended call ${callId}`);
  return true;
}

// Get call information
export function getCallInfo(callId: string) {
  const connection = activeConnections.get(callId);
  
  if (!connection) {
    return null;
  }
  
  return {
    callId: connection.callId,
    vonageCallId: connection.vonageCallId,
    startTime: connection.startTime,
    duration: Math.floor((new Date().getTime() - connection.startTime.getTime()) / 1000),
    hasWebRTC: !!connection.webrtc,
    hasVonage: !!connection.vonage
  };
}

// Get all active calls
export function getAllActiveCalls() {
  const calls = [];
  
  for (const [callId, connection] of activeConnections.entries()) {
    calls.push({
      callId,
      vonageCallId: connection.vonageCallId,
      startTime: connection.startTime,
      duration: Math.floor((new Date().getTime() - connection.startTime.getTime()) / 1000),
      hasWebRTC: !!connection.webrtc,
      hasVonage: !!connection.vonage
    });
  }
  
  return calls;
}