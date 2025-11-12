const TAG_LABELS: Record<string, string> = {
  Acao: 'Ação',
  RPG: 'RPG',
  Indie: 'Indie',
  Multiplayer: 'Multiplayer',
  FPS: 'FPS',
  Esporte: 'Esporte',
  Corrida: 'Corrida',
  Estrategia: 'Estratégia',
  Aventura: 'Aventura',
  Simulacao: 'Simulação',
  Coop: 'Co-op',
};

export const formatTag = (tag: string): string => TAG_LABELS[tag] ?? tag;

