'use client';

import { useState, useEffect, useRef } from 'react';
import { useWebRTC } from './lib/webrtc-client';

// TypeScript interfaces
interface CountryCode {
  code: string;
  country: string;
}

interface CallState {
  isActive: boolean;
  isInitiating?: boolean;
  isEnding?: boolean;
  callId: string | null;
  vonageCallId: string | null;
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
    vonageCallId: null,
    startTime: null,
    duration: 0
  });
  
  // Generate a unique session ID for this page load
  const sessionIdRef = useRef<string>(Math.random().toString(36).substring(2, 15));
  
  // Timer interval reference
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Status check interval reference
  const statusCheckRef = useRef<NodeJS.Timeout | null>(null);
  
  // Initialize WebRTC
  const { 
    isConnected: isWebRTCConnected,
    isConnecting: isWebRTCConnecting,
    initialize: initializeWebRTC,
    disconnect: disconnectWebRTC,
    sendMessage: sendWebRTCMessage
  } = useWebRTC({
    callId: sessionIdRef.current,
    onConnected: () => {
      console.log('WebRTC connected successfully');
    },
    onDisconnected: () => {
      console.log('WebRTC disconnected');
      if (callState.isActive) {
        endCurrentCall();
      }
    },
    onError: (error) => {
      console.error('WebRTC error:', error);
      if (callState.isActive) {
        endCurrentCall(true);
      }
    }
  });
  
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
  
  // Start status check for the call
  const startStatusCheck = (vonageCallId: string) => {
    if (statusCheckRef.current) {
      clearInterval(statusCheckRef.current);
    }
    
    // Check call status every 2 seconds
    statusCheckRef.current = setInterval(async () => {
      try {
        // Use the simplified API endpoint
        const response = await fetch(`/api/call-completed?callId=${vonageCallId}`);
        
        if (response.ok) {
          const data = await response.json();
          
          // If the call is completed according to our records
          if (data.completed) {
            console.log('Call completed, ending call in UI');
            endCurrentCall(true); // Skip API call to avoid "Bad Request"
            return;
          }
        }
      } catch (error) {
        console.error('Error checking call status:', error);
      }
    }, 2000);
  };
  
  
  const stopStatusCheck = () => {
    if (statusCheckRef.current) {
      clearInterval(statusCheckRef.current);
      statusCheckRef.current = null;
    }
  };
  
  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
        
        // Update UI to show we're initiating a call
        setCallState(prev => ({
          ...prev,
          isInitiating: true
        }));
        
        // Initialize WebRTC
        await initializeWebRTC();
        
        // Call our API route to initiate the call
        const response = await fetch('/api/call', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            toNumber: fullNumber,
            sessionId: sessionIdRef.current
          })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          console.log('Call initiated successfully:', data);
          
          // Update call state
          setCallState({
            isActive: true,
            isInitiating: false,
            callId: sessionIdRef.current,
            vonageCallId: data.callId,
            startTime: new Date(),
            duration: 0
          });
          
          // Start the call timer
          startCallTimer();
          
          // Start status check
          startStatusCheck(data.callId);
          
        } else {
          console.error('Error initiating call:', data);
          
          // Disconnect WebRTC if call initiation failed
          disconnectWebRTC();
          
          // Reset call state
          setCallState({
            isActive: false,
            isInitiating: false,
            callId: null,
            vonageCallId: null,
            startTime: null,
            duration: 0
          });
          
          alert(`Error initiating call: ${data.error || 'Unknown error'}`);
        }
      } catch (error) {
        console.error('Error making API call:', error);
        
        // Disconnect WebRTC
        disconnectWebRTC();
        
        // Reset call state
        setCallState({
          isActive: false,
          isInitiating: false,
          callId: null,
          vonageCallId: null,
          startTime: null,
          duration: 0
        });
        
        alert('Failed to initiate call. See console for details.');
      }
    }
  };
  
  const endCurrentCall = async (skipApiCall = false) => {
    if (!callState.vonageCallId && !skipApiCall) {
      console.error('No active call ID to end');
      return;
    }
    
    try {
      // Update UI to show we're ending the call
      setCallState(prev => ({
        ...prev,
        isEnding: true
      }));
      
      // Disconnect WebRTC
      disconnectWebRTC();
      
      // Stop status check
      stopStatusCheck();
      
      // Only make the API call if we're not skipping it
      if (!skipApiCall && callState.vonageCallId) {
        try {
          // First check if the call is already completed
          const checkResponse = await fetch(`/api/call-completed?callId=${callState.vonageCallId}`);
          const checkData = await checkResponse.json();
          
          // Only try to end the call if it's not already completed
          if (!checkData.completed) {
            const response = await fetch('/api/call', {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                callId: callState.vonageCallId
              })
            });
            
            const data = await response.json();
            
            if (response.ok && data.success) {
              console.log('Call ended successfully');
            } else {
              console.error('Error ending call:', data);
            }
          } else {
            console.log('Call already completed, skipping end call API request');
          }
        } catch (error) {
          console.error('Error making end call API call:', error);
        }
      }
    } finally {
      // Regardless of API success, clean up local state
      stopCallTimer();
      
      setCallState({
        isActive: false,
        isInitiating: false,
        isEnding: false,
        callId: null,
        vonageCallId: null,
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
      stopStatusCheck();
      disconnectWebRTC();
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
  
  // Add a listener for beforeunload to clean up active calls
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (callState.isActive && callState.vonageCallId) {
        // Make a synchronous request to end the call
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', '/api/call', false); // false makes it synchronous
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ callId: callState.vonageCallId }));
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [callState.isActive, callState.vonageCallId]);
  
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
            {isWebRTCConnected && (
              <div className="mt-2 text-green-600 text-sm">
                Connected
              </div>
            )}
            {isWebRTCConnecting && (
              <div className="mt-2 text-yellow-600 text-sm">
                Connecting...
              </div>
            )}
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
              : 'bg-green-500 hover:bg-green-600 text-white'
          } ${(callState.isInitiating || callState.isEnding) ? 'opacity-70' : ''}`}
          onClick={handleCall}
          disabled={callState.isInitiating || callState.isEnding}
        >
          <span className="mr-2">
            {callState.isActive ? '⏹' : '☎'}
          </span>
          {callState.isInitiating ? 'Connecting...' : 
           callState.isEnding ? 'Hanging Up...' :
           callState.isActive ? 'Hang Up' : 'Call'}
        </button>
      </div>
    </div>
  );
}