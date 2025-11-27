export interface LanguageOption {
  id: string;
  name: string;
  flag: string;
}

export interface TranscriptionItem {
  id: string;
  speaker: 'user' | 'model';
  text: string;
  timestamp: number;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
