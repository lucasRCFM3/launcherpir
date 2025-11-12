import React from 'react';

import { StoreDownloadStatus, StoreGame } from '../../types';
import { formatTag } from '../../utils/formatTag';

interface StoreHeroProps {
  game: StoreGame;
  onInstall: (game: StoreGame) => void;
  onShowDownloads?: (gameId: string) => void;
  onEdit?: (game: StoreGame) => void;
  onCancel?: (game: StoreGame) => void;
}

const getHeroLabel = (status?: StoreDownloadStatus) => {
  switch (status?.state) {
    case 'queued':
      return 'Na fila';
    case 'downloading':
      return 'Baixando...';
    case 'extracting':
      return 'Extraindo...';
    case 'awaitingExtraction':
      return 'Extrair agora';
    case 'ready':
      return 'Baixar novamente';
    case 'failed':
      return status.message?.toLowerCase().includes('cancel') ? 'Baixar novamente' : 'Baixar novamente';
    case 'cancelled':
      return 'Baixar novamente';
    default:
      return 'Baixar agora';
  }
};

const isHeroDisabled = (status?: StoreDownloadStatus) =>
  status?.state === 'queued' || status?.state === 'downloading' || status?.state === 'extracting';

export const StoreHero: React.FC<StoreHeroProps> = ({
  game,
  onInstall,
  onShowDownloads,
  onEdit,
  onCancel,
}) => {
  const active =
    game.downloadStatus?.state === 'queued' ||
    game.downloadStatus?.state === 'downloading' ||
    game.downloadStatus?.state === 'extracting';

  return (
    <section className="store-hero">
      <div className="store-hero__background">
        <img src={game.heroUrl ?? game.coverUrl} alt="" aria-hidden="true" />
        <div className="store-hero__overlay" />
      </div>

      <div className="store-hero__content">
        <h2 className="store-hero__title">{game.title}</h2>
        <p className="store-hero__description">{game.description}</p>

        <div className="store-hero__metadata">
          <span>{game.developer}</span>
          <span>{game.tags.map(formatTag).join(' • ')}</span>
          {game.size ? <span>{game.size}</span> : null}
        </div>

        <div className="store-hero__actions">
          <button
            type="button"
            className="store-hero__primary"
            onClick={() => onInstall(game)}
            disabled={isHeroDisabled(game.downloadStatus)}
          >
            {getHeroLabel(game.downloadStatus)}
          </button>

          {active && onCancel ? (
            <button
              type="button"
              className="store-hero__secondary"
              onClick={() => onCancel(game)}
            >
              Cancelar
            </button>
          ) : null}

          {active && onShowDownloads ? (
            <button
              type="button"
              className="store-hero__secondary"
              onClick={() => onShowDownloads(game.id)}
            >
              Ver progresso
            </button>
          ) : null}

          {onEdit && !active ? (
            <button
              type="button"
              className="store-hero__secondary"
              onClick={() => onEdit(game)}
            >
              Editar
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};

