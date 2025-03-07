"use client";

import React, { useState, useEffect, ChangeEventHandler } from "react";
import { makeCall } from "./lib/actions";

export default function Home() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [countryCode, setCountryCode] = useState("+1");
  const [isFocused, setIsFocused] = useState(false);

  // List of country codes for the dropdown
  const countryCodes = [
    { code: "+1", country: "USA" },
    { code: "+44", country: "UK" },
    { code: "+91", country: "India" },
    { code: "+61", country: "Australia" },
    { code: "+86", country: "China" },
    { code: "+49", country: "Germany" },
    { code: "+33", country: "France" },
  ];

  const handleNumberClick = (num: string | number) => {
    setPhoneNumber((prev) => prev + num);
  };

  const handleClear = () => {
    setPhoneNumber("");
  };

  const handleBackspace = () => {
    setPhoneNumber((prev) => prev.slice(0, -1));
  };

  const handleCall = () => makeCall(countryCode, phoneNumber);

  const handleCountryCodeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountryCode(e.target.value);
  };

  // Handle keyboard input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only process if input is focused or component is generally active
      if (!isFocused) return;

      // Check if key is a number (0-9) or special keys (* and #)
      if (/^[0-9]$/.test(e.key)) {
        setPhoneNumber((prev) => prev + e.key);
      } else if (e.key === "*" || e.key === "#") {
        setPhoneNumber((prev) => prev + e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Escape") {
        handleClear();
      } else if (e.key === "Enter") {
        handleCall();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFocused, phoneNumber]);

  return (
    <div className="flex justify-center items-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-3xl font-bold mb-2">Credit $100.00</h1>
        <h2 className="text-4xl font-bold mb-6">Make Calls</h2>

        {/* Number display with country code dropdown */}
        <div className="flex mb-6">
          <select
            className="bg-gray-100 p-4 rounded-l-md border-r text-center"
            value={countryCode}
            onChange={handleCountryCodeChange}
          >
            {countryCodes.map((country) => (
              <option key={country.code} value={country.code}>
                {country.country} {country.code}
              </option>
            ))}
          </select>
          <div
            className={`bg-gray-100 p-4 rounded-r-md text-center flex-1 ${
              isFocused ? "ring-2 ring-blue-300" : ""
            }`}
            tabIndex={0}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
          >
            <span className="text-2xl">{phoneNumber || "Enter number"}</span>
          </div>
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, "*", 0, "#"].map((num) => (
            <button
              key={num}
              className="border rounded-md p-4 text-2xl hover:bg-gray-100"
              onClick={() => handleNumberClick(num)}
            >
              {num}
            </button>
          ))}
        </div>

        {/* Control buttons */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <button
            className="border rounded-md p-4 text-xl hover:bg-gray-100"
            onClick={handleBackspace}
          >
            &#9003;
          </button>
          <button
            className="border rounded-md p-4 text-xl hover:bg-gray-100"
            onClick={handleClear}
          >
            Clear
          </button>
        </div>

        {/* Call button */}
        <button
          className="bg-green-300 text-white p-4 rounded-md w-full text-xl font-semibold flex items-center justify-center"
          disabled={phoneNumber.length < 10}
          onClick={handleCall}
        >
          <span className="mr-2">&#9742;</span> Call
        </button>
      </div>
    </div>
  );
}
