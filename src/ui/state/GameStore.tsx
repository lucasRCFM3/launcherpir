import React, { createContext, useContext, useEffect, useMemo, useReducer, useRef, useCallback } from 'react';

import {
  DownloadRecord,
  GameCreatePayload,
  GameEntry,
  StoreDownloadStatus,
  StoreGame,
  StoreGameCreatePayload,
} from '../types';
import { REMOTE_STORE_URL, STORE_EXPORT_PATH } from '../../config/env';

const STORAGE_KEY = 'launcher-pir-games@v2';

const snapshotState = (value: GameState): GameState =>
  JSON.parse(JSON.stringify(value)) as GameState;

const generateId = () => {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `game-${Math.random().toString(36).slice(2, 10)}`;
};

type GameState = {
  games: GameEntry[];
  storeGames: StoreGame[];
  downloadRecords: DownloadRecord[];
};

const mapRemoteStoreEntry = (entry: unknown): StoreGame | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const record = entry as Record<string, unknown>;
  const idValue = record.id;
  const titleValue = record.title;
  const downloadUrlValue = record.downloadUrl;

  const id = typeof idValue === 'string' && idValue.trim().length > 0 ? idValue.trim() : generateId();
  const title = typeof titleValue === 'string' ? titleValue.trim() : '';
  const downloadUrl = typeof downloadUrlValue === 'string' ? downloadUrlValue.trim() : '';

  if (!title || !downloadUrl) {
    return null;
  }

  const tagsValue = record.tags;
  const tags = Array.isArray(tagsValue)
    ? tagsValue.filter((tag: unknown): tag is string => typeof tag === 'string')
    : [];

  const description = record.description;
  const developer = record.developer;
  const coverUrlValue = record.coverUrl;
  const heroUrlValue = record.heroUrl;
  const sizeValue = record.size;
  const expectedExecutableValue = record.expectedExecutable;
  const createdAtValue = record.createdAt;
  const libraryEntryIdValue = record.libraryEntryId;

  const coverUrl = typeof coverUrlValue === 'string' ? coverUrlValue : '';
  const heroUrl =
    typeof heroUrlValue === 'string'
      ? heroUrlValue
      : typeof coverUrlValue === 'string'
        ? coverUrlValue
        : '';

  return {
    id,
    title,
    description: typeof description === 'string' ? description : '',
    developer: typeof developer === 'string' ? developer : '',
    coverUrl,
    heroUrl,
    tags,
    size: typeof sizeValue === 'string' ? sizeValue : undefined,
    downloadUrl,
    expectedExecutable:
      typeof expectedExecutableValue === 'string' ? expectedExecutableValue : undefined,
    createdAt: typeof createdAtValue === 'string' ? createdAtValue : new Date().toISOString(),
    downloadStatus: { state: 'idle' },
    libraryEntryId: typeof libraryEntryIdValue === 'string' ? libraryEntryIdValue : undefined,
  };
};

const serializeStoreGame = (game: StoreGame) => ({
  id: game.id,
  title: game.title,
  description: game.description,
  developer: game.developer,
  coverUrl: game.coverUrl,
  heroUrl: game.heroUrl ?? game.coverUrl,
  tags: game.tags,
  size: game.size,
  downloadUrl: game.downloadUrl,
  expectedExecutable: game.expectedExecutable,
  createdAt: game.createdAt ?? new Date().toISOString(),
  libraryEntryId: game.libraryEntryId,
});

type DownloadMetrics = {
  timestamp: number;
  received: number;
  recordId: string;
  speed?: number;
  bytesSinceLast: number;
};

type GameAction =
  | { type: 'install'; id: string; executablePath: string }
  | { type: 'uninstall'; id: string }
  | { type: 'add-custom'; payload: GameCreatePayload }
  | { type: 'update'; id: string; payload: Partial<GameEntry> }
  | { type: 'hydrate'; payload: GameState }
  | { type: 'add-store'; payload: StoreGame }
  | { type: 'remove-store'; id: string }
  | { type: 'update-store'; id: string; payload: Partial<StoreGame> }
  | { type: 'set-store-status'; id: string; status: StoreDownloadStatus }
  | { type: 'append-download-record'; payload: DownloadRecord }
  | {
      type: 'update-download-record';
      id: string;
      payload: Partial<DownloadRecord>;
      appendSpeedEntry?: { timestamp: number; speed: number };
    }
  | {
      type: 'link-store-game';
      payload: {
        storeGame: StoreGame;
        executablePath: string;
        installDirectory: string;
      };
    }
  | { type: 'remove-download-record'; id: string }
  | { type: 'clear-download-records' }
  | { type: 'set-remote-store'; payload: { games: StoreGame[] } };

const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'hydrate':
      return action.payload;
    case 'install':
      return {
        games: state.games.map((game) =>
          game.id === action.id
            ? {
                ...game,
                installed: true,
                executablePath: action.executablePath,
                installDate: new Date().toISOString(),
              }
            : game,
        ),
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords,
      };
    case 'uninstall': {
      const updatedGames = state.games.map((game) =>
        game.id === action.id
          ? {
              ...game,
              installed: false,
              executablePath: undefined,
              installDirectory: undefined,
              installDate: undefined,
            }
          : game,
      );

      const updatedStoreGames = state.storeGames.map((game) =>
        game.libraryEntryId === action.id
          ? {
              ...game,
              libraryEntryId: undefined,
              downloadStatus: game.downloadStatus?.state === 'ready'
                ? { state: 'idle' }
                : game.downloadStatus,
            }
          : game,
      );

      return {
        games: updatedGames,
        storeGames: updatedStoreGames,
        downloadRecords: state.downloadRecords,
      };
    }
    case 'add-custom': {
      const idSafe = action.payload.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

      const unique = generateId();
      const suffix =
        unique
          .replace(/[^a-z0-9]/gi, '')
          .slice(0, 6)
          .toLowerCase() || unique;

      const baseId = idSafe.length > 0 ? `${idSafe}-${suffix}` : unique;

      const heroUrl = action.payload.heroUrl ?? action.payload.coverUrl;

      const newEntry: GameEntry = {
        id: baseId,
        title: action.payload.title,
        description: action.payload.description,
        developer: action.payload.developer,
        coverUrl: action.payload.coverUrl,
        heroUrl,
        tags: action.payload.tags,
        size: action.payload.size,
        installed: true,
        executablePath: action.payload.executablePath,
        installDate: new Date().toISOString(),
        isCustom: true,
      };

      return {
        games: [newEntry, ...state.games],
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords,
      };
    }
    case 'update':
      return {
        games: state.games.map((game) =>
          game.id === action.id ? { ...game, ...action.payload } : game,
        ),
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords,
      };
    case 'add-store':
      return {
        games: state.games,
        storeGames: [action.payload, ...state.storeGames],
        downloadRecords: state.downloadRecords,
      };
    case 'remove-store':
      return {
        games: state.games,
        storeGames: state.storeGames.filter((game) => game.id !== action.id),
        downloadRecords: state.downloadRecords,
      };
    case 'update-store':
      return {
        games: state.games.map((game) =>
          game.storeId === action.id
            ? {
                ...game,
                title: action.payload.title ?? game.title,
                description: action.payload.description ?? game.description,
                developer: action.payload.developer ?? game.developer,
                coverUrl: action.payload.coverUrl ?? game.coverUrl,
                heroUrl: action.payload.heroUrl ?? game.heroUrl,
                tags: action.payload.tags ?? game.tags,
                size: action.payload.size ?? game.size,
              }
            : game,
        ),
        storeGames: state.storeGames.map((game) =>
          game.id === action.id ? { ...game, ...action.payload } : game,
        ),
        downloadRecords: state.downloadRecords,
      };
    case 'set-store-status':
      return {
        games: state.games,
        storeGames: state.storeGames.map((game) =>
          game.id === action.id ? { ...game, downloadStatus: action.status } : game,
        ),
        downloadRecords: state.downloadRecords,
      };
    case 'append-download-record':
      return {
        games: state.games,
        storeGames: state.storeGames,
        downloadRecords: [action.payload, ...state.downloadRecords],
      };
    case 'update-download-record':
      return {
        games: state.games,
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords.map((record) =>
          record.id === action.id
            ? {
                ...record,
                ...action.payload,
                speedHistory: (() => {
                  if (action.appendSpeedEntry) {
                    const history = [...(record.speedHistory ?? []), action.appendSpeedEntry];
                    return history.slice(-20);
                  }
                  if (action.payload.speedHistory) {
                    return action.payload.speedHistory.slice(-20);
                  }
                  return record.speedHistory;
                })(),
              }
            : record,
        ),
      };
    case 'link-store-game': {
      const { storeGame, executablePath, installDirectory } = action.payload;
      const existingEntry = state.games.find((game) => game.storeId === storeGame.id);
      const timestamp = new Date().toISOString();

      let games = state.games;
      let libraryEntryId: string;

      if (existingEntry) {
        const updatedEntry: GameEntry = {
          ...existingEntry,
          installed: true,
          executablePath,
          installDirectory,
          installDate: timestamp,
        };

        games = state.games.map((game) =>
          game.id === existingEntry.id ? updatedEntry : game,
        );
        libraryEntryId = existingEntry.id;
      } else {
        const newId = generateId();
        const newEntry: GameEntry = {
          id: newId,
          storeId: storeGame.id,
          title: storeGame.title,
          description: storeGame.description,
          developer: storeGame.developer,
          coverUrl: storeGame.coverUrl,
          heroUrl: storeGame.heroUrl ?? storeGame.coverUrl,
          tags: storeGame.tags,
          size: storeGame.size,
          installed: true,
          executablePath,
          installDirectory,
          installDate: timestamp,
        };

        games = [newEntry, ...state.games];
        libraryEntryId = newId;
      }

      const updatedStoreGames = state.storeGames.map((game) =>
        game.id === storeGame.id ? { ...game, libraryEntryId } : game,
      );

      return {
        games,
        storeGames: updatedStoreGames,
        downloadRecords: state.downloadRecords,
      };
    }
    case 'remove-download-record':
      return {
        games: state.games,
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords.filter((record) => record.id !== action.id),
      };
    case 'clear-download-records':
      return {
        games: state.games,
        storeGames: state.storeGames,
        downloadRecords: [],
      };
    case 'set-remote-store': {
      const existingMap = new Map(state.storeGames.map((game) => [game.id, game]));
      const storeGames = action.payload.games.map((game) => {
        const previous = existingMap.get(game.id);
        return {
          ...game,
          downloadStatus: previous?.downloadStatus ?? game.downloadStatus ?? { state: 'idle' },
          libraryEntryId: previous?.libraryEntryId ?? game.libraryEntryId,
          createdAt: previous?.createdAt ?? game.createdAt,
        };
      });

      return {
        games: state.games,
        storeGames,
        downloadRecords: state.downloadRecords,
      };
    }
    default:
      return state;
  }
};

interface GameStoreValue extends GameState {
  installGame: (id: string, executablePath: string) => void;
  uninstallGame: (id: string) => void;
  deleteInstallation: (id: string) => Promise<void>;
  removeDownloadRecord: (id: string) => void;
  clearDownloadRecords: () => void;
  resumeExtraction: (id: string) => Promise<{ success: boolean; message?: string }>;
  addCustomGame: (payload: GameCreatePayload) => void;
  updateGame: (id: string, payload: Partial<GameEntry>) => void;
  addStoreGame: (payload: StoreGameCreatePayload) => void;
  editStoreGame: (id: string, payload: StoreGameCreatePayload) => void;
  removeStoreGame: (id: string) => void;
  setStoreDownloadStatus: (id: string, status: StoreDownloadStatus) => void;
  startStoreDownload: (id: string, url: string, fileName: string) => Promise<void>;
  isRemoteStore: boolean;
  remoteStoreUrl?: string;
  refreshRemoteStore: () => Promise<boolean>;
  exportStoreCatalog: () => string;
  storeExportPath?: string;
  writeStoreCatalogFile: () => Promise<{ success: boolean; message?: string; filePath?: string }>;
}

const GameStoreContext = createContext<GameStoreValue | undefined>(undefined);

const loadInitialState = (): GameState => {
  const normalizeRecord = (record: DownloadRecord): DownloadRecord | null => {
    switch (record.state) {
      case 'queued':
      case 'downloading':
        return null;
      case 'extracting':
        return {
          ...record,
          state: 'awaitingExtraction',
          finishedAt: undefined,
          errorMessage: undefined,
        };
      default:
        return record;
    }
  };

  const normalizeStatus = (
    status: StoreDownloadStatus | undefined,
    record: DownloadRecord | undefined,
  ): StoreDownloadStatus | undefined => {
    if (!status) {
      return status;
    }

    if (status.state === 'extracting') {
      if (record?.destinationPath) {
        return {
          state: 'awaitingExtraction',
          filePath: record.destinationPath,
          totalBytes: record.sizeBytes,
          requestedAt: new Date().toISOString(),
        };
      }

      return { state: 'idle' };
    }

    if (status.state === 'awaitingExtraction') {
      if (status.filePath) {
        return status;
      }

      if (record?.destinationPath) {
        return {
          ...status,
          filePath: record.destinationPath,
        };
      }

      return { state: 'idle' };
    }

    if (['queued', 'downloading'].includes(status.state)) {
      return { state: 'idle' };
    }

    return status;
  };

  if (typeof window === 'undefined') {
    return { games: [], storeGames: [], downloadRecords: [] };
  }

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);

    if (stored) {
      const parsed = JSON.parse(stored) as GameState;
      const normalizedRecords = (parsed.downloadRecords?.map(normalizeRecord).filter(Boolean) ?? []) as DownloadRecord[];
      const recordMap = new Map(normalizedRecords.map((record) => [record.gameId, record]));

      return {
        games: parsed.games?.map((game) => ({
          ...game,
          installed: Boolean(game.installed),
        })) ?? [],
        storeGames:
          parsed.storeGames?.map((storeGame) => ({
            ...storeGame,
            downloadStatus: normalizeStatus(storeGame.downloadStatus, recordMap.get(storeGame.id)),
          })) ?? [],
        downloadRecords: normalizedRecords,
      };
    }
  } catch (error) {
    console.warn('Falha ao ler jogos salvos', error);
  }

  return {
    games: [],
    storeGames: [],
    downloadRecords: [],
  };
};

export const GameStoreProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(gameReducer, undefined, loadInitialState);

  const remoteStoreUrl = REMOTE_STORE_URL;
  const isRemoteStore = Boolean(remoteStoreUrl);
  const remoteStoreAbortRef = useRef<AbortController | null>(null);

  const downloadMetricsRef = useRef<Record<string, DownloadMetrics>>({});
  const storeGamesRef = useRef<StoreGame[]>(state.storeGames);
  const downloadRecordsRef = useRef<DownloadRecord[]>(state.downloadRecords);
  const saveHandleRef = useRef<number | null>(null);
  const latestStateRef = useRef(state);
  const latestSnapshotRef = useRef<GameState | null>(snapshotState(state));
  const storeExportPath = STORE_EXPORT_PATH;

  const fetchRemoteStore = useCallback(async (): Promise<boolean> => {
    if (!isRemoteStore || !remoteStoreUrl) {
      return false;
    }

    remoteStoreAbortRef.current?.abort();
    const controller = new AbortController();
    remoteStoreAbortRef.current = controller;

    try {
      const response = await fetch(remoteStoreUrl, {
        signal: controller.signal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`Falha ao carregar catálogo remoto (${response.status})`);
      }

      const data = await response.json();
      const entries = Array.isArray(data) ? data : Array.isArray(data?.games) ? data.games : [];

      if (!Array.isArray(entries)) {
        throw new Error('Formato de catálogo remoto inválido.');
      }

      const normalized = entries
        .map(mapRemoteStoreEntry)
        .filter((entry): entry is StoreGame => entry !== null);

      dispatch({ type: 'set-remote-store', payload: { games: normalized } });
      return true;
    } catch (error) {
      if (controller.signal.aborted) {
        return false;
      }
      console.error('Falha ao carregar catálogo remoto', error);
      return false;
    }
  }, [dispatch, isRemoteStore, remoteStoreUrl]);

  useEffect(() => {
    storeGamesRef.current = state.storeGames;
  }, [state.storeGames]);

  useEffect(() => {
    downloadRecordsRef.current = state.downloadRecords;
  }, [state.downloadRecords]);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    if (!isRemoteStore) {
      return;
    }

    fetchRemoteStore();

    return () => {
      remoteStoreAbortRef.current?.abort();
    };
  }, [isRemoteStore, fetchRemoteStore]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return () => undefined;
    }

    const snapshot: GameState = {
      games: state.games,
      storeGames: state.storeGames,
      downloadRecords: state.downloadRecords,
    };
    latestSnapshotRef.current = snapshotState(snapshot);

    if ('requestIdleCallback' in window) {
      if (saveHandleRef.current) {
        (window as unknown as { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(
          saveHandleRef.current,
        );
      }

      const handle = (window as unknown as { requestIdleCallback: (cb: () => void) => number }).requestIdleCallback(
        () => {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
        },
      );

      saveHandleRef.current = handle;

      return () => {
        if (saveHandleRef.current) {
          (window as unknown as { cancelIdleCallback: (handle: number) => void }).cancelIdleCallback(
            saveHandleRef.current,
          );
          saveHandleRef.current = null;
        }
      };
    }

    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    }, 100);

    return () => window.clearTimeout(timeout);
  }, [state]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const snapshot =
        latestSnapshotRef.current ?? snapshotState({
          games: latestStateRef.current.games,
          storeGames: latestStateRef.current.storeGames,
          downloadRecords: latestStateRef.current.downloadRecords,
        });
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onStoreDownloadProgress) {
      return () => undefined;
    }

    return api.onStoreDownloadProgress(
      ({ gameId, state: downloadState, received, total, filePath, message, installDirectory, executablePath }) => {
        const now = Date.now();
        const storeGame = storeGamesRef.current.find((game) => game.id === gameId);

        const getOrCreateRecord = () => {
          const existingRecord = downloadRecordsRef.current.find((record) => record.gameId === gameId);
          if (existingRecord) {
            downloadMetricsRef.current[gameId] = {
              timestamp: now,
              received: 0,
              recordId: existingRecord.id,
              speed: undefined,
              bytesSinceLast: 0,
            };
            dispatch({
              type: 'update-download-record',
              id: existingRecord.id,
              payload: {
                state: 'queued',
                startedAt: new Date(now).toISOString(),
                finishedAt: undefined,
                destinationPath: undefined,
                installDirectory: undefined,
                executablePath: undefined,
                sizeBytes: undefined,
                errorMessage: undefined,
                speedHistory: [],
              },
            });
            return existingRecord.id;
          }

          const recordId = generateId();
          dispatch({
            type: 'append-download-record',
            payload: {
              id: recordId,
              gameId,
              title: storeGame?.title ?? 'Download',
              sourceUrl: storeGame?.downloadUrl ?? '',
              state: 'queued',
              startedAt: new Date(now).toISOString(),
              speedHistory: [],
            },
          });

          downloadMetricsRef.current[gameId] = {
            timestamp: now,
            received: 0,
            recordId,
            speed: undefined,
            bytesSinceLast: 0,
          };

          return recordId;
        };

        const ensureRecordIfNeeded = () => {
          const metric = downloadMetricsRef.current[gameId];
          if (metric) {
            return metric.recordId;
          }
          return downloadRecordsRef.current.find((record) => record.gameId === gameId)?.id;
        };

        const findRecordId = () => {
          const metric = downloadMetricsRef.current[gameId];
          if (metric) {
            return metric.recordId;
          }
          const existingRecord = downloadRecordsRef.current.find((record) => record.gameId === gameId);
          return existingRecord?.id;
        };

        const ensureMetrics = (recordId: string) => {
          const existingMetrics = downloadMetricsRef.current[gameId];
          if (existingMetrics) {
            return existingMetrics;
          }

          const metrics: DownloadMetrics = {
            timestamp: now,
            received: 0,
            recordId,
            speed: undefined,
            bytesSinceLast: 0,
          };

          downloadMetricsRef.current[gameId] = metrics;
          return metrics;
        };

        switch (downloadState) {
          case 'queued': {
            const recordId = ensureRecordIfNeeded() ?? getOrCreateRecord();
            dispatch({ type: 'set-store-status', id: gameId, status: { state: 'queued' } });
            dispatch({
              type: 'update-download-record',
              id: recordId,
              payload: { state: 'queued', startedAt: new Date(now).toISOString() },
            });
            ensureMetrics(recordId);
            break;
          }
          case 'downloading': {
            const recordId = ensureRecordIfNeeded();
            if (!recordId) {
              return;
            }
            const previousMetric = ensureMetrics(recordId);
            const prevReceived = previousMetric.received ?? 0;

            const newReceived = typeof received === 'number' ? received : prevReceived;
            const deltaBytes = Math.max(newReceived - prevReceived, 0);
            const bytesSinceLast = (previousMetric?.bytesSinceLast ?? 0) + deltaBytes;
            const elapsed = now - (previousMetric?.timestamp ?? now);
            const prevSpeed = previousMetric?.speed;

            let updatedSpeed = prevSpeed;
            let shouldAppendSpeed = false;
            let updatedTimestamp = previousMetric?.timestamp ?? now;
            let updatedBytesSinceLast = bytesSinceLast;

            if (elapsed >= 600 && bytesSinceLast > 0) {
              const rawSpeed = (bytesSinceLast / elapsed) * 1000;
              updatedSpeed = prevSpeed !== undefined ? prevSpeed * 0.6 + rawSpeed * 0.4 : rawSpeed;
              shouldAppendSpeed = true;
              updatedTimestamp = now;
              updatedBytesSinceLast = 0;
            }

            downloadMetricsRef.current[gameId] = {
              timestamp: updatedTimestamp,
              received: newReceived,
              recordId,
              speed: updatedSpeed,
              bytesSinceLast: updatedBytesSinceLast,
            };

            dispatch({
              type: 'set-store-status',
              id: gameId,
              status: {
                state: 'downloading',
                received: newReceived,
                total,
                speed: updatedSpeed,
              },
            });

            dispatch({
              type: 'update-download-record',
              id: recordId,
              payload: {
                state: 'downloading',
                sizeBytes: total,
              },
              appendSpeedEntry:
                shouldAppendSpeed && updatedSpeed !== undefined
                  ? { timestamp: now, speed: updatedSpeed }
                  : undefined,
            });
            break;
          }
          case 'extracting': {
            const recordId = ensureRecordIfNeeded();
            const filePathValue = filePath ?? downloadRecordsRef.current.find((r) => r.gameId === gameId)?.destinationPath ?? '';

            dispatch({
              type: 'set-store-status',
              id: gameId,
              status: {
                state: 'extracting',
                filePath: filePathValue,
                received,
                total,
              },
            });

            if (recordId) {
              const metrics = ensureMetrics(recordId);
              dispatch({
                type: 'update-download-record',
                id: recordId,
                payload: {
                  state: 'extracting',
                  destinationPath: filePathValue,
                  sizeBytes: total ?? metrics.received,
                  finishedAt: undefined,
                },
              });
            }

            break;
          }
          case 'ready': {
            const existingRecordId = ensureRecordIfNeeded();
            const recordId = existingRecordId ?? getOrCreateRecord();
            const metrics = ensureMetrics(recordId);
            const totalBytes = metrics.received ?? received ?? 0;

            dispatch({
              type: 'set-store-status',
              id: gameId,
              status: {
                state: 'ready',
                filePath: filePath ?? '',
                totalBytes,
                completedAt: new Date(now).toISOString(),
                installDirectory: installDirectory ?? '',
                executablePath: executablePath ?? '',
              },
            });

            dispatch({
              type: 'update-download-record',
              id: recordId,
              payload: {
                state: 'ready',
                destinationPath: filePath,
                installDirectory,
                executablePath,
                finishedAt: new Date(now).toISOString(),
                sizeBytes: totalBytes,
              },
            });

            if (storeGame && executablePath && installDirectory) {
              dispatch({
                type: 'link-store-game',
                payload: { storeGame, executablePath, installDirectory },
              });
            }

            delete downloadMetricsRef.current[gameId];
            break;
          }
          case 'failed': {
            const recordId = ensureRecordIfNeeded();
            const errorMessage = message ?? 'Falha ao baixar arquivo.';
            const isCanceled = errorMessage.toLowerCase().includes('cancelado');

            dispatch({
              type: 'set-store-status',
              id: gameId,
              status: {
                state: isCanceled ? 'cancelled' : 'failed',
                message: errorMessage,
                finishedAt: new Date(now).toISOString(),
              },
            });
            if (recordId) {
              dispatch({
                type: 'update-download-record',
                id: recordId,
                payload: {
                  state: isCanceled ? 'cancelled' : 'failed',
                  finishedAt: new Date(now).toISOString(),
                  errorMessage,
                },
              });
            }
            delete downloadMetricsRef.current[gameId];
            break;
          }
          case 'cancelled': {
            const recordId = findRecordId();

            dispatch({ type: 'set-store-status', id: gameId, status: { state: 'idle' } });

            if (recordId) {
              dispatch({ type: 'remove-download-record', id: recordId });
            }

            delete downloadMetricsRef.current[gameId];
            break;
          }
          case 'awaitingExtraction': {
            const recordId = ensureRecordIfNeeded() ?? getOrCreateRecord();
            const metrics = ensureMetrics(recordId);
            const zipPath = filePath ?? downloadRecordsRef.current.find((r) => r.gameId === gameId)?.destinationPath ?? '';

            dispatch({
              type: 'set-store-status',
              id: gameId,
              status: {
                state: 'awaitingExtraction',
                filePath: zipPath,
                totalBytes: metrics.received,
                requestedAt: new Date(now).toISOString(),
              },
            });

            dispatch({
              type: 'update-download-record',
              id: recordId,
              payload: {
                state: 'awaitingExtraction',
                destinationPath: zipPath,
                sizeBytes: metrics.received,
                finishedAt: undefined,
                errorMessage: undefined,
              },
            });

            break;
          }
          default:
            break;
        }
      },
    );
  }, []);

  const value = useMemo<GameStoreValue>(
    () => {
      const exportCatalog = () => {
        const payload = {
          version: 1,
          generatedAt: new Date().toISOString(),
          games: state.storeGames.map(serializeStoreGame),
        };
        return JSON.stringify(payload, null, 2);
      };

      return {
        games: state.games,
        storeGames: state.storeGames,
        downloadRecords: state.downloadRecords,
        installGame: (id: string, executablePath: string) => {
          dispatch({ type: 'install', id, executablePath });
        },
        uninstallGame: (id: string) => {
          dispatch({ type: 'uninstall', id });
        },
        deleteInstallation: async (id: string) => {
          const api = window.electronAPI;
          const targetGame = state.games.find((game) => game.id === id);

          if (!targetGame) {
            dispatch({ type: 'uninstall', id });
            return;
          }

          if (targetGame.installDirectory && api?.uninstallGame) {
            await api.uninstallGame(targetGame.installDirectory);
          }

          dispatch({ type: 'uninstall', id });
        },
        removeDownloadRecord: (id: string) => {
          const record = state.downloadRecords.find((item) => item.id === id);
          if (record) {
            delete downloadMetricsRef.current[record.gameId];
          }
          dispatch({ type: 'remove-download-record', id });
        },
        clearDownloadRecords: () => {
          downloadMetricsRef.current = {};
          dispatch({ type: 'clear-download-records' });
        },
        resumeExtraction: async (id: string) => {
          const api = window.electronAPI;
          const storeGame = storeGamesRef.current.find((game) => game.id === id);
          const record = downloadRecordsRef.current.find((item) => item.gameId === id);

          const filePath =
            (storeGame?.downloadStatus?.state === 'awaitingExtraction'
              ? storeGame.downloadStatus.filePath
              : undefined) ?? record?.destinationPath;

          if (!api?.resumeExtraction || !filePath || !storeGame) {
            return { success: false, message: 'Arquivo do jogo não encontrado para extração.' };
          }

          const totalBytes =
            record?.sizeBytes ?? storeGame.downloadStatus?.totalBytes;

          dispatch({
            type: 'set-store-status',
            id,
            status: {
              state: 'extracting',
              filePath,
              total: totalBytes,
              received: totalBytes,
            },
          });

          if (record) {
            dispatch({
              type: 'update-download-record',
              id: record.id,
              payload: {
                state: 'extracting',
                destinationPath: filePath,
                finishedAt: undefined,
                errorMessage: undefined,
              },
            });
          }

          const result = await api.resumeExtraction({
            gameId: id,
            filePath,
            expectedExecutable: storeGame.expectedExecutable,
          });

          if (!result.success || !result.installDirectory || !result.executablePath) {
            const message = result.message ?? 'Falha ao extrair arquivos.';
            dispatch({
              type: 'set-store-status',
              id,
              status: {
                state: 'failed',
                message,
                finishedAt: new Date().toISOString(),
              },
            });
            if (record) {
              dispatch({
                type: 'update-download-record',
                id: record.id,
                payload: {
                  state: 'failed',
                  finishedAt: new Date().toISOString(),
                  errorMessage: message,
                },
              });
            }
            return { success: false, message };
          }

          dispatch({
            type: 'set-store-status',
            id,
            status: {
              state: 'ready',
              filePath,
              totalBytes: totalBytes ?? record?.sizeBytes,
              completedAt: new Date().toISOString(),
              installDirectory: result.installDirectory,
              executablePath: result.executablePath,
            },
          });

          if (record) {
            dispatch({
              type: 'update-download-record',
              id: record.id,
              payload: {
                state: 'ready',
                destinationPath: filePath,
                installDirectory: result.installDirectory,
                executablePath: result.executablePath,
                finishedAt: new Date().toISOString(),
              },
            });
          }

          dispatch({
            type: 'link-store-game',
            payload: {
              storeGame,
              executablePath: result.executablePath,
              installDirectory: result.installDirectory,
            },
          });

          return { success: true };
        },
        addCustomGame: (payload: GameCreatePayload) => {
          dispatch({ type: 'add-custom', payload });
        },
        updateGame: (id: string, payload: Partial<GameEntry>) => {
          dispatch({ type: 'update', id, payload });
        },
        addStoreGame: (payload) => {
          if (isRemoteStore) {
            console.warn('Catálogo remoto é somente leitura.');
            return;
          }

          const idSafe = payload.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

          const unique = generateId();
          const suffix =
            unique
              .replace(/[^a-z0-9]/gi, '')
              .slice(0, 6)
              .toLowerCase() || unique;

          const id = idSafe.length > 0 ? `${idSafe}-${suffix}` : unique;

          dispatch({
            type: 'add-store',
            payload: {
              ...payload,
              id,
              createdAt: new Date().toISOString(),
              downloadStatus: { state: 'idle' },
            },
          });
        },
        editStoreGame: (id: string, payload: StoreGameCreatePayload) => {
          if (isRemoteStore) {
            console.warn('Catálogo remoto é somente leitura.');
            return;
          }

          dispatch({
            type: 'update-store',
            id,
            payload,
          });
        },
        removeStoreGame: (id: string) => {
          if (isRemoteStore) {
            console.warn('Catálogo remoto é somente leitura.');
            return;
          }

          dispatch({ type: 'remove-store', id });
        },
        setStoreDownloadStatus: (id: string, status: StoreDownloadStatus) => {
          dispatch({ type: 'set-store-status', id, status });
        },
        startStoreDownload: async (id: string, url: string, fileName: string) => {
          const api = window.electronAPI;
          dispatch({ type: 'set-store-status', id, status: { state: 'queued' } });

          if (!api?.startStoreDownload) {
            dispatch({
              type: 'set-store-status',
              id,
              status: { state: 'failed', message: 'Download não suportado neste ambiente.' },
            });
            return;
          }

          const game = storeGamesRef.current.find((item) => item.id === id);

          const result = await api.startStoreDownload({
            gameId: id,
            url,
            fileName,
            expectedExecutable: game?.expectedExecutable,
          });

          if (!result?.success) {
            dispatch({
              type: 'set-store-status',
              id,
              status: {
                state: 'failed',
                message: result?.message ?? 'Falha ao iniciar download.',
              },
            });
          }
        },
        isRemoteStore,
        remoteStoreUrl,
        refreshRemoteStore: fetchRemoteStore,
        exportStoreCatalog: exportCatalog,
        storeExportPath,
        writeStoreCatalogFile: async () => {
          if (!storeExportPath) {
            return { success: false, message: 'Caminho de exportação não configurado.' };
          }

          try {
            const data = exportCatalog();
            if (!window.electronAPI?.writeTextFile) {
              return { success: false, message: 'Exportação automática não suportada neste ambiente.' };
            }

            const result = await window.electronAPI.writeTextFile(storeExportPath, data);
            if (!result?.success) {
              return { success: false, message: result?.message ?? 'Falha ao gravar arquivo.' };
            }

            return { success: true, filePath: storeExportPath };
          } catch (error) {
            console.error('writeStoreCatalogFile', error);
            return {
              success: false,
              message: error instanceof Error ? error.message : 'Falha ao exportar catálogo.',
            };
          }
        },
      };
    },
    [state, isRemoteStore, remoteStoreUrl, fetchRemoteStore, storeExportPath],
  );

  return (
    <GameStoreContext.Provider value={value}>
      {children}
    </GameStoreContext.Provider>
  );
};

export const useGameStore = (): GameStoreValue => {
  const context = useContext(GameStoreContext);

  if (!context) {
    throw new Error('useGameStore deve ser usado dentro do GameStoreProvider');
  }

  return context;
};

