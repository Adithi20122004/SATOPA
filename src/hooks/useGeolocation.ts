import { useState, useEffect, useCallback } from 'react';
import type { GPSCoords } from '../types';

export function useGeolocation() {
  const [coords, setCoords] = useState<GPSCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(true);

  const updatePosition = useCallback((pos: GeolocationPosition) => {
    const accuracy = pos.coords.accuracy;
    setCoords({
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
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
        msg = 'Location permission denied';
        break;
      case err.POSITION_UNAVAILABLE:
        msg = 'Location unavailable';
        break;
      case err.TIMEOUT:
        msg = 'Location request timed out';
        break;
    }
    setError(msg);
    setIsLocating(false);
  }, []);

  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported on this device');
      setIsLocating(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(updatePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 10000,
    });

    const watchId = navigator.geolocation.watchPosition(updatePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000,
    });

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [updatePosition, handleError]);

  return { coords, error, isLocating };
}
