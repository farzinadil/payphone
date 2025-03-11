'use client';

import { useState, useEffect, useRef } from 'react';

// TypeScript interfaces
interface CountryCode {
  code: string;
  country: string;
}

interface CallState {
  isActive: boolean;
  callId: string | null;
  startTime: Date | null;
  duration: number;
}

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [countryCode, setCountryCode] = useState<string>('+1');
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [callState, setCallState] = useState<CallState>({
    isActive: false,
    callId: null,
    startTime: null,
    duration: 0
  });
  
  // Audio stream references
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Timer interval reference
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // List of country codes for the dropdown
  const countryCodes: CountryCode[] = [
    { code: '+1', country: 'USA' },
    { code: '+44', country: 'UK' },
    { code: '+91', country: 'India' },
    { code: '+61', country: 'Australia' },
    { code: '+86', country: 'China' },
    { code: '+49', country: 'Germany' },
    { code: '+33', country: 'France' },
  ];
  
  const handleNumberClick = (num: string | number) => {
    setPhoneNumber(prev => prev + num);
  };
  
  const handleClear = () => {
    setPhoneNumber('');
  };
  
  const handleBackspace = () => {
    setPhoneNumber(prev => prev.slice(0, -1));
  };
  
  const startCallTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    
    timerRef.current = setInterval(() => {
      setCallState(prev => ({
        ...prev,
        duration: prev.startTime ? Math.floor((new Date().getTime() - prev.startTime.getTime()) / 1000) : 0
      }));
    }, 1000);
  };
  
  const stopCallTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  
  const setupAudioStream = async () => {
    try {
      // Request access to the microphone
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      
      // Create an audio context
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;
      
      // Create a source node from the microphone stream
      const sourceNode = audioContext.createMediaStreamSource(stream);
      
      // Connect the source to the audio context destination (speakers)
      // In a real implementation, you would connect this to a WebSocket
      // for streaming to Vonage
      sourceNode.connect(audioContext.destination);
      
      console.log('Audio stream set up successfully');
    } catch (error) {
      console.error('Error setting up audio stream:', error);
      alert('Unable to access microphone. Please check your browser permissions.');
    }
  };
  
  const cleanupAudioStream = () => {
    // Stop all audio tracks
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    
    // Close audio context
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
  };
  
  const handleCall = async () => {
    if (callState.isActive) {
      // End the call if one is active
      await endCurrentCall();
    } else {
      // Start a new call
      if (!phoneNumber || phoneNumber.length < 5) {
        alert('Please enter a valid phone number');
        return;
      }
      
      console.log(`Calling: ${countryCode}${phoneNumber}`);
      
      try {
        // Clean the phone number (remove any non-numeric characters except +)
        const fullNumber = `${countryCode}${phoneNumber}`.replace(/[^0-9+]/g, '');
        
        // Set up audio stream before initiating the call
        await setupAudioStream();
        
        // Call our API route to initiate the call
        const response = await fetch('/api/call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            toNumber: fullNumber
          })
        });
        
        if (response.ok) {
          const data = await response.json();
          console.log('Call initiated successfully:', data);
          
          // Update call state
          setCallState({
            isActive: true,
            callId: data.callId,
            startTime: new Date(),
            duration: 0
          });
          
          // Start the call timer
          startCallTimer();
          
        } else {
          const errorData = await response.json();
          console.error('Error initiating call:', errorData);
          alert(`Error initiating call: ${errorData.error || 'Unknown error'}`);
          
          // Clean up audio resources on error
          cleanupAudioStream();
        }
      } catch (error) {
        console.error('Error making API call:', error);
        alert('Failed to initiate call. See console for details.');
        
        // Clean up audio resources on error
        cleanupAudioStream();
      }
    }
  };
  
  const endCurrentCall = async () => {
    if (!callState.callId) {
      console.error('No active call ID to end');
      return;
    }
    
    try {
      const response = await fetch('/api/call', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: callState.callId
        })
      });
      
      if (response.ok) {
        console.log('Call ended successfully');
      } else {
        const errorData = await response.json();
        console.error('Error ending call:', errorData);
        alert(`Error ending call: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error making end call API call:', error);
    } finally {
      // Regardless of API success, clean up local state
      stopCallTimer();
      cleanupAudioStream();
      
      setCallState({
        isActive: false,
        callId: null,
        startTime: null,
        duration: 0
      });
    }
  };
  
  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountryCode(e.target.value);
  };
  
  // Clean up resources when component unmounts
  useEffect(() => {
    return () => {
      stopCallTimer();
      cleanupAudioStream();
    };
  }, []);
  
  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process if input is focused or component is generally active
      if (!isFocused) return;
      
      // Check if key is a number (0-9) or special keys (* and #)
      if (/^[0-9]$/.test(e.key)) {
        setPhoneNumber(prev => prev + e.key);
      } else if (e.key === '*' || e.key === '#') {
        setPhoneNumber(prev => prev + e.key);
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClear();
      } else if (e.key === 'Enter') {
        handleCall();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused, phoneNumber, callState.isActive]); // Add dependencies
  
  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2">Credit $100.00</h1>
        <h2 className="text-4xl font-bold mb-6">Make Calls</h2>
        
        {/* Call duration display (only shown when call is active) */}
        {callState.isActive && (
          <div className="bg-blue-100 p-3 rounded-md mb-4 text-center">
            <span className="text-xl font-semibold">
              Call Duration: {formatDuration(callState.duration)}
            </span>
          </div>
        )}
        
        {/* Number display with country code dropdown */}
        <div className="flex mb-6">
          <select 
            className="bg-gray-100 p-4 rounded-l-md border-r text-center"
            value={countryCode}
            onChange={handleCountryCodeChange}
            disabled={callState.isActive}
          >
            {countryCodes.map((country) => (
              <option key={country.code} value={country.code}>
                {country.country} {country.code}
              </option>
            ))}
          </select>
          <div 
            className={`bg-gray-100 p-4 rounded-r-md text-center flex-1 ${isFocused ? 'ring-2 ring-blue-300' : ''} ${callState.isActive ? 'opacity-50' : ''}`}
            tabIndex={0}
            onFocus={() => !callState.isActive && setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          >
            <span className="text-2xl">{phoneNumber || 'Enter number'}</span>
          </div>
        </div>
        
        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((num) => (
            <button
              key={num}
              className={`border rounded-md p-4 text-2xl hover:bg-gray-100 ${callState.isActive ? 'opacity-50' : ''}`}
              onClick={() => !callState.isActive && handleNumberClick(num)}
              disabled={callState.isActive}
            >
              {num}
            </button>
          ))}
        </div>
        
        {/* Control buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            className={`border rounded-md p-4 text-xl hover:bg-gray-100 ${callState.isActive ? 'opacity-50' : ''}`}
            onClick={() => !callState.isActive && handleBackspace()}
            disabled={callState.isActive}
          >
            &#9003;
          </button>
          <button
            className={`border rounded-md p-4 text-xl hover:bg-gray-100 ${callState.isActive ? 'opacity-50' : ''}`}
            onClick={() => !callState.isActive && handleClear()}
            disabled={callState.isActive}
          >
            Clear
          </button>
        </div>
        
        {/* Call/Hangup button */}
        <button
          className={`p-4 rounded-md w-full text-xl font-semibold flex items-center justify-center ${
            callState.isActive 
              ? 'bg-red-500 hover:bg-red-600 text-white' 
              : 'bg-green-300 hover:bg-green-400 text-white'
          }`}
          onClick={handleCall}
        >
          <span className="mr-2">
            {callState.isActive ? '⏹' : '☎'}
          </span>
          {callState.isActive ? 'Hang Up' : 'Call'}
        </button>
      </div>
    </div>
  );
}