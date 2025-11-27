import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { TranscriptionItem } from '../types';

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private outputNode: AudioNode | null = null;
  private nextStartTime = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private currentInputTranscription = '';
  private currentOutputTranscription = '';
  
  // Callback hooks
  public onTranscriptionUpdate: ((item: TranscriptionItem) => void) | null = null;
  public onStatusChange: ((status: 'connected' | 'disconnected' | 'error') => void) | null = null;
  public onAudioLevel: ((level: number) => void) | null = null; // Simple visualizer hook

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(nativeLang: string, targetLang: string) {
    this.currentInputTranscription = '';
    this.currentOutputTranscription = '';
    
    // Initialize Audio Contexts
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.outputAudioContext.createGain();
    this.outputNode.connect(this.outputAudioContext.destination);

    const systemInstruction = `
      You are an advanced, real-time language tutor. 
      The user is looking at the world through their camera.
      
      User's Native Language: ${nativeLang}
      Target Learning Language: ${targetLang}

      Your Goal:
      1. Describe what you see in the video stream in the ${targetLang}.
      2. If the user asks a question, answer in ${targetLang}.
      3. Keep descriptions concise and natural, like a local friend pointing things out.
      4. If the object is complex, you may provide a very brief translation in ${nativeLang} strictly for clarity, but prioritize ${targetLang}.
      5. Encourage the user to repeat words if appropriate.
    `;

    try {
      this.sessionPromise = this.ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            console.log('Gemini Live Session Opened');
            this.onStatusChange?.('connected');
            this.startAudioInput();
          },
          onmessage: (message: LiveServerMessage) => this.handleMessage(message),
          onclose: (e) => {
            console.log('Gemini Live Session Closed', e);
            this.onStatusChange?.('disconnected');
          },
          onerror: (e) => {
            console.error('Gemini Live Session Error', e);
            this.onStatusChange?.('error');
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction: systemInstruction,
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          inputAudioTranscription: {}, // Corrected: Empty object to enable default model
          outputAudioTranscription: {}, // Corrected: Empty object to enable default model
        },
      });
    } catch (error) {
      console.error("Connection failed", error);
      this.onStatusChange?.('error');
    }
  }

  private async startAudioInput() {
    if (!this.inputAudioContext || !this.sessionPromise) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this.inputAudioContext.createMediaStreamSource(stream);
      const scriptProcessor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

      scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
        
        // Simple visualizer calculation
        let sum = 0;
        for (let i = 0; i < inputData.length; i++) {
            sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / inputData.length);
        this.onAudioLevel?.(rms); // Notify UI

        const pcmBlob = this.createBlob(inputData);
        
        this.sessionPromise?.then((session) => {
          session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(scriptProcessor);
      scriptProcessor.connect(this.inputAudioContext.destination);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      this.onStatusChange?.('error');
    }
  }

  public async sendVideoFrame(base64Data: string) {
    if (!this.sessionPromise) return;
    this.sessionPromise.then((session) => {
      session.sendRealtimeInput({
        media: { data: base64Data, mimeType: 'image/jpeg' }
      });
    });
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Transcription
    if (message.serverContent?.outputTranscription) {
      this.currentOutputTranscription += message.serverContent.outputTranscription.text;
    } else if (message.serverContent?.inputTranscription) {
      this.currentInputTranscription += message.serverContent.inputTranscription.text;
    }

    if (message.serverContent?.turnComplete) {
      if (this.currentInputTranscription.trim()) {
        this.onTranscriptionUpdate?.({
            id: Date.now().toString() + '-user',
            speaker: 'user',
            text: this.currentInputTranscription,
            timestamp: Date.now()
        });
        this.currentInputTranscription = '';
      }
      if (this.currentOutputTranscription.trim()) {
        this.onTranscriptionUpdate?.({
            id: Date.now().toString() + '-ai',
            speaker: 'model',
            text: this.currentOutputTranscription,
            timestamp: Date.now()
        });
        this.currentOutputTranscription = '';
      }
    }

    // 2. Handle Audio Output
    const base64EncodedAudioString = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64EncodedAudioString && this.outputAudioContext && this.outputNode) {
        // Just for visualizer feedback on output (simulated by non-zero level)
        this.onAudioLevel?.(0.3); 

        this.nextStartTime = Math.max(this.nextStartTime, this.outputAudioContext.currentTime);
        
        const audioBuffer = await this.decodeAudioData(
            this.decode(base64EncodedAudioString),
            this.outputAudioContext,
            24000,
            1
        );
        
        const source = this.outputAudioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.outputNode);
        source.addEventListener('ended', () => {
            this.sources.delete(source);
            this.onAudioLevel?.(0); // Reset visualizer
        });

        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
        this.sources.add(source);
    }

    // 3. Handle Interruption
    const interrupted = message.serverContent?.interrupted;
    if (interrupted) {
        console.log("Interrupted by user");
        for (const source of this.sources.values()) {
            source.stop();
            this.sources.delete(source);
        }
        this.nextStartTime = 0;
        this.currentOutputTranscription = ''; // Clear pending text on interrupt
    }
  }

  public disconnect() {
    if (this.sessionPromise) {
      this.sessionPromise.then(session => session.close());
    }
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    this.sessionPromise = null;
    this.onStatusChange?.('disconnected');
  }

  // --- Helpers ---

  private createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    return {
      data: this.encode(new Uint8Array(int16.buffer)),
      mimeType: 'audio/pcm;rate=16000',
    };
  }

  private encode(bytes: Uint8Array) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private decode(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  private async decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
            channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
    }
    return buffer;
  }
}

export const geminiLiveService = new GeminiLiveService();