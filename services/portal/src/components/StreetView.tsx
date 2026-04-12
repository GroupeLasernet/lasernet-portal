'use client';

import { useState } from 'react';

interface StreetViewProps {
  address: string;
  city: string;
  province: string;
  postalCode: string;
  className?: string;
}

export default function StreetView({ address, city, province, postalCode, className = '' }: StreetViewProps) {
  const [hasError, setHasError] = useState(false);

  // Build the full address string for the API query
  const fullAddress = [address, city, province, postalCode].filter(Boolean).join(', ');

  // If no address info at all, don't render
  if (!address && !city) return null;

  // Google Street View Static API URL
  // In production, set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in your environment variables
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
  const encodedAddress = encodeURIComponent(fullAddress);

  const streetViewUrl = apiKey
    ? `https://maps.googleapis.com/maps/api/streetview?size=600x300&location=${encodedAddress}&key=${apiKey}`
    : '';

  // Google Maps link for clicking through
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;

  if (!apiKey || hasError) {
    // Fallback: show a styled placeholder with a link to Google Maps
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block relative overflow-hidden rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 ${className}`}
        title="View on Google Maps"
      >
        <div className="flex flex-col items-center justify-center h-full min-h-[160px] p-4 text-center">
          <svg className="w-10 h-10 text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-xs text-gray-500 font-medium">{fullAddress}</p>
          <p className="text-[10px] text-brand-600 mt-1 hover:underline">View on Google Maps</p>
        </div>
      </a>
    );
  }

  return (
    <a
      href={mapsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`block relative overflow-hidden rounded-xl group ${className}`}
      title="View on Google Maps"
    >
      <img
        src={streetViewUrl}
        alt={`Street view of ${fullAddress}`}
        className="w-full h-full object-cover"
        onError={() => setHasError(true)}
      />
      {/* Overlay with address on hover */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
        <div className="p-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <p className="text-white text-xs font-medium drop-shadow-md">{fullAddress}</p>
          <p className="text-white/80 text-[10px] drop-shadow-md">Click to open in Google Maps</p>
        </div>
      </div>
    </a>
  );
}
