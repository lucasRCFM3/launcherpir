import React, { useMemo, useState } from 'react';

import { useGameStore } from '../state/GameStore';
import { GameEntry } from '../types';
import { GameCard } from './common/GameCard';
import { EmptyState } from './common/EmptyState';
import { FeedbackToast } from './common/FeedbackToast';

interface LibraryViewProps {
  searchTerm: string;
  onAddGame?: () => void;
}

const matchesSearch = (value: string, search: string) =>
  value.toLowerCase().includes(search.toLowerCase());

export const LibraryView: React.FC<LibraryViewProps> = ({ searchTerm, onAddGame }) => {
  const { games, updateGame, uninstallGame, deleteInstallation } = useGameStore();
  const [toast, setToast] = useState<string | null>(null);

  const installedGames = useMemo(
    () => games.filter((game) => game.installed),
    [games],
  );

  const filteredGames = useMemo(() => {
    if (!searchTerm.trim()) {
      return installedGames;
    }

    return installedGames.filter(
      (game) =>
        matchesSearch(game.title, searchTerm) ||
        matchesSearch(game.developer, searchTerm),
    );
  }, [installedGames, searchTerm]);

  const handleLaunch = async (game: GameEntry) => {
    if (!game.executablePath) {
      setToast('Defina o caminho do executável antes de iniciar o jogo.');
      return;
    }

    try {
      const result = await window.electronAPI?.launchGame(game.executablePath);

      if (result?.success) {
        setToast(`Executando ${game.title}...`);
        updateGame(game.id, {
          lastPlayed: new Date().toISOString(),
        });
      } else {
        setToast(result?.message ?? 'Não foi possível abrir o executável.');
      }
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'Erro inesperado ao iniciar o jogo.',
      );
    }
  };

  const handleUninstall = (game: GameEntry) => {
    const shouldRemove = window.confirm(
      `Deseja remover ${game.title} da biblioteca? O jogo continuará instalado no seu PC.`,
    );

    if (shouldRemove) {
      uninstallGame(game.id);
      setToast(`${game.title} foi removido da biblioteca.`);
    }
  };

  const handleDeleteInstall = async (game: GameEntry) => {
    const shouldDelete = window.confirm(
      `Desinstalar ${game.title}? A pasta ${game.installDirectory ?? 'do jogo'} será apagada permanentemente.`,
    );

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteInstallation(game.id);
      setToast(`${game.title} foi desinstalado e removido da biblioteca.`);
    } catch (error) {
      setToast(
        error instanceof Error
          ? error.message
          : 'Falha ao desinstalar o jogo.',
      );
    }
  };

  return (
    <div className="view view--library">
      {toast ? (
        <FeedbackToast message={toast} onClose={() => setToast(null)} />
      ) : null}

      {onAddGame ? (
        <div className="view__section-header">
          <h2 className="view__section-title">Jogos instalados</h2>
          <button type="button" className="view__section-action" onClick={onAddGame}>
            Adicionar jogo
          </button>
        </div>
      ) : null}

      {filteredGames.length === 0 ? (
        <EmptyState
          title={
            installedGames.length === 0
              ? 'Nenhum jogo instalado ainda'
              : 'Nenhum jogo encontrado'
          }
          description={
            installedGames.length === 0
              ? 'Instale novos jogos ou vincule jogos existentes manualmente.'
              : 'Tente ajustar o termo de busca ou explore novos títulos na aba "Jogos".'
          }
          actionLabel={onAddGame ? 'Adicionar jogo' : undefined}
          onAction={onAddGame}
        />
      ) : (
        <div className="game-grid">
          {filteredGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              variant="library"
              onPrimaryAction={() => handleLaunch(game)}
              onTertiaryAction={() => handleUninstall(game)}
              onQuaternaryAction={() => handleDeleteInstall(game)}
              primaryLabel="Jogar"
              tertiaryLabel="Remover da biblioteca"
              quaternaryLabel="Desinstalar"
              quaternaryDisabled={!game.installDirectory}
            />
          ))}
        </div>
      )}
    </div>
  );
};

