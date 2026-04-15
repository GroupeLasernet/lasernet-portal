'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Thin wrapper around Google Maps JavaScript API's `places.Autocomplete`.
 *
 * Why not a server-side solution?
 * - The Places JS library attaches a real-time suggestion dropdown to the
 *   input for free, handles debouncing + rendering + keyboard nav, and
 *   billing is per *session* (cheaper than per-keystroke REST calls).
 *
 * How it works:
 * - First mount on the page lazily injects the `places` library script.
 *   Subsequent components reuse the already-loaded `window.google`.
 * - On select, we parse `address_components` into our flat address shape
 *   (street line, city, province, postal code, country) and hand the
 *   whole object back via `onPlaceSelected`. The parent decides how to
 *   persist it (we don't touch state here).
 *
 * No API key or script failure? We silently degrade to a plain input —
 * typing still works, just without suggestions. That matches
 * StreetView's behaviour so dev environments without billing still
 * render the form.
 *
 * We don't pull in `@types/google.maps` because it's a sizeable dev
 * dependency for one file; instead we describe the shapes we actually
 * touch below. Keeps the typecheck strict without extra installs.
 */

interface AddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface PlaceResultLike {
  address_components?: AddressComponent[];
  formatted_address?: string;
  geometry?: { location?: { lat: () => number; lng: () => number } };
}

interface AutocompleteInstance {
  addListener: (eventName: string, handler: () => void) => void;
  getPlace: () => PlaceResultLike;
}

interface AutocompleteCtor {
  new (
    input: HTMLInputElement,
    opts: {
      types?: string[];
      componentRestrictions?: { country: string[] };
      fields?: string[];
    }
  ): AutocompleteInstance;
}

interface PlacesLib {
  Autocomplete: AutocompleteCtor;
}

interface GoogleNS {
  maps?: { places?: PlacesLib };
}

interface ParsedAddress {
  addressLine: string;   // "123 Main St"
  city: string;          // locality / sublocality_level_1
  province: string;      // administrative_area_level_1 (short form, e.g. "QC")
  postalCode: string;    // postal_code
  country: string;       // country (long form)
  formatted: string;     // the full formatted_address
  lat: number | null;
  lng: number | null;
}

interface Props {
  value: string;
  onChange: (next: string) => void;
  onPlaceSelected: (parsed: ParsedAddress) => void;
  /**
   * Fired when the input loses focus. Lets the parent persist a plain
   * typed address when the user doesn't bother picking a suggestion.
   */
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * Country bias codes, e.g. ['ca','us']. Defaults to Canada + US because
   * that covers all of Atelier DSM's clients today. Pass your own list
   * if that changes.
   */
  countryBias?: string[];
}

// Shared loader promise so if several inputs mount simultaneously we only
// inject the script once. Keyed off the api key so a hot-reload pointing
// at a different key still reloads.
let scriptPromise: Promise<void> | null = null;
let loadedKey: string | null = null;

function getGoogle(): GoogleNS | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { google?: GoogleNS }).google;
}

function ensurePlacesScript(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (!apiKey) return Promise.reject(new Error('no-key'));
  if (getGoogle()?.maps?.places) return Promise.resolve();
  if (scriptPromise && loadedKey === apiKey) return scriptPromise;

  loadedKey = apiKey;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-gmaps-places="1"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('script-error')));
      return;
    }
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey
    )}&libraries=places&loading=async`;
    s.async = true;
    s.defer = true;
    s.dataset.gmapsPlaces = '1';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('script-error'));
    document.head.appendChild(s);
  });
  return scriptPromise;
}

function parseComponents(place: PlaceResultLike): ParsedAddress {
  const comps = place.address_components || [];
  const get = (type: string, useShort = false): string => {
    const c = comps.find((x) => x.types.includes(type));
    if (!c) return '';
    return useShort ? c.short_name : c.long_name;
  };

  // Street line is street_number + route — Google splits them.
  const streetNumber = get('street_number');
  const route = get('route');
  const addressLine = [streetNumber, route].filter(Boolean).join(' ');

  // Locality is sometimes missing (rural addresses); fall back to the
  // next-narrowest political division we know about.
  const city =
    get('locality') ||
    get('sublocality_level_1') ||
    get('postal_town') ||
    get('administrative_area_level_2');

  const province = get('administrative_area_level_1', true);
  const postalCode = get('postal_code');
  const country = get('country');

  const loc = place.geometry?.location;
  return {
    addressLine,
    city,
    province,
    postalCode,
    country,
    formatted: place.formatted_address || '',
    lat: loc ? loc.lat() : null,
    lng: loc ? loc.lng() : null,
  };
}

export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelected,
  onBlur,
  disabled = false,
  placeholder,
  className = '',
  countryBias = ['ca', 'us'],
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<AutocompleteInstance | null>(null);
  const [, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
    if (!apiKey) {
      setStatus('error');
      return;
    }
    if (!inputRef.current) return;

    let cancelled = false;
    setStatus('loading');

    ensurePlacesScript(apiKey)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        const places = getGoogle()?.maps?.places;
        if (!places) {
          setStatus('error');
          return;
        }
        const ac = new places.Autocomplete(inputRef.current, {
          types: ['address'],
          componentRestrictions: countryBias.length
            ? { country: countryBias }
            : undefined,
          fields: ['address_components', 'formatted_address', 'geometry'],
        });
        autocompleteRef.current = ac;
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (!place || !place.address_components) return;
          const parsed = parseComponents(place);
          // Sync the visible input to the formatted line immediately so
          // the user sees their selection commit.
          if (parsed.addressLine) onChange(parsed.addressLine);
          onPlaceSelected(parsed);
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
      // Google doesn't expose a destroy() on Autocomplete; dereference
      // so the parent input can be garbage collected. The pac-container
      // dropdown is appended to document.body and gets cleaned up by
      // Google's own listeners when the input is removed.
      autocompleteRef.current = null;
    };
    // countryBias is intentionally not a dep — changing it on the fly
    // would require tearing down the autocomplete, which is not a real
    // use case here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      disabled={disabled}
      placeholder={placeholder || 'Start typing an address…'}
      // Google's autocomplete injects a dropdown with class "pac-container".
      // Setting autoComplete off stops the browser's native dropdown from
      // fighting with it.
      autoComplete="off"
      className={className}
    />
  );
}
