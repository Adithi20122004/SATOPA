import { useState, useEffect, useRef, useCallback } from 'react';
import type { CapturedFrame } from '../types';

export type CameraErrorType = 'permission_denied' | 'not_found' | 'in_use' | 'generic';

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isActive, setIsActive] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<CameraErrorType | null>(null);
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
    setErrorType(null);
    stopStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setIsLoading(false);
      setErrorType('generic');
      setError('Camera access is not supported or not permitted in this browser context (HTTPS or localhost required). Please upload a test image below.');
      return;
    }

    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    const constraintsList: MediaStreamConstraints[] = [
      // 1. Mobile-optimized rear camera
      ...(isMobile
        ? [
            {
              video: {
                facingMode: { ideal: preferredFacing },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
              },
              audio: false,
            },
            {
              video: {
                facingMode: preferredFacing,
              },
              audio: false,
            },
          ]
        : []),
      // 2. Laptop / general webcam resolution
      {
        video: {
          width: { ideal: 1280, min: 640 },
          height: { ideal: 720, min: 480 },
        },
        audio: false,
      },
      // 3. Fallback to any video input without constraints
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
      } catch (err: any) {
        lastError = err;
        // If permission was explicitly denied, no need to probe other constraints
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          break;
        }
      }
    }

    if (!stream) {
      setIsLoading(false);
      let errType: CameraErrorType = 'generic';
      let errMsg = 'Unable to access camera.';

      if (lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError') {
        errType = 'permission_denied';
        errMsg = 'Camera permission denied. Please click the camera icon in your browser address bar to allow camera access.';
      } else if (lastError?.name === 'NotFoundError' || lastError?.name === 'DevicesNotFoundError') {
        errType = 'not_found';
        errMsg = 'No camera found on this device. Please connect a webcam or upload a test photo below.';
      } else if (lastError?.name === 'NotReadableError' || lastError?.name === 'TrackStartError') {
        errType = 'in_use';
        errMsg = 'Camera is already in use by another application or browser tab. Please close other apps using the camera.';
      } else {
        errMsg = `Camera error (${lastError?.name || 'Error'}): ${lastError?.message || 'Check camera hardware connection'}`;
      }

      setError(errMsg);
      setErrorType(errType);
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      const video = videoRef.current;
      video.srcObject = stream;
      video.setAttribute('playsinline', 'true');
      video.setAttribute('muted', 'true');
      video.muted = true;

      video.onloadedmetadata = () => {
        video.play().catch((e) => {
          console.warn('Auto-play was interrupted or blocked:', e);
        });
      };

      // Also trigger play directly in case metadata was already loaded
      video.play().catch(() => {});
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

  /**
   * Helper to load an image file (e.g. from gallery upload or demo sample) into a CapturedFrame
   */
  const loadFrameFromImageFile = useCallback((fileOrBlob: Blob): Promise<CapturedFrame> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) {
            reject(new Error('Canvas 2D context unavailable'));
            return;
          }
          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve({
            dataUrl,
            blob: fileOrBlob,
            imageData,
            width: canvas.width,
            height: canvas.height,
            timestamp: Date.now(),
          });
        };
        img.onerror = () => reject(new Error('Failed to load image element'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(fileOrBlob);
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
    errorType,
    hasTorch,
    torchOn,
    facingMode,
    startCamera,
    stopStream,
    toggleTorch,
    switchCamera,
    captureFrame,
    loadFrameFromImageFile,
  };
}
