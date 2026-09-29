import { useState, useEffect, useCallback } from 'react';
import type { GPSCoords } from '../types';

export function useGeolocation() {
  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);

  const updatePosition = useCallback((pos: GeolocationPosition) => {
    const accuracy = pos.coords.accuracy;
    setCoords({
      latitude: Math.round(pos.coords.latitude * 100000) / 100000,
      longitude: Math.round(pos.coords.longitude * 100000) / 100000,
      accuracy: Math.round(accuracy * 10) / 10,
      timestamp: pos.timestamp,
      isLowAccuracy: accuracy > 50, // Flag if accuracy is worse than 50 meters
    });
    setError(null);
    setIsLocating(false);
  }, []);

  const handleError = useCallback((err: GeolocationPositionError) => {
    let msg = 'GPS signal unavailable';
    switch (err.code) {
      case err.PERMISSION_DENIED:
        msg = 'Location permission denied (enable in browser)';
        break;
      case err.POSITION_UNAVAILABLE:
        msg = 'Location unavailable (no GPS/satellite fix)';
        break;
      case err.TIMEOUT:
        msg = 'Location request timed out';
        break;
    }
    setError(msg);
    setIsLocating(false);
  }, []);

  const requestLocation = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported on this browser');
      setIsLocating(false);
      return;
    }
    setIsLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(updatePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 10000,
    });
  }, [updatePosition, handleError]);

  useEffect(() => {
    requestLocation();

    if ('geolocation' in navigator) {
      const watchId = navigator.geolocation.watchPosition(updatePosition, handleError, {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000,
      });

      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    }
  }, [requestLocation, updatePosition, handleError]);

  // Formatted display string for header or audit display
  let statusText = 'Acquiring GPS...';
  if (coords) {
    statusText = `${coords.latitude > 0 ? coords.latitude + '°N' : Math.abs(coords.latitude) + '°S'}, ${
      coords.longitude > 0 ? coords.longitude + '°E' : Math.abs(coords.longitude) + '°W'
    } (±${coords.accuracy}m)`;
  } else if (error) {
    statusText = `GPS unavailable: ${error}`;
  } else if (!isLocating) {
    statusText = 'GPS unavailable';
  }

  return { coords, error, isLocating, statusText, requestLocation };
}
