import React, { useEffect, useRef, useState, useCallback } from 'react';
import { geminiLiveService } from '../services/geminiLiveService';
import { LanguageOption, ConnectionStatus, TranscriptionItem } from '../types';
import { Mic, MicOff, X, MessageSquare, Camera, Loader2, AlertCircle } from 'lucide-react';

interface LiveSessionProps {
  nativeLang: LanguageOption;
  targetLang: LanguageOption;
  cameraId?: string;
  onEnd: () => void;
}

export const LiveSession: React.FC<LiveSessionProps> = ({ nativeLang, targetLang, cameraId, onEnd }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<TranscriptionItem[]>([]);
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(true);

  // Helper to convert blob to base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, _) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // Remove data URL prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.readAsDataURL(blob);
    });
  };

  // Start Gemini Connection
  useEffect(() => {
    const startService = async () => {
      geminiLiveService.onStatusChange = (s) => setStatus(s);
      
      geminiLiveService.onTranscriptionUpdate = (item) => {
        setTranscripts(prev => [...prev, item]);
      };
      
      geminiLiveService.onAudioLevel = (level) => {
        setAudioLevel(prev => (prev * 0.8) + (level * 0.2));
      };

      await geminiLiveService.connect(nativeLang.name, targetLang.name);
    };

    startService();

    return () => {
      geminiLiveService.disconnect();
    };
  }, [nativeLang, targetLang]); 

  // Start Camera with robust Fallback
  useEffect(() => {
    const initCamera = async () => {
      setCameraError(null);
      
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }

      try {
        let stream: MediaStream | null = null;
        
        // 1. Try Specific Camera ID (if provided)
        if (cameraId) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        deviceId: { exact: cameraId },
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                });
                console.log("Connected to specific camera:", cameraId);
            } catch (err) {
                console.warn("Failed to connect to specific camera ID, trying fallback.", err);
            }
        }

        // 2. Fallback: Environment (Back) Camera
        if (!stream) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    }
                });
                console.log("Connected to environment camera");
            } catch (err) {
                console.warn("Failed to connect to environment camera.", err);
            }
        }

        // 3. Fallback: Any Video Source (System Default)
        if (!stream) {
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                console.log("Connected to default system camera");
            } catch (err) {
                console.error("Critical: No camera accessible.", err);
                throw new Error("No camera found or permission denied.");
            }
        }

        // Assign stream
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }

      } catch (err: any) {
          setCameraError(err.message || "Could not access camera.");
          setStatus('error');
      }
    };

    initCamera();

    return () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
        }
    };
  }, [cameraId]);

  // Video Frame Loop
  useEffect(() => {
    if (status !== 'connected' || cameraError) return;

    const intervalId = setInterval(async () => {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        // Only draw if we actually have video dimensions
        if (video.readyState >= 2 && video.videoWidth > 0 && ctx) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(async (blob) => {
            if (blob) {
              const base64 = await blobToBase64(blob);
              geminiLiveService.sendVideoFrame(base64);
            }
          }, 'image/jpeg', 0.5); // 50% quality is sufficient for AI analysis
        }
      }
    }, 600); // ~1.5 FPS

    return () => clearInterval(intervalId);
  }, [status, cameraError]);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts, showTranscript]);

  const handleEndSession = useCallback(() => {
      geminiLiveService.disconnect();
      onEnd();
  }, [onEnd]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden flex flex-col font-sans">
      <canvas ref={canvasRef} className="hidden" />

      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover"
      />

      {/* Overlay: Header */}
      <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent z-10 flex justify-between items-start">
        <div className="flex flex-col">
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{targetLang.flag}</span>
            <span className="font-bold text-white drop-shadow-md">Learning {targetLang.name}</span>
          </div>
          <div className="flex items-center space-x-2 mt-1">
             <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
             <span className="text-xs text-gray-300 font-medium uppercase tracking-wider">
                {status === 'connected' ? 'LIVE' : status}
             </span>
          </div>
        </div>
        
        <button 
          onClick={handleEndSession}
          className="bg-red-500/20 hover:bg-red-500/40 backdrop-blur-md p-3 rounded-full text-red-500 hover:text-white transition-all border border-red-500/30"
        >
          <X size={24} />
        </button>
      </div>

      {/* Center Feedback */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
        {status === 'connecting' && !cameraError && (
            <div className="bg-black/60 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center space-y-4 border border-white/10">
                <Loader2 size={48} className="animate-spin text-blue-500" />
                <span className="text-white font-medium">Connecting to AI Tutor...</span>
            </div>
        )}

        {(status === 'error' || cameraError) && (
             <div className="bg-red-900/90 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center space-y-4 border border-red-500/30 max-w-xs text-center pointer-events-auto">
                <AlertCircle size={48} className="text-red-300" />
                <span className="text-white font-medium">Connection Issue</span>
                <p className="text-sm text-red-200">
                    {cameraError || "Unable to connect to Gemini Live API."}
                </p>
                <button onClick={handleEndSession} className="mt-4 bg-white/10 hover:bg-white/20 px-4 py-2 rounded-lg text-sm border border-white/10 transition-colors">
                    Back to Settings
                </button>
            </div>
        )}
        
        {/* Subtle audio ripple */}
        {status === 'connected' && audioLevel > 0.05 && (
            <div 
                className="w-32 h-32 bg-white/10 rounded-full blur-2xl transition-all duration-75"
                style={{ transform: `scale(${1 + audioLevel * 5})`, opacity: audioLevel * 2 }}
            />
        )}
      </div>

      {/* Bottom Area */}
      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-col justify-end">
        
        {/* Transcript Area */}
        {showTranscript && (
          <div className="w-full max-h-[40vh] overflow-y-auto p-4 space-y-3 bg-gradient-to-t from-black via-black/80 to-transparent" ref={scrollRef}>
             {transcripts.map((t) => (
               <div 
                 key={t.id} 
                 className={`flex ${t.speaker === 'user' ? 'justify-end' : 'justify-start'}`}
               >
                 <div 
                    className={`max-w-[80%] p-3 rounded-2xl backdrop-blur-md border ${
                        t.speaker === 'user' 
                        ? 'bg-gray-800/60 border-gray-700 text-gray-200 rounded-tr-none' 
                        : 'bg-blue-900/40 border-blue-500/30 text-white rounded-tl-none shadow-lg shadow-blue-900/20'
                    }`}
                 >
                    <p className="text-sm md:text-base leading-relaxed">{t.text}</p>
                 </div>
               </div>
             ))}
          </div>
        )}

        {/* Controls Bar */}
        <div className="p-6 pb-8 flex items-center justify-center space-x-8 bg-black/40 backdrop-blur-sm border-t border-white/10">
          
          <button 
            onClick={() => setShowTranscript(!showTranscript)}
            className={`p-4 rounded-full transition-all ${showTranscript ? 'bg-white text-black' : 'bg-gray-800 text-gray-400'}`}
          >
            <MessageSquare size={24} />
          </button>

          {/* Main Visualizer */}
          <div className="relative">
             <div 
                className="absolute inset-0 bg-blue-500 rounded-full blur-lg transition-all duration-100" 
                style={{ 
                    opacity: isMuted ? 0 : 0.3 + (audioLevel * 3),
                    transform: `scale(${1 + audioLevel})` 
                }} 
             />
             <div className="relative z-10 w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-xl shadow-blue-500/20 border-4 border-gray-900">
                <Camera size={32} className="text-gray-900" />
             </div>
          </div>

          <button 
             onClick={() => setIsMuted(!isMuted)}
             className={`p-4 rounded-full transition-all ${isMuted ? 'bg-red-500/20 text-red-500' : 'bg-gray-800 text-white'}`}
          >
            {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
          </button>
        </div>
      </div>
    </div>
  );
};