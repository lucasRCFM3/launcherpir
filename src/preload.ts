import { contextBridge, ipcRenderer } from 'electron';

type LaunchGameResult = {
  success: boolean;
  message?: string;
};

type SelectExecutableResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

type ValidateExecutableResult =
  | { success: true; filePath: string }
  | { success: false; message: string };

type DownloadStartPayload = {
  gameId: string;
  url: string;
  fileName: string;
  expectedExecutable?: string;
};

type DownloadProgressEvent = {
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
};

const api = {
  launchGame: (executablePath: string): Promise<LaunchGameResult> =>
    ipcRenderer.invoke('game:launch', executablePath),
  selectExecutable: (): Promise<SelectExecutableResult> =>
    ipcRenderer.invoke('dialog:select-executable'),
  validateExecutable: (executablePath: string): Promise<ValidateExecutableResult> =>
    ipcRenderer.invoke('game:validate-executable', executablePath),
  openExternal: (url: string): Promise<{ success: boolean; message?: string }> =>
    ipcRenderer.invoke('app:open-external', url),
  startStoreDownload: (payload: DownloadStartPayload) =>
    ipcRenderer.invoke('store:start-download', payload),
  onStoreDownloadProgress: (
    listener: (event: DownloadProgressEvent) => void,
  ): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: DownloadProgressEvent) =>
      listener(data);
    ipcRenderer.on('store:download-progress', handler);
    return () => {
      ipcRenderer.removeListener('store:download-progress', handler);
    };
  },
  uninstallGame: (installDirectory: string) =>
    ipcRenderer.invoke('library:uninstall', installDirectory),
  cancelDownload: (gameId: string) => ipcRenderer.invoke('store:cancel-download', gameId),
  resumeExtraction: (payload: { gameId: string; filePath: string; expectedExecutable?: string }) =>
    ipcRenderer.invoke('store:resume-extraction', payload),
  writeTextFile: (filePath: string, data: string) => ipcRenderer.invoke('file:write-text', { filePath, data }),
};

contextBridge.exposeInMainWorld('electronAPI', api);
