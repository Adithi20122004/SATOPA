import { useState, useEffect, useRef, useCallback } from 'react';
import type { CapturedFrame } from '../types';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState<boolean>(false);
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const startCamera = useCallback(async (preferredFacing: 'environment' | 'user' = facingMode) => {
    setIsLoading(true);
    setError(null);
    stopStream();

    const constraintsList: MediaStreamConstraints[] = [
      // 1. Try high-res rear camera
      {
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      },
      // 2. Fallback to basic facingMode
      {
        video: {
          facingMode: preferredFacing,
        },
        audio: false,
      },
      // 3. Fallback to any video input
      {
        video: true,
        audio: false,
      },
    ];

    let stream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of constraintsList) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      setIsLoading(false);
      const errMsg = lastError?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please enable camera access in your browser settings.'
        : lastError?.name === 'NotFoundError'
        ? 'No camera found on this device.'
        : `Unable to access camera: ${lastError?.message || 'Unknown error'}`;
      setError(errMsg);
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch (e) {
        console.warn('Auto-play was blocked or interrupted:', e);
      }
    }

    // Check torch / flash support
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      const capabilities = (videoTrack.getCapabilities ? videoTrack.getCapabilities() : {}) as any;
      setHasTorch(Boolean(capabilities && capabilities.torch));
    }

    setIsActive(true);
    setIsLoading(false);
  }, [facingMode, stopStream]);

  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const nextState = !torchOn;
      await (track as any).applyConstraints({
        advanced: [{ torch: nextState }],
      });
      setTorchOn(nextState);
    } catch (e) {
      console.warn('Torch toggle failed:', e);
    }
  }, [torchOn]);

  const switchCamera = useCallback(() => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextFacing);
    startCamera(nextFacing);
  }, [facingMode, startCamera]);

  const captureFrame = useCallback((): Promise<CapturedFrame | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) {
        resolve(null);
        return;
      }

      const canvas = document.createElement('canvas');
      const width = video.videoWidth || 1280;
      const height = video.videoHeight || 720;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(null);
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(null);
            return;
          }
          resolve({
            dataUrl,
            blob,
            imageData,
            width,
            height,
            timestamp: Date.now(),
          });
        },
        'image/jpeg',
        0.95
      );
    });
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopStream();
    };
  }, [startCamera, stopStream]);

  return {
    videoRef,
    isActive,
    isLoading,
    error,
    hasTorch,
    torchOn,
    facingMode,
    startCamera,
    stopStream,
    toggleTorch,
    switchCamera,
    captureFrame,
  };
}
