import React, { useEffect, useState } from 'react';
import { LanguageOption } from '../types';
import { Play, Camera, RefreshCw, Check, AlertCircle } from 'lucide-react';

interface SettingsScreenProps {
  nativeLang: LanguageOption;
  setNativeLang: (lang: LanguageOption) => void;
  targetLang: LanguageOption;
  setTargetLang: (lang: LanguageOption) => void;
  onStart: (cameraId: string) => void;
}

export const LANGUAGES: LanguageOption[] = [
  { id: 'en', name: 'English', flag: '🇺🇸' },
  { id: 'zh', name: 'Chinese (Mandarin)', flag: '🇨🇳' },
  { id: 'es', name: 'Spanish', flag: '🇪🇸' },
  { id: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { id: 'fr', name: 'French', flag: '🇫🇷' },
  { id: 'de', name: 'German', flag: '🇩🇪' },
  { id: 'ko', name: 'Korean', flag: '🇰🇷' },
  { id: 'it', name: 'Italian', flag: '🇮🇹' },
];

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  nativeLang,
  setNativeLang,
  targetLang,
  setTargetLang,
  onStart,
}) => {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkPermissionsAndListDevices();
  }, []);

  const checkPermissionsAndListDevices = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      // 1. Explicitly request permission first.
      // We start a stream just to trigger the prompt and ensure the browser "trusts" us.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      
      // Stop the stream immediately, we just needed permissions.
      stream.getTracks().forEach(t => t.stop());
      
      setPermissionGranted(true);
      
      // 2. Enumerate devices
      // Wait a tick to ensure the OS registers the permissions for enumeration
      await new Promise(resolve => setTimeout(resolve, 500)); 
      
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      
      setDevices(videoDevices);
      
      if (videoDevices.length > 0) {
        // Smart Selection Logic
        let bestDevice = videoDevices[0];
        
        // If we already have a selection that is still valid, keep it
        const currentStillExists = videoDevices.find(d => d.deviceId === selectedDeviceId);
        
        if (currentStillExists) {
            bestDevice = currentStillExists;
        } else {
             // Prefer Continuity Camera / iPhone
             const continuity = videoDevices.find(d => 
                 d.label.toLowerCase().includes('iphone') || 
                 d.label.toLowerCase().includes('continuity')
             );
             
             // Prefer Back Camera on mobile
             const back = videoDevices.find(d => 
                 d.label.toLowerCase().includes('back') || 
                 d.label.toLowerCase().includes('environment')
             );

             if (continuity) bestDevice = continuity;
             else if (back) bestDevice = back;
        }

        setSelectedDeviceId(bestDevice.deviceId);
      } else {
          // No devices found even though permission granted?
          setErrorMsg("No cameras found. Please connect a camera.");
      }

    } catch (err: any) {
      console.error("Permission check failed", err);
      setPermissionGranted(false);
      
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMsg("Access denied. Please enable Camera & Microphone permissions in your browser settings.");
      } else if (err.name === 'NotFoundError') {
          setErrorMsg("No camera or microphone found.");
      } else {
          setErrorMsg("Could not access devices: " + err.message);
      }
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-6 text-white font-sans">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
            <span className="text-4xl">👁️</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">LingoLens AI</h1>
          <p className="text-gray-400">Real-time visual language tutor</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Language Settings */}
          <div className="space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>🗣️</span> Languages
            </h2>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">I speak</label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.slice(0, 4).map((lang) => (
                  <button
                    key={`native-${lang.id}`}
                    onClick={() => setNativeLang(lang)}
                    className={`flex items-center space-x-2 p-2 rounded-lg border text-sm transition-all duration-200 ${
                      nativeLang.id === lang.id
                        ? 'bg-blue-600/20 border-blue-500 text-white'
                        : 'bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">I want to learn</label>
              <div className="grid grid-cols-2 gap-2">
                {LANGUAGES.map((lang) => (
                  <button
                    key={`target-${lang.id}`}
                    onClick={() => setTargetLang(lang)}
                    className={`flex items-center space-x-2 p-2 rounded-lg border text-sm transition-all duration-200 ${
                      targetLang.id === lang.id
                        ? 'bg-purple-600/20 border-purple-500 text-white'
                        : 'bg-gray-800/50 border-transparent text-gray-400 hover:bg-gray-800'
                    }`}
                  >
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Camera Settings */}
          <div className="space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm flex flex-col">
             <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Camera size={20} className="text-blue-400" /> Camera Source
                </h2>
                <button 
                    onClick={checkPermissionsAndListDevices} 
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                    title="Refresh Devices"
                >
                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                </button>
             </div>

            <div className="flex-1 flex flex-col justify-center space-y-4">
              {errorMsg ? (
                 <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col items-center text-center">
                    <AlertCircle className="text-red-400 mb-2" size={24} />
                    <p className="text-sm text-red-200 mb-3">{errorMsg}</p>
                    <button 
                        onClick={checkPermissionsAndListDevices}
                        className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-colors uppercase tracking-wide"
                    >
                        Retry Access
                    </button>
                 </div>
              ) : !permissionGranted && !isLoading ? (
                <div className="text-center p-4">
                  <p className="text-sm text-gray-400 mb-4">We need access to your camera and microphone.</p>
                  <button 
                    onClick={checkPermissionsAndListDevices}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    Enable Access
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Select Device</label>
                    <div className="relative">
                      <select 
                        value={selectedDeviceId} 
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        disabled={devices.length === 0}
                        className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-xl p-3 pr-10 appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none disabled:opacity-50"
                      >
                        {devices.length === 0 ? (
                            <option>No cameras found</option>
                        ) : (
                            devices.map((d, idx) => (
                            <option key={d.deviceId} value={d.deviceId}>
                                {d.label || `Camera ${idx + 1}`}
                            </option>
                            ))
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                        <Camera size={14} />
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-blue-500/20 p-1 rounded-full">
                         <Check size={12} className="text-blue-400" />
                      </div>
                      <div className="text-xs text-blue-200/80 leading-relaxed">
                        <strong className="text-blue-400 block mb-1">Mac User Tip:</strong>
                        To use your iPhone (Continuity Camera), ensure it is near your Mac, WiFi/Bluetooth are on, and you are signed into iCloud.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={() => onStart(selectedDeviceId)}
          disabled={!permissionGranted}
          className={`w-full font-bold text-lg py-4 rounded-full transition-all flex items-center justify-center space-x-2 shadow-xl ${
            permissionGranted 
            ? 'bg-white text-black hover:bg-gray-200 shadow-white/10' 
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Play size={24} fill="currentColor" />
          <span>Start Session</span>
        </button>
      </div>
    </div>
  );
};