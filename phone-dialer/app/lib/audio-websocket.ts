'use client';

import { useState, useEffect, useRef } from 'react';

interface AudioWebSocketOptions {
  callId: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onError?: (error: Error) => void;
  onCallEnded?: () => void;
}

export function useAudioWebSocket({
  callId,
  onConnected,
  onDisconnected,
  onError,
  onCallEnded
}: AudioWebSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  
  const websocketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const audioScriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  
  // Initialize and connect to the WebSocket server
  const connect = async () => {
    if (isConnecting || isConnected) return;
    
    try {
      setIsConnecting(true);
      
      // Initialize audio context
      await initAudio();
      
      // Connect to WebSocket
      connectWebSocket();
      
    } catch (error) {
      console.error('Failed to initialize audio WebSocket:', error);
      setIsConnecting(false);
      if (onError) onError(error as Error);
    }
  };
  
  // Initialize audio components
  const initAudio = async () => {
    try {
      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      microphoneStreamRef.current = stream;
      
      // Create audio context
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // Create an audio element for playing incoming audio
      audioPlayerRef.current = new Audio();
      audioPlayerRef.current.autoplay = true;
      
      // Connect microphone to audio context
      audioSourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
      
      // Create script processor for microphone data
      audioScriptProcessorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
      
      // Process audio
      audioScriptProcessorRef.current.onaudioprocess = (e) => {
        // Only send audio if connected
        if (websocketRef.current && websocketRef.current.readyState === WebSocket.OPEN) {
          // Get audio data from input channel
          const inputData = e.inputBuffer.getChannelData(0);
          
          // Convert to 16-bit PCM (what Vonage expects)
          const pcm16 = convertFloat32ToInt16(inputData);
          
          // Send the binary data to the WebSocket
          websocketRef.current.send(pcm16.buffer);
        }
      };
      
      // Connect audio components
      audioSourceRef.current.connect(audioScriptProcessorRef.current);
      audioScriptProcessorRef.current.connect(audioContextRef.current.destination);
      
      console.log('Audio initialization successful');
      
    } catch (error) {
      console.error('Error initializing audio:', error);
      throw error;
    }
  };
  
  // Connect to WebSocket server
  const connectWebSocket = () => {
    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws/browser/${callId}`;
      
      console.log(`Connecting to WebSocket: ${wsUrl}`);
      
      const ws = new WebSocket(wsUrl);
      websocketRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setIsConnecting(false);
        if (onConnected) onConnected();
      };
      
      ws.onmessage = (event) => {
        // Check if the message is binary (audio data) or text (control message)
        if (event.data instanceof Blob) {
          // Handle binary audio data
          handleAudioData(event.data);
        } else {
          // Handle text message
          try {
            const message = JSON.parse(event.data);
            console.log('Received message:', message);
            
            // Check for call ended event
            if (message.event === 'call-ended') {
              console.log('Call ended event received');
              if (onCallEnded) onCallEnded();
            }
            
            // Handle DTMF events
            if (message.event === 'websocket:dtmf') {
              console.log('DTMF received:', message.digit);
              // You can handle DTMF here if needed
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setIsConnecting(false);
        if (onDisconnected) onDisconnected();
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (onError) onError(new Error('WebSocket connection error'));
      };
      
    } catch (error) {
      console.error('Error connecting to WebSocket:', error);
      setIsConnecting(false);
      if (onError) onError(error as Error);
    }
  };
  
  // Handle incoming audio data
  const handleAudioData = async (data: Blob) => {
    try {
      // Convert Blob to ArrayBuffer
      const arrayBuffer = await data.arrayBuffer();
      
      // Queue the audio data
      audioQueueRef.current.push(arrayBuffer);
      
      // If this is the first chunk, start playing
      if (audioQueueRef.current.length === 1) {
        playNextAudioChunk();
      }
    } catch (error) {
      console.error('Error handling audio data:', error);
    }
  };
  
  // Play the next audio chunk in the queue
  const playNextAudioChunk = async () => {
    if (!audioQueueRef.current.length) return;
    
    try {
      const chunk = audioQueueRef.current.shift();
      
      if (!chunk) return;
      
      // Convert the Int16 data to a WAV file that the browser can play
      const wavBlob = createWavFromPcm(chunk);
      
      // Create object URL and play
      const url = URL.createObjectURL(wavBlob);
      
      if (audioPlayerRef.current) {
        audioPlayerRef.current.src = url;
        audioPlayerRef.current.onended = () => {
          URL.revokeObjectURL(url);
          playNextAudioChunk();
        };
        
        audioPlayerRef.current.play().catch(err => {
          console.error('Error playing audio:', err);
          URL.revokeObjectURL(url);
          playNextAudioChunk();
        });
      }
    } catch (error) {
      console.error('Error playing audio chunk:', error);
      // Continue with next chunk
      playNextAudioChunk();
    }
  };
  
  // Convert Float32Array to Int16Array (for PCM 16-bit audio)
  const convertFloat32ToInt16 = (float32Array: Float32Array): Int16Array => {
    const int16Array = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Convert -1.0 - 1.0 to -32768 - 32767
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return int16Array;
  };
  
  // Create a WAV blob from PCM data
  const createWavFromPcm = (pcmBuffer: ArrayBuffer): Blob => {
    const sampleRate = 16000; // Vonage uses 16kHz
    const numChannels = 1; // Mono
    const bitsPerSample = 16;
    
    // Create WAV header
    const headerBuffer = new ArrayBuffer(44);
    const headerView = new DataView(headerBuffer);
    
    // "RIFF" chunk descriptor
    headerView.setUint8(0, 'R'.charCodeAt(0));
    headerView.setUint8(1, 'I'.charCodeAt(0));
    headerView.setUint8(2, 'F'.charCodeAt(0));
    headerView.setUint8(3, 'F'.charCodeAt(0));
    
    // Chunk size (file size - 8)
    headerView.setUint32(4, 36 + pcmBuffer.byteLength, true);
    
    // "WAVE" format
    headerView.setUint8(8, 'W'.charCodeAt(0));
    headerView.setUint8(9, 'A'.charCodeAt(0));
    headerView.setUint8(10, 'V'.charCodeAt(0));
    headerView.setUint8(11, 'E'.charCodeAt(0));
    
    // "fmt " sub-chunk
    headerView.setUint8(12, 'f'.charCodeAt(0));
    headerView.setUint8(13, 'm'.charCodeAt(0));
    headerView.setUint8(14, 't'.charCodeAt(0));
    headerView.setUint8(15, ' '.charCodeAt(0));
    
    // Sub-chunk size (16 for PCM)
    headerView.setUint32(16, 16, true);
    
    // Audio format (1 for PCM)
    headerView.setUint16(20, 1, true);
    
    // Number of channels
    headerView.setUint16(22, numChannels, true);
    
    // Sample rate
    headerView.setUint32(24, sampleRate, true);
    
    // Byte rate: SampleRate * NumChannels * BitsPerSample/8
    headerView.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    
    // Block align: NumChannels * BitsPerSample/8
    headerView.setUint16(32, numChannels * (bitsPerSample / 8), true);
    
    // Bits per sample
    headerView.setUint16(34, bitsPerSample, true);
    
    // "data" sub-chunk
    headerView.setUint8(36, 'd'.charCodeAt(0));
    headerView.setUint8(37, 'a'.charCodeAt(0));
    headerView.setUint8(38, 't'.charCodeAt(0));
    headerView.setUint8(39, 'a'.charCodeAt(0));
    
    // Sub-chunk size (data size)
    headerView.setUint32(40, pcmBuffer.byteLength, true);
    
    // Combine header and PCM data
    const wavBuffer = new Uint8Array(headerBuffer.byteLength + pcmBuffer.byteLength);
    wavBuffer.set(new Uint8Array(headerBuffer), 0);
    wavBuffer.set(new Uint8Array(pcmBuffer), headerBuffer.byteLength);
    
    // Create and return blob
    return new Blob([wavBuffer], { type: 'audio/wav' });
  };
  
  // Disconnect and clean up
  const disconnect = () => {
    // Close WebSocket
    if (websocketRef.current) {
      websocketRef.current.close();
      websocketRef.current = null;
    }
    
    // Stop microphone
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach(track => track.stop());
      microphoneStreamRef.current = null;
    }
    
    // Disconnect audio processing
    if (audioScriptProcessorRef.current) {
      audioScriptProcessorRef.current.disconnect();
      audioScriptProcessorRef.current = null;
    }
    
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();
      audioSourceRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    // Clear audio queue
    audioQueueRef.current = [];
    
    // Set state
    setIsConnected(false);
    setIsConnecting(false);
    
    console.log('Audio WebSocket disconnected and cleaned up');
  };
  
  // Clean up on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);
  
  // Return the public API
  return {
    isConnected,
    isConnecting,
    connect,
    disconnect
  };
}