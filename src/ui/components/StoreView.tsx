import React, { useEffect, useMemo, useRef, useState } from 'react';

import { useGameStore } from '../state/GameStore';
import { StoreDownloadStatus, StoreGame } from '../types';
import { GameCard } from './common/GameCard';
import { EmptyState } from './common/EmptyState';
import { FeedbackToast } from './common/FeedbackToast';

interface StoreViewProps {
  searchTerm: string;
  onAddStoreGame?: () => void;
  onShowDownloads: (gameId: string) => void;
  onEditStoreGame?: (game: StoreGame) => void;
  onShowLibrary: (libraryEntryId?: string) => void;
}

const matchesSearch = (value: string, search: string) =>
  value.toLowerCase().includes(search.toLowerCase());

const sanitizeFileName = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || `jogo-${Date.now()}`;

const formatBytes = (bytes?: number, fractionDigits = 1) => {
  if (bytes === undefined || bytes === null) return '0 MB';
  if (bytes === 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const order = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** order;
  return `${value.toFixed(fractionDigits)} ${units[order]}`;
};

const describeStatus = (status?: StoreDownloadStatus) => {
  if (!status) return undefined;

  switch (status.state) {
    case 'queued':
      return 'Na fila para download';
    case 'downloading': {
      const received = formatBytes(status.received);
      const total = status.total ? formatBytes(status.total) : undefined;
      const speed = status.speed ? `${formatBytes(status.speed, 2)}/s` : undefined;
      const parts = [received, total ? `de ${total}` : null, speed ? `(${speed})` : null]
        .filter(Boolean)
        .join(' ');
      return parts || 'Baixando...';
    }
    case 'extracting':
      return 'Extraindo arquivos...';
    case 'ready':
      return undefined;
    case 'failed':
      return status.message ?? undefined;
    case 'cancelled':
      return status.message ?? undefined;
    case 'awaitingExtraction':
      return undefined;
    default:
      return undefined;
  }
};

export const StoreView: React.FC<StoreViewProps> = ({
  searchTerm,
  onAddStoreGame,
  onShowDownloads,
  onEditStoreGame,
  onShowLibrary,
}) => {
  const {
    storeGames,
    startStoreDownload,
    removeStoreGame,
    resumeExtraction,
    games,
    isRemoteStore,
    refreshRemoteStore,
    exportStoreCatalog,
    storeExportPath,
    writeStoreCatalogFile,
  } = useGameStore();
  const [toast, setToast] = useState<string | null>(null);
  const lastStatusesRef = useRef<Record<string, StoreDownloadStatus['state']>>({});

  const filteredGames = useMemo(() => {
    const term = searchTerm.trim();

    if (!term) {
      return storeGames;
    }

    return storeGames.filter(
      (game) =>
        matchesSearch(game.title, term) ||
        matchesSearch(game.developer, term) ||
        matchesSearch(game.description, term) ||
        game.tags.some((tag) => matchesSearch(tag, term)),
    );
  }, [searchTerm, storeGames]);

  const canManageStore = !isRemoteStore && typeof onAddStoreGame === 'function';

  useEffect(() => {
    const lastStatuses = lastStatusesRef.current;

    filteredGames.forEach((game) => {
      const currentState = game.downloadStatus?.state ?? 'idle';
      const previousState = lastStatuses[game.id];

      if (previousState !== currentState) {
        if (currentState === 'ready') {
          setToast(`${game.title} foi instalado e adicionado à biblioteca.`);
        } else if (currentState === 'failed' && game.downloadStatus?.message) {
          setToast(game.downloadStatus.message);
        }

        lastStatuses[game.id] = currentState;
      }
    });
  }, [filteredGames]);

  const handleDownload = async (game: StoreGame) => {
    const status = game.downloadStatus;

    if (status?.state === 'awaitingExtraction') {
      await handleExtract(game);
      return;
    }

    if (status && ['queued', 'downloading', 'extracting'].includes(status.state)) {
      onShowDownloads(game.id);
      return;
    }

    const sanitizedName = sanitizeFileName(game.title);
    const fileName = sanitizedName.endsWith('.zip') ? sanitizedName : `${sanitizedName}.zip`;

    await startStoreDownload(game.id, game.downloadUrl, fileName);
  };

  const handleRemove = (game: StoreGame) => {
    if (isRemoteStore || !onAddStoreGame) {
      setToast('Catálogo somente leitura.');
      return;
    }

    if (game.downloadStatus?.state && ['downloading', 'queued', 'extracting'].includes(game.downloadStatus.state)) {
      setToast('Finalize ou cancele o download antes de remover o jogo.');
      return;
    }

    const confirmed = window.confirm(`Remover ${game.title} da loja?`);

    if (confirmed) {
      removeStoreGame(game.id);
      setToast(`${game.title} removido da loja.`);
    }
  };

  const handleCancel = async (game: StoreGame) => {
    const api = window.electronAPI;

    if (!api?.cancelDownload) {
      setToast('Cancelamento não disponível.');
      return;
    }

    const result = await api.cancelDownload(game.id);

    if (!result?.success) {
      setToast(result?.message ?? 'Não foi possível cancelar o download.');
    } else {
      setToast('Download cancelado.');
    }
  };

  const handleExtract = async (game: StoreGame) => {
    const response = await resumeExtraction(game.id);

    if (!response.success) {
      setToast(response.message ?? 'Falha ao extrair o jogo.');
    } else {
      setToast(`${game.title} extraído com sucesso.`);
    }
  };

  return (
    <div className="view view--store">
      {toast ? (
        <FeedbackToast message={toast} onClose={() => setToast(null)} />
      ) : null}

      <div className="view__section">
        <div className="view__section-header">
          <h2 className="view__section-title">Catálogo</h2>
          {isRemoteStore ? (
            <button
              type="button"
              className="view__section-action"
              onClick={async () => {
                const success = await refreshRemoteStore();
                setToast(success ? 'Catálogo atualizado.' : 'Não foi possível atualizar o catálogo.');
              }}
            >
              Atualizar catálogo
            </button>
          ) : onAddStoreGame ? (
            <div className="view__section-actions">
              <button
                type="button"
                className="view__section-action"
                onClick={onAddStoreGame}
              >
                + Adicionar jogo
              </button>
              <button
                type="button"
                className="view__section-action"
                onClick={async () => {
                  try {
                    if (storeExportPath) {
                      const result = await writeStoreCatalogFile();
                      if (result.success) {
                        setToast(`Catálogo exportado para ${result.filePath ?? storeExportPath}.`);
                        return;
                      }
                      if (result.message) {
                        setToast(result.message);
                        return;
                      }
                    }

                    const data = exportStoreCatalog();
                    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'store-catalog.json';
                    document.body.appendChild(anchor);
                    anchor.click();
                    document.body.removeChild(anchor);
                    URL.revokeObjectURL(url);
                    setToast('Catálogo exportado com sucesso.');
                  } catch (error) {
                    console.error('Falha ao exportar catálogo', error);
                    setToast('Não foi possível exportar o catálogo.');
                  }
                }}
              >
                Exportar catálogo
              </button>
            </div>
          ) : null}
        </div>

        {filteredGames.length === 0 ? (
          <EmptyState
            title="Nenhum jogo na loja"
            description={
              onAddStoreGame && !isRemoteStore
                ? 'Adicione novos títulos à loja com links de download externos.'
                : 'Nenhum jogo disponível no catálogo compartilhado no momento.'
            }
            actionLabel={onAddStoreGame && !isRemoteStore ? 'Adicionar novo jogo' : undefined}
            onAction={!isRemoteStore ? onAddStoreGame : undefined}
          />
        ) : (
          <div className="game-grid">
            {filteredGames.map((game) => {
              const status = game.downloadStatus;
              const isActive =
                status?.state === 'queued' ||
                status?.state === 'downloading' ||
                status?.state === 'extracting';
              const awaitingExtraction = status?.state === 'awaitingExtraction';
              const existingLibraryEntry = games.find(
                (entry) => entry.storeId === game.id && entry.installed,
              );
              const libraryEntryId = existingLibraryEntry?.id ?? game.libraryEntryId;
              const libraryInstalled = Boolean(existingLibraryEntry);

              const progressValue = (() => {
                if (status?.state === 'downloading' && status.total) {
                  return Math.floor((status.received / status.total) * 100);
                }
                if (status?.state === 'extracting') {
                  return 100;
                }
                return undefined;
              })();

              const progressText = (() => {
                switch (status?.state) {
                  case 'downloading':
                    if (status.total) {
                      return `${Math.floor((status.received / status.total) * 100)}%`;
                    }
                    return 'Baixando...';
                  case 'queued':
                    return 'Na fila';
                  case 'extracting':
                    return 'Extraindo';
                  case 'ready':
                    return undefined;
                  case 'cancelled':
                    return undefined;
                  case 'awaitingExtraction':
                    return undefined;
                  default:
                    return undefined;
                }
              })();

              const showLibraryButton =
                libraryInstalled && !isActive && !awaitingExtraction && status?.state !== 'cancelled';

              const primaryLabel = (() => {
                if (showLibraryButton) {
                  return 'Ver na biblioteca';
                }

                if (!status) return 'Baixar';
                switch (status.state) {
                  case 'queued':
                    return 'Na fila';
                  case 'downloading':
                    return 'Baixando...';
                  case 'extracting':
                    return 'Extraindo...';
                  case 'awaitingExtraction':
                    return 'Extrair';
                  case 'ready':
                    return 'Baixar';
                  case 'failed':
                    return 'Baixar';
                  case 'cancelled':
                    return 'Baixar';
                  default:
                    return 'Baixar';
                }
              })();

              const primaryDisabled = isActive && !showLibraryButton;

              const handlePrimaryAction = () => {
                if (showLibraryButton) {
                  onShowLibrary(libraryEntryId);
                  return;
                }

                if (awaitingExtraction) {
                  handleExtract(game);
                  return;
                }
                handleDownload(game);
              };

              let secondaryLabel: string | undefined;
              let secondaryAction: (() => void) | undefined;
              let tertiaryLabel: string | undefined;
              let tertiaryAction: (() => void) | undefined;
              let quaternaryLabel: string | undefined;
              let quaternaryAction: (() => void) | undefined;

              if (isActive) {
                secondaryLabel = 'Cancelar';
                secondaryAction = () => handleCancel(game);
                tertiaryLabel = 'Progresso';
                tertiaryAction = () => onShowDownloads(game.id);
                quaternaryLabel = undefined;
                quaternaryAction = undefined;
              } else if (awaitingExtraction) {
                secondaryLabel = 'Cancelar';
                secondaryAction = () => handleCancel(game);
                tertiaryLabel = 'Progresso';
                tertiaryAction = () => onShowDownloads(game.id);
                quaternaryLabel = undefined;
                quaternaryAction = undefined;
              } else if (canManageStore && onEditStoreGame) {
                secondaryLabel = 'Editar';
                secondaryAction = () => onEditStoreGame(game);
                tertiaryLabel = 'Remover';
                tertiaryAction = () => handleRemove(game);
              } else {
                secondaryLabel = undefined;
                secondaryAction = undefined;
                tertiaryLabel = undefined;
                tertiaryAction = undefined;
              }

              return (
                <GameCard
                  key={game.id}
                  game={game}
                  variant="store"
                  primaryLabel={primaryLabel}
                  primaryDisabled={primaryDisabled}
                  onPrimaryAction={handlePrimaryAction}
                  secondaryLabel={secondaryLabel}
                  secondaryDisabled={secondaryLabel ? false : undefined}
                  onSecondaryAction={secondaryAction}
                  tertiaryLabel={tertiaryLabel}
                  tertiaryDisabled={tertiaryLabel ? false : undefined}
                  onTertiaryAction={tertiaryAction}
                  quaternaryLabel={quaternaryLabel}
                  quaternaryDisabled={quaternaryLabel ? false : undefined}
                  onQuaternaryAction={quaternaryAction}
                  progressValue={progressValue ?? (status?.state === 'extracting' ? 100 : undefined)}
                  progressText={progressText}
                  progressDescription={describeStatus(status)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

