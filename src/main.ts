import { app, BrowserWindow, BrowserWindowConstructorOptions, dialog, ipcMain, shell } from 'electron';
import { constants as fsConstants, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { pipeline } from 'node:stream/promises';
import { Readable, Transform } from 'node:stream';
import extractZip from 'extract-zip';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

type ValidationResult =
  | { success: true; filePath: string }
  | { success: false; message: string };

const validateExecutablePath = async (rawPath: string): Promise<ValidationResult> => {
  if (!rawPath || typeof rawPath !== 'string') {
    return { success: false, message: 'Informe um caminho válido.' };
  }

  const normalized = path.normalize(rawPath.trim());

  if (path.extname(normalized).toLowerCase() !== '.exe') {
    return {
      success: false,
      message: 'Selecione um arquivo .exe válido.',
    };
  }

  try {
    await fs.access(normalized, fsConstants.F_OK);
  } catch {
    return {
      success: false,
      message: 'Arquivo não encontrado. Verifique se o caminho está correto.',
    };
  }

  try {
    const stats = await fs.stat(normalized);

    if (!stats.isFile()) {
      return {
        success: false,
        message: 'O caminho selecionado não é um arquivo executável.',
      };
    }
  } catch {
    return {
      success: false,
      message: 'Não foi possível verificar o arquivo selecionado.',
    };
  }

  return { success: true, filePath: normalized };
};

const DOWNLOAD_DIR = process.platform === 'win32'
  ? path.join('C:\\', 'LauGames')
  : path.join(app.getPath('downloads'), 'LauGames');

const ensureDownloadDir = () => {
  if (!existsSync(DOWNLOAD_DIR)) {
    mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
};

const sanitizeFileName = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9_.-]+/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_+|_+$/g, '') || `jogo_${Date.now()}`;

const ensureZipExtension = (fileName: string) =>
  fileName.toLowerCase().endsWith('.zip') ? fileName : `${fileName}.zip`;

const resolveDriveUrl = (url: URL) => {
  const fileIdMatch = url.pathname.match(/\/file\/d\/([^/]+)/);

  if (fileIdMatch) {
    return `https://drive.google.com/uc?export=download&id=${fileIdMatch[1]}`;
  }

  if (url.pathname.startsWith('/uc')) {
    return url.toString();
  }

  return url.toString();
};

const resolveMediaFireUrl = async (rawUrl: string) => {
  const response = await fetch(rawUrl);

  if (!response.ok) {
    throw new Error('Não foi possível acessar o link do MediaFire.');
  }

  const html = await response.text();
  const downloadLinkRegex = /href="(https?:\/\/download[^"']+)"/i;
  const match = html.match(downloadLinkRegex);

  if (match && match[1]) {
    return match[1].replace(/&amp;/g, '&');
  }

  throw new Error('Não foi possível localizar o link direto do MediaFire.');
};

const resolveDownloadUrl = async (rawUrl: string) => {
  let parsed: URL;

  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error('URL inválida.');
  }

  const host = parsed.hostname.toLowerCase();

  if (host.includes('drive.google')) {
    return resolveDriveUrl(parsed);
  }

  if (host.includes('googleusercontent.com')) {
    return parsed.toString();
  }

  if (host.includes('mediafire.com')) {
    return resolveMediaFireUrl(parsed.toString());
  }

  throw new Error('Apenas links do Google Drive ou MediaFire são aceitos.');
};

const downloadFile = async (
  url: string,
  destinationPath: string,
  onProgress: (received: number, total?: number) => void,
  signal: AbortSignal,
) => {
  const info = await getDownloadInfo(url);

  if (info.supportsRange && info.length && info.length > 0) {
    try {
      await downloadFileWithRanges(url, destinationPath, info.length, onProgress, signal);
      return;
    } catch (error) {
      if (signal.aborted) {
        throw new Error('Download cancelado pelo usuário.');
      }
      console.warn('Download segmentado falhou, usando modo simples', error);
    }
  }

  await downloadFileSingle(url, destinationPath, onProgress, signal);
};

const getDownloadInfo = async (
  url: string,
): Promise<{ supportsRange: boolean; length?: number }> => {
  try {
    const headResponse = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
    });

    if (!headResponse.ok) {
      return { supportsRange: false };
    }

    const acceptRanges = headResponse.headers.get('accept-ranges');
    const contentLength = headResponse.headers.get('content-length');

    return {
      supportsRange: acceptRanges?.toLowerCase() === 'bytes',
      length: contentLength ? Number(contentLength) : undefined,
    };
  } catch (error) {
    console.warn('HEAD request falhou, usando fallback', error);
    return { supportsRange: false };
  }
};

const downloadFileSingle = async (
  url: string,
  destinationPath: string,
  onProgress: (received: number, total?: number) => void,
  signal: AbortSignal,
) => {
  const response = await fetch(url, { redirect: 'follow', signal });

  if (!response.ok || !response.body) {
    throw new Error('Falha ao iniciar o download do arquivo.');
  }

  const total = response.headers.get('content-length')
    ? Number(response.headers.get('content-length'))
    : undefined;

  let received = 0;

  const readable = Readable.fromWeb(response.body);
  const progressStream = createProgressStream((chunkSize) => {
    received += chunkSize;
    onProgress(received, total);
  });

  await pipeline(readable, progressStream, createWriteStream(destinationPath));
};

const downloadFileWithRanges = async (
  url: string,
  destinationPath: string,
  totalBytes: number,
  onProgress: (received: number, total?: number) => void,
  signal: AbortSignal,
) => {
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB
  const MAX_CONCURRENCY = 4;

  await fs.writeFile(destinationPath, Buffer.alloc(0));
  const handle = await fs.open(destinationPath, 'r+');
  await handle.truncate(totalBytes);
  await handle.close();

  const chunks: Array<{ start: number; end: number }> = [];
  for (let start = 0; start < totalBytes; start += CHUNK_SIZE) {
    const end = Math.min(totalBytes - 1, start + CHUNK_SIZE - 1);
    chunks.push({ start, end });
  }

  let downloaded = 0;

  const downloadChunk = async ({ start, end }: { start: number; end: number }) => {
    const controller = new AbortController();
    const abortHandler = () => controller.abort();
    signal.addEventListener('abort', abortHandler);

    try {
      const res = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!res.ok || !res.status || res.status !== 206 || !res.body) {
        throw new Error('O servidor não suportou downloads segmentados.');
      }

      const readable = Readable.fromWeb(res.body);
      const progressStream = createProgressStream((chunkSize) => {
        downloaded += chunkSize;
        onProgress(downloaded, totalBytes);
      });

      const writeStream = createWriteStream(destinationPath, {
        flags: 'r+',
        start,
      });

      await pipeline(readable, progressStream, writeStream);
    } finally {
      signal.removeEventListener('abort', abortHandler);
    }
  };

  const concurrency = Math.min(MAX_CONCURRENCY, chunks.length);
  const queue = chunks.slice();

  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) {
        return;
      }
      await downloadChunk(chunk);
    }
  });

  await Promise.all(workers);
};

const createProgressStream = (
  onChunk: (size: number) => void,
) =>
  new Transform({
    transform(chunk, _encoding, callback) {
      onChunk(chunk.length);
      callback(null, chunk);
    },
  });

const ensureUniqueDirectory = (baseDir: string, desiredName: string) => {
  let targetDir = path.join(baseDir, desiredName);
  let counter = 1;

  while (existsSync(targetDir)) {
    targetDir = path.join(baseDir, `${desiredName}-${counter}`);
    counter += 1;
  }

  mkdirSync(targetDir, { recursive: true });

  return targetDir;
};

const findExecutable = async (dir: string, expected?: string): Promise<string | undefined> => {
  if (expected) {
    const normalized = expected.replace(/\\/g, '/').toLowerCase();
    const expectedFile = normalized.split('/').pop();

    const match = await findExecutableMatching(dir, normalized, expectedFile ?? null, dir);
    if (match) {
      return match;
    }
  }

  return findFirstExecutable(dir);
};

const findExecutableMatching = async (
  dir: string,
  normalizedExpected: string,
  expectedFileName: string | null,
  root: string,
): Promise<string | undefined> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await findExecutableMatching(fullPath, normalizedExpected, expectedFileName, root);
      if (nested) {
        return nested;
      }
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.exe')) {
      const relative = path.relative(root, fullPath).replace(/\\/g, '/').toLowerCase();
      const fileName = path.basename(fullPath).toLowerCase();

      if (relative === normalizedExpected) {
        return fullPath;
      }

      if (expectedFileName && fileName === expectedFileName) {
        return fullPath;
      }
    }
  }

  return undefined;
};

const findFirstExecutable = async (dir: string): Promise<string | undefined> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const nested = await findFirstExecutable(fullPath);
      if (nested) {
        return nested;
      }
    } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.exe')) {
      return fullPath;
    }
  }

  return undefined;
};

const extractAndLocate = async (
  zipPath: string,
  expectedExecutable?: string,
  options?: { gameId?: string },
) => {
  const baseName = path.basename(zipPath, path.extname(zipPath));
  const targetDir = ensureUniqueDirectory(DOWNLOAD_DIR, baseName);

  if (options?.gameId) {
    activeExtractions.set(options.gameId, { zipPath, targetDir });
  }

  try {
    await extractZip(zipPath, { dir: targetDir });

    const executablePath = await findExecutable(targetDir, expectedExecutable);

    if (!executablePath) {
      throw new Error('Nenhum arquivo executável (.exe) foi encontrado após a extração.');
    }

    return { installDirectory: targetDir, executablePath };
  } catch (error) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (options?.gameId) {
      activeExtractions.delete(options.gameId);
    }
  }
};

const createWindow = () => {
  // Create the browser window.
  const windowOptions: BrowserWindowConstructorOptions = {
    width: 1280,
    height: 780,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#0f1118',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f1118',
      symbolColor: '#f5f7ff',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  };

  mainWindow = new BrowserWindow(windowOptions);

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', async () => {
  await cleanupActiveExtractions().catch(() => undefined);
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.handle('game:launch', async (_event, executablePath: string) => {
  const validation = await validateExecutablePath(executablePath);

  if (!validation.success) {
    return validation;
  }

  try {
    const result = await shell.openPath(validation.filePath);

    if (result) {
      return { success: false, message: result };
    }

    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Erro inesperado ao abrir o jogo.';

    return {
      success: false,
      message,
    };
  }
});

ipcMain.handle('dialog:select-executable', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;

  const result = await dialog.showOpenDialog(win, {
    title: 'Selecionar arquivo executável',
    properties: ['openFile'],
    filters: [
      { name: 'Executáveis', extensions: ['exe'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }

  return { canceled: false, filePath: result.filePaths[0] };
});

ipcMain.handle('game:validate-executable', async (_event, filePath: string) =>
  validateExecutablePath(filePath),
);

ipcMain.handle('app:open-external', async (_event, url: string) => {
  if (!url || typeof url !== 'string') {
    return { success: false, message: 'URL inválida.' };
  }

  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Não foi possível abrir o link informado.',
    };
  }
});

const downloadControllers = new Map<string, AbortController>();
const downloadTargets = new Map<string, string>();
const abortReasons = new Map<string, 'cancelled'>();
const activeExtractions = new Map<string, { zipPath: string; targetDir: string }>();

const cleanupActiveExtractions = async () => {
  const cleanups = Array.from(activeExtractions.values()).map((entry) =>
    fs.rm(entry.targetDir, { recursive: true, force: true }).catch(() => undefined),
  );
  await Promise.all(cleanups);
  activeExtractions.clear();
};

ipcMain.handle(
  'store:start-download',
  async (
    event,
    payload: { gameId: string; url: string; fileName: string; expectedExecutable?: string },
  ) => {
    const sender = event.sender;

    const safeGameId = payload.gameId;

    let targetPath = '';

    try {
      ensureDownloadDir();

      if (downloadControllers.has(safeGameId)) {
        downloadControllers.get(safeGameId)?.abort();
        downloadControllers.delete(safeGameId);
      }

      sender.send('store:download-progress', {
        gameId: safeGameId,
        state: 'queued',
      });

      const resolvedUrl = await resolveDownloadUrl(payload.url);

      const sanitized = sanitizeFileName(payload.fileName);
      const finalName = ensureZipExtension(sanitized);

      targetPath = path.join(DOWNLOAD_DIR, finalName);
      let counter = 1;
      while (existsSync(targetPath)) {
        const suffix = `(${counter})`;
        const base = finalName.replace(/\.zip$/i, '');
        targetPath = path.join(DOWNLOAD_DIR, `${base}${suffix}.zip`);
        counter += 1;
      }

      const controller = new AbortController();
      downloadControllers.set(safeGameId, controller);
      downloadTargets.set(safeGameId, targetPath);
      abortReasons.delete(safeGameId);

      await downloadFile(
        resolvedUrl,
        targetPath,
        (received, total) => {
          sender.send('store:download-progress', {
            gameId: safeGameId,
            state: 'downloading',
            received,
            total,
          });
        },
        controller.signal,
      );

      if (controller.signal.aborted) {
        const cancellationError = new Error('');
        cancellationError.name = 'AbortError';
        throw cancellationError;
      }

      const zipStats = await fs.stat(targetPath);

      sender.send('store:download-progress', {
        gameId: safeGameId,
        state: 'extracting',
        filePath: targetPath,
        received: zipStats.size,
        total: zipStats.size,
      });

      const { installDirectory, executablePath } = await extractAndLocate(
        targetPath,
        payload.expectedExecutable,
        { gameId: safeGameId },
      );

      await fs.unlink(targetPath).catch(() => undefined);

      downloadControllers.delete(safeGameId);
      downloadTargets.delete(safeGameId);
      abortReasons.delete(safeGameId);

      sender.send('store:download-progress', {
        gameId: safeGameId,
        state: 'ready',
        filePath: targetPath,
        totalBytes: zipStats.size,
        completedAt: new Date().toISOString(),
        installDirectory,
        executablePath,
      });

      return { success: true };
    } catch (error) {
      downloadControllers.delete(safeGameId);
      const reason = abortReasons.get(safeGameId);
      abortReasons.delete(safeGameId);
      const trackedTarget = downloadTargets.get(safeGameId) ?? targetPath;
      downloadTargets.delete(safeGameId);
      if (trackedTarget) {
        await fs.unlink(trackedTarget).catch(() => undefined);
      }
      const activeExtraction = activeExtractions.get(safeGameId);
      if (activeExtraction) {
        await fs.rm(activeExtraction.targetDir, { recursive: true, force: true }).catch(() => undefined);
        activeExtractions.delete(safeGameId);
      }
      const baseMessage =
        error instanceof Error ? error.message : 'Falha ao baixar o arquivo informado.';
      const state = reason === 'cancelled' ? 'cancelled' : 'failed';
      const payload: {
        gameId: string;
        state: 'cancelled' | 'failed';
        finishedAt: string;
        message?: string;
      } = {
        gameId: safeGameId,
        state,
        finishedAt: new Date().toISOString(),
      };

      if (state === 'failed') {
        payload.message = baseMessage;
      }

      sender.send('store:download-progress', payload);

      return {
        success: false,
        message,
      };
    }
  },
);

ipcMain.handle('store:cancel-download', async (_event, gameId: string) => {
  const controller = downloadControllers.get(gameId);

  if (controller) {
    abortReasons.set(gameId, 'cancelled');
    controller.abort();
    downloadControllers.delete(gameId);
    return { success: true };
  }

  return { success: false, message: 'Nenhum download ativo encontrado.' };
});

ipcMain.handle(
  'store:resume-extraction',
  async (
    _event,
    payload: { gameId: string; filePath: string; expectedExecutable?: string },
  ) => {
    try {
      const { installDirectory, executablePath } = await extractAndLocate(
        payload.filePath,
        payload.expectedExecutable,
        { gameId: payload.gameId },
      );

      await fs.unlink(payload.filePath).catch(() => undefined);

      return { success: true, installDirectory, executablePath };
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Falha ao extrair o arquivo informado.';
      return { success: false, message };
    }
  },
);

ipcMain.handle('file:write-text', async (_event, payload: { filePath: string; data: string }) => {
  try {
    if (!payload?.filePath) {
      return { success: false, message: 'Caminho inválido.' };
    }

    const targetDir = path.dirname(payload.filePath);
    await fs.mkdir(targetDir, { recursive: true });
    await fs.writeFile(payload.filePath, payload.data, 'utf-8');
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Falha ao gravar arquivo.',
    };
  }
});

ipcMain.handle('library:uninstall', async (_event, installDirectory: string) => {
  if (!installDirectory) {
    return { success: false, message: 'Diretório inválido.' };
  }

  try {
    await fs.rm(installDirectory, { recursive: true, force: true });
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : 'Falha ao remover diretório do jogo.',
    };
  }
});

app.on('before-quit', async () => {
  for (const [gameId, controller] of downloadControllers.entries()) {
    abortReasons.set(gameId, 'cancelled');
    controller.abort();
  }
  downloadControllers.clear();

  await cleanupActiveExtractions().catch(() => undefined);
});
