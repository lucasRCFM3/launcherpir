import React, { useMemo, useState } from 'react';

import { useGameStore } from '../state/GameStore';
import { StoreDownloadStatus } from '../types';
import { FeedbackToast } from './common/FeedbackToast';

interface DownloadsViewProps {
  searchTerm: string;
  focusedGameId?: string | null;
}

const formatBytes = (bytes?: number, fractionDigits = 1) => {
  if (!bytes || Number.isNaN(bytes)) return '0 B';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** order;
  return `${value.toFixed(fractionDigits)} ${units[order]}`;
};

const getStateLabel = (state: StoreDownloadStatus['state']) => {
  switch (state) {
    case 'queued':
      return 'Na fila';
    case 'downloading':
      return 'Baixando';
    case 'extracting':
      return 'Extraindo';
    case 'ready':
      return 'Concluído';
    case 'cancelled':
      return 'Cancelado';
    case 'awaitingExtraction':
      return '';
    default:
      return 'Idle';
  }
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR')}`;
};

export const DownloadsView: React.FC<DownloadsViewProps> = ({
  searchTerm,
  focusedGameId,
}) => {
  const {
    downloadRecords,
    storeGames,
    removeDownloadRecord,
    clearDownloadRecords,
    resumeExtraction,
  } = useGameStore();
  const [toast, setToast] = useState<string | null>(null);
  const lowerTerm = searchTerm.trim().toLowerCase();

  const entries = useMemo(() => {
    const storeMap = new Map(storeGames.map((game) => [game.id, game]));

    return downloadRecords
      .filter((record) => {
        if (!lowerTerm) return true;
        return (
          record.title.toLowerCase().includes(lowerTerm) ||
          record.sourceUrl.toLowerCase().includes(lowerTerm)
        );
      })
      .map((record) => {
        const liveStatus = storeMap.get(record.gameId)?.downloadStatus;
        const liveState = liveStatus?.state;
        const activeStates: Array<StoreDownloadStatus['state']> = ['queued', 'downloading', 'extracting'];
        const isActive = Boolean(liveState && activeStates.includes(liveState));
        const status: StoreDownloadStatus['state'] = liveState ?? record.state;

        const received = (() => {
          if (isActive && liveStatus) {
            switch (liveStatus.state) {
              case 'downloading':
                return liveStatus.received;
              case 'extracting':
                return liveStatus.received;
              default:
                return record.sizeBytes;
            }
          }
          if (status === 'awaitingExtraction') {
            return record.sizeBytes;
          }
          return record.sizeBytes;
        })();
        const total = isActive
          ? liveStatus?.state === 'downloading'
            ? liveStatus.total
            : liveStatus?.state === 'ready'
              ? liveStatus.totalBytes
              : liveStatus?.state === 'extracting'
                ? liveStatus.total
                : undefined
          : record.sizeBytes;
        const speed = isActive && liveStatus?.state === 'downloading' ? liveStatus.speed : undefined;

        const progressValue = (() => {
          if (isActive && liveStatus?.state === 'downloading' && liveStatus.total) {
            return Math.floor((liveStatus.received / liveStatus.total) * 100);
          }
          if (isActive && liveStatus?.state === 'extracting') {
            return 100;
          }
          return undefined;
        })();

        return {
          record,
          status,
          received,
          total,
          speed,
          progressValue,
        };
      });
  }, [downloadRecords, storeGames, lowerTerm]);

  if (entries.length === 0) {
    return (
      <div className="view__section">
        <h2 className="view__section-title">Downloads recentes</h2>
        <p className="app-shell__subheadline">
          Seus downloads aparecerão aqui assim que começarem.
        </p>
      </div>
    );
  }

  const handleRemoveRecord = (recordId: string) => {
    removeDownloadRecord(recordId);
  };

  const handleCancelRecord = async (gameId: string) => {
    const api = window.electronAPI;

    if (!api?.cancelDownload) {
      setToast('Cancelamento não disponível.');
      return;
    }

    const result = await api.cancelDownload(gameId);

    if (!result?.success) {
      setToast(result?.message ?? 'Não foi possível cancelar o download.');
    } else {
      setToast('Download cancelado.');
    }
  };

  const handleExtractRecord = async (gameId: string) => {
    const result = await resumeExtraction(gameId);
    if (!result.success) {
      setToast(result.message ?? 'Falha ao extrair o jogo.');
    } else {
      setToast('Extração concluída com sucesso.');
    }
  };

  const handleClearAll = () => {
    if (entries.length === 0) {
      return;
    }

    const confirmClear = window.confirm('Remover todo o histórico de downloads?');
    if (confirmClear) {
      clearDownloadRecords();
    }
  };

  return (
    <div className="view__section">
      {toast ? <FeedbackToast message={toast} onClose={() => setToast(null)} /> : null}
      <div className="view__section-header">
        <h2 className="view__section-title">Downloads</h2>
        <button
          type="button"
          className="view__section-action"
          onClick={handleClearAll}
        >
          Limpar histórico
        </button>
      </div>
      <div className="downloads-list">
        {entries.map(({ record, status, received, total, speed, progressValue }) => {
          const isFocused = focusedGameId && record.gameId === focusedGameId;
          const totalText = total ? formatBytes(total) : '—';
          const receivedText = status === 'ready' ? totalText : formatBytes(received);
          const speedText = speed ? `${formatBytes(speed, 2)}/s` : undefined;
          const isActiveState = status === 'queued' || status === 'downloading' || status === 'extracting';
          const awaitingExtractionState = status === 'awaitingExtraction';
          const canRemove = !isActiveState && !awaitingExtractionState;

          return (
            <div
              key={record.id}
              className={`download-card ${isFocused ? 'download-card--active' : ''}`}
            >
              <div className="download-card__header">
                <h3 className="download-card__title">{record.title}</h3>
                <div className="download-card__header-actions">
                  <span className="download-card__status">{getStateLabel(status)}</span>
                  {awaitingExtractionState ? (
                    <>
                      <button
                        type="button"
                        className="download-card__remove"
                        onClick={() => handleExtractRecord(record.gameId)}
                      >
                        Extrair
                      </button>
                      <button
                        type="button"
                        className="download-card__remove"
                        onClick={() => handleCancelRecord(record.gameId)}
                      >
                        Cancelar
                      </button>
                    </>
                  ) : null}
                  {isActiveState ? (
                    <button
                      type="button"
                      className="download-card__remove"
                      onClick={() => handleCancelRecord(record.gameId)}
                    >
                      Cancelar
                    </button>
                  ) : null}
                  {canRemove ? (
                    <button
                      type="button"
                      className="download-card__remove"
                      onClick={() => handleRemoveRecord(record.id)}
                    >
                      Remover
                    </button>
                  ) : null}
                </div>
              </div>

              {status === 'downloading' || status === 'extracting' ? (
                <div className="download-card__progress">
                  <div className="download-card__progress-bar">
                    <div
                      className="download-card__progress-fill"
                      style={{ width: `${progressValue ?? (status === 'extracting' ? 100 : 0)}%` }}
                    />
                  </div>
                  <span className="download-card__progress-text">
                    {status === 'extracting'
                      ? 'Extraindo'
                      : progressValue !== undefined
                        ? `${progressValue}%`
                        : '—'}
                  </span>
                </div>
              ) : null}

              <div className="download-card__meta">
                <span>
                  {receivedText}
                  {total ? ` / ${totalText}` : ''}
                </span>
                {speedText ? <span>{speedText}</span> : null}
                <span>Iniciado: {formatDateTime(record.startedAt)}</span>
                {record.finishedAt ? <span>Finalizado: {formatDateTime(record.finishedAt)}</span> : null}
                {record.installDirectory ? (
                  <span>Instalado em: {record.installDirectory}</span>
                ) : null}
                {record.executablePath ? <span>Executável: {record.executablePath}</span> : null}
                {record.destinationPath && !record.installDirectory ? (
                  <span>Arquivo: {record.destinationPath}</span>
                ) : null}
                {record.errorMessage ? <span>Erro: {record.errorMessage}</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
