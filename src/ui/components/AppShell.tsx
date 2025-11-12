import React from 'react';

import { useGameStore } from '../state/GameStore';

export type AppShellTab = 'library' | 'store' | 'downloads';

interface AppShellProps {
  activeTab: AppShellTab;
  onChangeTab: (tab: AppShellTab) => void;
  searchTerm: string;
  onSearch: (value: string) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: Array<{
  key: AppShellTab;
  label: string;
  description: string;
}> = [
  { key: 'library', label: 'Biblioteca', description: 'Jogos instalados' },
  { key: 'store', label: 'Jogos', description: 'Explorar catálogo' },
  { key: 'downloads', label: 'Downloads', description: 'Histórico e progresso' },
];

export const AppShell: React.FC<AppShellProps> = ({
  activeTab,
  onChangeTab,
  searchTerm,
  onSearch,
  children,
}) => {
  const { games, isRemoteStore } = useGameStore();

  const installedCount = games.filter((game) => game.installed).length;

  const headline =
    activeTab === 'library'
      ? 'Sua Biblioteca'
      : activeTab === 'store'
        ? 'Descobrir Jogos'
        : 'Seus Downloads';

  const subheadline =
    activeTab === 'library'
      ? 'Acesse rapidamente seus jogos instalados e organize seu catálogo.'
      : activeTab === 'store'
        ? isRemoteStore
          ? 'Explore o catálogo compartilhado e instale seus jogos com praticidade.'
          : 'Cadastre novos títulos com links de download e acompanhe tudo em um só lugar.'
        : 'Acompanhe o progresso e o histórico de downloads realizados pelo launcher.';

  return (
    <div className="app-shell">
      <aside className="app-shell__sidebar">
        <div className="app-shell__logo">
          <span className="app-shell__logo-icon">🎮</span>
          <div>
            <p className="app-shell__logo-title">Launcher PIR</p>
            <p className="app-shell__logo-subtitle">Epic-inspired</p>
          </div>
        </div>

        <nav className="app-shell__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`app-shell__nav-item ${
                activeTab === item.key ? 'app-shell__nav-item--active' : ''
              }`}
              onClick={() => onChangeTab(item.key)}
            >
              <span className="app-shell__nav-label">{item.label}</span>
              <span className="app-shell__nav-description">
                {item.description}
              </span>
              {item.key === 'library' && installedCount > 0 ? (
                <span className="app-shell__badge">{installedCount}</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="app-shell__aside-actions">
          <div className="app-shell__info-card">
            <p className="app-shell__info-title">Dica rápida</p>
            <p className="app-shell__info-description">
              Vincule jogos instalados manualmente ou adicione novos títulos pela aba "Jogos".
            </p>
          </div>
        </div>
      </aside>

      <main className="app-shell__main">
        <header className="app-shell__topbar">
          <div>
            <h1 className="app-shell__headline">{headline}</h1>
            <p className="app-shell__subheadline">{subheadline}</p>
          </div>

          <div className="app-shell__actions">
            <div className="app-shell__search">
              <input
                type="search"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(event) => onSearch(event.target.value)}
              />
            </div>
          </div>
        </header>

        <section className="app-shell__content">{children}</section>
      </main>
    </div>
  );
};

