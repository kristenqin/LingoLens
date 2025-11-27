import React, { useEffect, useState } from 'react';
import { LanguageOption } from '../types';
import { Play, Camera, RefreshCw, AlertCircle, Smartphone, Mic, HelpCircle } from 'lucide-react';

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
  const [permissionState, setPermissionState] = useState<'idle' | 'granted' | 'denied' | 'prompt'>('idle');
  const [errorDetails, setErrorDetails] = useState<{ type: 'camera' | 'mic' | 'both' | 'unknown'; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    runFullDeviceCheck();
  }, []);

  const runFullDeviceCheck = async () => {
    setIsLoading(true);
    setErrorDetails(null);
    setPermissionState('idle');

    try {
      // 1. 尝试直接获取列表
      const initialDevices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = initialDevices.some(d => d.kind === 'videoinput' && d.label);
      const hasAudio = initialDevices.some(d => d.kind === 'audioinput' && d.label);

      if (hasVideo && hasAudio) {
        // 一切正常，已有权限
        setDevices(initialDevices.filter(d => d.kind === 'videoinput'));
        setPermissionState('granted');
        smartSelectDevice(initialDevices.filter(d => d.kind === 'videoinput'));
      } else {
        // 2. 需要请求权限或唤醒设备
        await requestPermissionsAndWakeUp();
      }
    } catch (err: any) {
      console.error("Device check failed:", err);
      // 这里的 catch 通常由 requestPermissionsAndWakeUp 抛出
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermissionsAndWakeUp = async () => {
    try {
      // 尝试同时请求（最理想体验）
      console.log("Requesting both camera and mic...");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      stream.getTracks().forEach(t => t.stop()); // 成功拿到，立即释放
      
      // 重新获取列表
      const newDevices = await navigator.mediaDevices.enumerateDevices();
      setDevices(newDevices.filter(d => d.kind === 'videoinput'));
      setPermissionState('granted');
      smartSelectDevice(newDevices.filter(d => d.kind === 'videoinput'));
      
    } catch (err: any) {
      // 3. 诊断模式：如果是 NotFoundError，我们需要知道到底是缺相机还是缺麦克风
      // 这对 Mac Mini 用户至关重要
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
         await diagnoseMissingDevice();
      } else if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
         setPermissionState('denied');
         setErrorDetails({ type: 'both', msg: "权限被拒绝。请点击浏览器地址栏左侧的图标，重置摄像头和麦克风权限。" });
      } else {
         setErrorDetails({ type: 'unknown', msg: err.message || "未知错误" });
      }
    }
  };

  // 诊断到底是缺相机还是缺麦克风
  const diagnoseMissingDevice = async () => {
      let cameraOk = false;
      let micOk = false;

      // 检查相机
      try {
          const s = await navigator.mediaDevices.getUserMedia({ video: true });
          s.getTracks().forEach(t => t.stop());
          cameraOk = true;
      } catch (e) { console.warn("Diagnose: Camera failed", e); }

      // 检查麦克风
      try {
          const s = await navigator.mediaDevices.getUserMedia({ audio: true });
          s.getTracks().forEach(t => t.stop());
          micOk = true;
      } catch (e) { console.warn("Diagnose: Mic failed", e); }

      if (!cameraOk && !micOk) {
          setErrorDetails({ 
              type: 'both', 
              msg: "既未检测到相机，也未检测到麦克风。Mac Mini 用户请确保 iPhone 已解锁并靠近（连续互通相机），且已连接耳机或麦克风。" 
          });
      } else if (!cameraOk) {
          setErrorDetails({ 
              type: 'camera', 
              msg: "未找到相机。请确保 iPhone 靠近 Mac 并已解锁（连续互通相机），或连接 USB 摄像头。" 
          });
          // 哪怕没相机，也可以先把麦克风权限状态记录下来（虽然我们应用强依赖相机）
      } else if (!micOk) {
          setErrorDetails({ 
              type: 'mic', 
              msg: "检测到相机，但未找到麦克风！Mac Mini 通常没有内置麦克风。请连接耳机，或在系统声音设置中将 iPhone 选为输入设备。" 
          });
          // 虽然有相机，但没麦克风我们也无法进行语音对话，所以视为错误
          // 但我们可以先列出相机让用户看着开心一下
          const d = await navigator.mediaDevices.enumerateDevices();
          setDevices(d.filter(k => k.kind === 'videoinput'));
          if(d.filter(k => k.kind === 'videoinput').length > 0) {
             smartSelectDevice(d.filter(k => k.kind === 'videoinput'));
          }
      }
  };

  const smartSelectDevice = (videoDevices: MediaDeviceInfo[]) => {
      if (videoDevices.length === 0) return;
      
      let best = videoDevices[0];
      // 优先找 iPhone
      const iphone = videoDevices.find(d => 
          d.label.toLowerCase().includes('iphone') || 
          d.label.toLowerCase().includes('continuity')
      );
      if (iphone) best = iphone;
      
      setSelectedDeviceId(best.deviceId);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-950 p-6 text-white font-sans">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-3xl mx-auto flex items-center justify-center mb-6 shadow-lg shadow-blue-500/20">
            <span className="text-4xl">👁️</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">LingoLens AI</h1>
          <p className="text-gray-400">您的实时视觉语言私教</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Language Settings */}
          <div className="space-y-6 bg-gray-900/50 p-6 rounded-2xl border border-gray-800 backdrop-blur-sm">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <span>🗣️</span> 语言设置
            </h2>
            
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">我的母语</label>
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
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">我想学习</label>
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
                    <Camera size={20} className="text-blue-400" /> 设备调试
                </h2>
                <button 
                    onClick={runFullDeviceCheck} 
                    className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition-colors"
                    title="重新检测"
                >
                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                </button>
             </div>

            <div className="flex-1 flex flex-col justify-center space-y-4">
              
              {/* Error Display Area */}
              {errorDetails && (
                 <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex flex-col text-left">
                    <div className="flex items-center gap-2 mb-2 text-red-400">
                        <AlertCircle size={20} />
                        <span className="font-bold text-sm">连接失败</span>
                    </div>
                    <p className="text-sm text-red-200 mb-4 leading-relaxed">
                        {errorDetails.msg}
                    </p>
                    <button 
                        onClick={runFullDeviceCheck}
                        className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-colors uppercase tracking-wide flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={12} /> 强制唤醒 / 重试
                    </button>
                 </div>
              )}

              {/* Permission Prompt Area */}
              {!errorDetails && permissionState !== 'granted' && !isLoading && (
                <div className="text-center p-4 bg-gray-800/30 rounded-xl">
                  <p className="text-sm text-gray-300 mb-4 leading-relaxed">
                    我们需要访问您的<br/>
                    <span className="text-blue-400 font-bold">摄像头</span> 和 <span className="text-blue-400 font-bold">麦克风</span>
                  </p>
                  <button 
                    onClick={runFullDeviceCheck}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-600/20"
                  >
                    授权并检测设备
                  </button>
                </div>
              )}

              {/* Success Area: Device Selection */}
              {devices.length > 0 && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">选择视频输入</label>
                    <div className="relative">
                      <select 
                        value={selectedDeviceId} 
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-xl p-3 pr-10 appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                      >
                        {devices.map((d, idx) => (
                          <option key={d.deviceId} value={d.deviceId}>
                            {d.label || `Camera ${idx + 1}`}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-gray-400">
                        <Camera size={14} />
                      </div>
                    </div>
                  </div>

                  {/* Continuity Camera Helper */}
                  <div className="bg-blue-900/10 border border-blue-500/20 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 bg-blue-500/20 p-1 rounded-full shrink-0">
                         <Smartphone size={14} className="text-blue-400" />
                      </div>
                      <div className="text-xs text-blue-200/80 leading-relaxed">
                        <strong className="text-blue-400 block mb-1">Mac Mini 用户提示:</strong>
                        如果在列表中未看到 iPhone：
                        1. 解锁 iPhone 并横屏放置。
                        2. 确保它靠近电脑且开启蓝牙。
                        3. 点击上方的刷新按钮。
                        <br/>
                        <span className="text-yellow-500/80 mt-1 block">注意：必须同时有麦克风输入才能开始。</span>
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
          disabled={!selectedDeviceId || permissionState !== 'granted'}
          className={`w-full font-bold text-lg py-4 rounded-full transition-all flex items-center justify-center space-x-2 shadow-xl ${
            (selectedDeviceId && permissionState === 'granted')
            ? 'bg-white text-black hover:bg-gray-200 shadow-white/10 transform hover:scale-[1.01]' 
            : 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50'
          }`}
        >
          <Play size={24} fill="currentColor" />
          <span>开始学习 (Start Session)</span>
        </button>
      </div>
    </div>
  );
};
