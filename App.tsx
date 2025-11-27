import React, { useState } from 'react';
import { SettingsScreen, LANGUAGES } from './components/SettingsScreen';
import { LiveSession } from './components/LiveSession';
import { LanguageOption } from './types';

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [nativeLang, setNativeLang] = useState<LanguageOption>(LANGUAGES[1]); // Default Chinese
  const [targetLang, setTargetLang] = useState<LanguageOption>(LANGUAGES[0]); // Default English
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const handleStart = (cameraId: string) => {
    setSelectedCameraId(cameraId);
    setHasStarted(true);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans">
      {!hasStarted ? (
        <SettingsScreen
          nativeLang={nativeLang}
          setNativeLang={setNativeLang}
          targetLang={targetLang}
          setTargetLang={setTargetLang}
          onStart={handleStart}
        />
      ) : (
        <LiveSession
          nativeLang={nativeLang}
          targetLang={targetLang}
          cameraId={selectedCameraId}
          onEnd={() => setHasStarted(false)}
        />
      )}
    </div>
  );
};

export default App;