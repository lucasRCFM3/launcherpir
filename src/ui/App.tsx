import React, { useEffect, useState } from 'react';

import { AddGameModal } from './components/AddGameModal';
import { AddStoreGameModal } from './components/AddStoreGameModal';
import { AppShell, AppShellTab } from './components/AppShell';
import { DownloadsView } from './components/DownloadsView';
import { LibraryView } from './components/LibraryView';
import { StoreView } from './components/StoreView';
import { GameStoreProvider, useGameStore } from './state/GameStore';
import { StoreGame } from './types';

export const App: React.FC = () => (
  <GameStoreProvider>
    <AppContent />
  </GameStoreProvider>
);

const AppContent: React.FC = () => {
  const { isRemoteStore } = useGameStore();
  const [activeTab, setActiveTab] = useState<AppShellTab>('library');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddStoreModal, setShowAddStoreModal] = useState(false);
  const [editingStoreGame, setEditingStoreGame] = useState<StoreGame | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedDownloadGameId, setFocusedDownloadGameId] = useState<string | null>(null);

  const handleShowDownloads = (gameId: string) => {
    setFocusedDownloadGameId(gameId);
    setActiveTab('downloads');
  };

  useEffect(() => {
    if (activeTab !== 'downloads') {
      setFocusedDownloadGameId(null);
    }
  }, [activeTab]);

  useEffect(() => {
    if (isRemoteStore) {
      setShowAddStoreModal(false);
      setEditingStoreGame(null);
    }
  }, [isRemoteStore]);

  const handleOpenCreateStoreGame = () => {
    setEditingStoreGame(null);
    setShowAddStoreModal(true);
  };

  const handleEditStoreGame = (game: StoreGame) => {
    setEditingStoreGame(game);
    setShowAddStoreModal(true);
  };

  return (
    <>
      <AppShell
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        searchTerm={searchTerm}
        onSearch={setSearchTerm}
      >
        {activeTab === 'library' ? (
          <LibraryView
            searchTerm={searchTerm}
            onAddGame={() => setShowAddModal(true)}
          />
        ) : activeTab === 'store' ? (
          <StoreView
            searchTerm={searchTerm}
            onAddStoreGame={!isRemoteStore ? handleOpenCreateStoreGame : undefined}
            onShowDownloads={handleShowDownloads}
            onEditStoreGame={!isRemoteStore ? handleEditStoreGame : undefined}
            onShowLibrary={(libraryEntryId) => {
              setActiveTab('library');
              if (libraryEntryId) {
                // espaço reservado caso implementemos foco específico na biblioteca
              }
            }}
          />
        ) : (
          <DownloadsView
            searchTerm={searchTerm}
            focusedGameId={focusedDownloadGameId}
          />
        )}
      </AppShell>

      <AddGameModal open={showAddModal} onClose={() => setShowAddModal(false)} />
      {!isRemoteStore && (
        <AddStoreGameModal
          open={showAddStoreModal}
          editingGame={editingStoreGame ?? undefined}
          onClose={() => setShowAddStoreModal(false)}
        />
      )}
    </>
  );
};

