export interface GameMetadata {
  id: string;
  title: string;
  description: string;
  developer: string;
  coverUrl: string;
  heroUrl: string;
  tags: string[];
  size: string;
}

export interface GameEntry extends GameMetadata {
  installed: boolean;
  executablePath?: string;
  installDirectory?: string;
  storeId?: string;
  isCustom?: boolean;
  installDate?: string;
  lastPlayed?: string;
}

export interface GameInstallPayload {
  executablePath: string;
}

export type GameCreatePayload = Omit<
  GameEntry,
  'id' | 'installed' | 'isCustom' | 'installDate' | 'lastPlayed'
> & {
  executablePath: string;
  coverUrl: string;
  heroUrl?: string;
};

export interface StoreGame {
  id: string;
  title: string;
  description: string;
  developer: string;
  coverUrl: string;
  heroUrl?: string;
  tags: string[];
  size?: string;
  downloadUrl: string;
  expectedExecutable?: string;
  createdAt: string;
  downloadStatus?: StoreDownloadStatus;
  libraryEntryId?: string;
}

export type StoreDownloadStatus =
  | { state: 'idle' }
  | { state: 'queued' }
  | { state: 'downloading'; received: number; total?: number; speed?: number }
  | { state: 'extracting'; filePath: string; received?: number; total?: number }
  | {
      state: 'awaitingExtraction';
      filePath: string;
      totalBytes?: number;
      requestedAt: string;
    }
  | {
      state: 'ready';
      filePath: string;
      totalBytes?: number;
      completedAt: string;
      installDirectory: string;
      executablePath: string;
    }
  | { state: 'failed'; message: string; finishedAt: string }
  | { state: 'cancelled'; message: string; finishedAt: string };

export type StoreGameCreatePayload = Omit<StoreGame, 'id' | 'createdAt' | 'downloadStatus'>;

export type DownloadRecordState = StoreDownloadStatus['state'];

export interface DownloadRecord {
  id: string;
  gameId: string;
  title: string;
  sourceUrl: string;
  destinationPath?: string;
  installDirectory?: string;
  executablePath?: string;
  sizeBytes?: number;
  state: DownloadRecordState;
  startedAt: string;
  finishedAt?: string;
  speedHistory: Array<{ timestamp: number; speed: number }>;
  errorMessage?: string;
}

