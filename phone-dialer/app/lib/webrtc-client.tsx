// app/lib/webrtc-client.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface WebRTCClientProps {
  callId: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
}

// Configuration for STUN/TURN servers
const rtcConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    // Add your TURN servers here for production
  ]
};

export function useWebRTC({ callId, onConnected, onDisconnected, onError }: WebRTCClientProps) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  // Initialize WebRTC connection
  const initializeWebRTC = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      console.log('Initializing WebRTC for call:', callId);
      
      // Get user media (microphone)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      
      // Create peer connection
      const peerConnection = new RTCPeerConnection(rtcConfig);
      peerConnectionRef.current = peerConnection;
      
      // Add local stream tracks to peer connection
      stream.getTracks().forEach(track => {
        peerConnection.addTrack(track, stream);
      });
      
      // Set up event handlers for ICE candidates, connection state changes, etc.
      setupPeerConnectionEvents(peerConnection);
      
      // Connect to signaling server
      connectSignalingServer();
      
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error);
      setIsConnecting(false);
      if (onError) onError(error as Error);
    }
  };
  
  // Set up event handlers for peer connection
  const setupPeerConnectionEvents = (peerConnection: RTCPeerConnection) => {
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        sendToSignalingServer({
          type: 'ice-candidate',
          callId,
          candidate: event.candidate
        });
      }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state changed:', peerConnection.connectionState);
      
      switch (peerConnection.connectionState) {
        case 'connected':
          console.log('WebRTC connected!');
          setIsConnected(true);
          setIsConnecting(false);
          if (onConnected) onConnected();
          break;
          
        case 'disconnected':
        case 'failed':
        case 'closed':
          console.log('WebRTC disconnected');
          setIsConnected(false);
          setIsConnecting(false);
          if (onDisconnected) onDisconnected();
          break;
      }
    };
    
    // Handle incoming tracks (remote audio)
    peerConnection.ontrack = (event) => {
      console.log('Received remote track', event.track.kind);
      
      // Play the remote audio
      const remoteStream = new MediaStream();
      remoteStream.addTrack(event.track);
      
      // Create audio element to play the remote stream
      const audioElement = new Audio();
      audioElement.srcObject = remoteStream;
      audioElement.autoplay = true;
      
      // Add to document to ensure it plays
      document.body.appendChild(audioElement);
      
      // Clean up on track ended
      event.track.onended = () => {
        document.body.removeChild(audioElement);
      };
    };
  };
  
  // Connect to signaling server using WebSocket
  const connectSignalingServer = () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/signaling/${callId}`;
    
    console.log('Connecting to signaling server:', wsUrl);
    
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;
    
    socket.onopen = () => {
      console.log('Connected to signaling server');
      
      // Send join message to initiate the call
      sendToSignalingServer({
        type: 'join',
        callId,
        role: 'caller'
      });
    };
    
    socket.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        await handleSignalingMessage(message);
      } catch (error) {
        console.error('Error processing signaling message:', error);
      }
    };
    
    socket.onclose = () => {
      console.log('Disconnected from signaling server');
      cleanup();
    };
    
    socket.onerror = (error) => {
      console.error('Signaling server error:', error);
      if (onError) onError(new Error('Signaling server connection failed'));
    };
  };
  
  // Handle incoming signaling messages
  const handleSignalingMessage = async (message: any) => {
    if (!peerConnectionRef.current) return;
    
    console.log('Received signaling message:', message.type);
    
    switch (message.type) {
      case 'offer':
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.offer));
        
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        
        sendToSignalingServer({
          type: 'answer',
          callId,
          answer
        });
        break;
        
      case 'answer':
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(message.answer));
        break;
        
      case 'ice-candidate':
        if (message.candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(message.candidate));
        }
        break;
        
      case 'create-offer':
        // Create offer for outbound call
        const offer = await peerConnectionRef.current.createOffer();
        await peerConnectionRef.current.setLocalDescription(offer);
        
        sendToSignalingServer({
          type: 'offer',
          callId,
          offer
        });
        break;
        
      case 'call-ended':
        console.log('Call ended by remote party');
        cleanup();
        break;
    }
  };
  
  // Send message to signaling server
  const sendToSignalingServer = (message: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };
  
  // Clean up resources
  const cleanup = () => {
    console.log('Cleaning up WebRTC resources');
    
    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    // Stop local stream tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    // Close signaling connection
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      socketRef.current = null;
    }
    
    setIsConnected(false);
    setIsConnecting(false);
    
    if (onDisconnected) onDisconnected();
  };
  
  // Expose the API for the component
  return {
    isConnected,
    isConnecting,
    initialize: initializeWebRTC,
    disconnect: cleanup,
    sendMessage: (message: any) => sendToSignalingServer({
      type: 'message',
      callId,
      content: message
    })
  };
}