export interface ElectronAPI {
  launchGame: (executablePath: string) => Promise<{ success: boolean; message?: string }>;
  selectExecutable: () => Promise<
    | { canceled: true }
    | {
        canceled: false;
        filePath: string;
      }
  >;
  validateExecutable: (
    executablePath: string,
  ) => Promise<
    | {
        success: true;
        filePath: string;
      }
    | {
        success: false;
        message: string;
      }
  >;
  openExternal: (url: string) => Promise<{ success: boolean; message?: string }>;
  startStoreDownload: (payload: {
    gameId: string;
    url: string;
    fileName: string;
    expectedExecutable?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onStoreDownloadProgress: (
    listener: (event: {
      gameId: string;
      state:
        | 'queued'
        | 'downloading'
        | 'extracting'
        | 'ready'
        | 'failed'
        | 'cancelled'
        | 'awaitingExtraction';
      received?: number;
      total?: number;
      filePath?: string;
      message?: string;
      totalBytes?: number;
      completedAt?: string;
      finishedAt?: string;
      installDirectory?: string;
      executablePath?: string;
      elapsed?: number;
    }) => void,
  ) => () => void;
  uninstallGame: (installDirectory: string) => Promise<{ success: boolean; message?: string }>;
  cancelDownload: (gameId: string) => Promise<{ success: boolean; message?: string }>;
  resumeExtraction: (payload: {
    gameId: string;
    filePath: string;
    expectedExecutable?: string;
  }) => Promise<{ success: boolean; message?: string; installDirectory?: string; executablePath?: string }>;
  writeTextFile: (filePath: string, data: string) => Promise<{ success: boolean; message?: string }>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

