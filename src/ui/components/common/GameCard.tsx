import React from 'react';

import { formatTag } from '../../utils/formatTag';

type GameCardVariant = 'library' | 'store';

type GameCardGame = {
  id: string;
  title: string;
  description: string;
  developer: string;
  coverUrl: string;
  tags: string[];
  size?: string;
  installDate?: string;
  installDirectory?: string;
  executablePath?: string;
};

interface GameCardProps {
  game: GameCardGame;
  variant: GameCardVariant;
  primaryLabel: string;
  secondaryLabel?: string;
  tertiaryLabel?: string;
  quaternaryLabel?: string;
  primaryDisabled?: boolean;
  secondaryDisabled?: boolean;
  tertiaryDisabled?: boolean;
  quaternaryDisabled?: boolean;
  progressValue?: number;
  progressText?: string;
  progressDescription?: string;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
  onTertiaryAction?: () => void;
  onQuaternaryAction?: () => void;
}

export const GameCard: React.FC<GameCardProps> = ({
  game,
  variant,
  primaryLabel,
  secondaryLabel,
  tertiaryLabel,
  quaternaryLabel,
  primaryDisabled = false,
  secondaryDisabled = false,
  tertiaryDisabled = false,
  quaternaryDisabled = false,
  progressValue,
  progressText,
  progressDescription,
  onPrimaryAction,
  onSecondaryAction,
  onTertiaryAction,
  onQuaternaryAction,
}) => {
  return (
    <article className={`game-card game-card--${variant}`}>
      <div className="game-card__cover">
        <img src={game.coverUrl} alt={game.title} />
      </div>

      <div className="game-card__body">
        <header className="game-card__header">
          <p className="game-card__developer">{game.developer}</p>
          <h3 className="game-card__title">{game.title}</h3>
        </header>

        <p className="game-card__description">{game.description}</p>

        <div className="game-card__tags">
          {game.tags.map((tag) => (
            <span key={tag} className="game-card__tag">
              {formatTag(tag)}
            </span>
          ))}
        </div>

        <div className="game-card__meta">
          <span className="game-card__size">{game.size}</span>
          {game.installDate ? (
            <span className="game-card__date">
              Instalado em{' '}
              {new Date(game.installDate).toLocaleDateString('pt-BR', {
                day: '2-digit',
                month: 'short',
              })}
            </span>
          ) : null}
        </div>

        {variant === 'library' && game.executablePath ? (
          <p className="game-card__path" title={game.executablePath}>
            {game.executablePath}
          </p>
        ) : null}

        <div className="game-card__actions">
          {typeof progressValue === 'number' || progressText ? (
            <div className="game-card__progress">
              {typeof progressValue === 'number' ? (
                <div className="game-card__progress-bar">
                  <div
                    className="game-card__progress-fill"
                    style={{ width: `${progressValue}%` }}
                  />
                </div>
              ) : (
                <div className="game-card__progress-dummy" />
              )}
              <span className="game-card__progress-label">
                {progressText ??
                  (typeof progressValue === 'number' ? `${progressValue}%` : '')}
              </span>
            </div>
          ) : null}
          {progressDescription ? (
            <p className="game-card__progress-description">{progressDescription}</p>
          ) : null}

          <button
            type="button"
            className="game-card__primary"
            disabled={primaryDisabled}
            onClick={onPrimaryAction}
          >
            {primaryLabel}
          </button>

          {secondaryLabel ? (
            <button
              type="button"
              className="game-card__secondary"
              onClick={onSecondaryAction}
              disabled={secondaryDisabled}
            >
              {secondaryLabel}
            </button>
          ) : null}

          {tertiaryLabel ? (
            <button
              type="button"
              className="game-card__tertiary"
              onClick={onTertiaryAction}
              disabled={tertiaryDisabled}
            >
              {tertiaryLabel}
            </button>
          ) : null}

          {quaternaryLabel ? (
            <button
              type="button"
              className="game-card__quaternary"
              onClick={onQuaternaryAction}
              disabled={quaternaryDisabled}
            >
              {quaternaryLabel}
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
};

