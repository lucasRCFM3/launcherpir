import React, { useEffect, useMemo, useState } from 'react';

import { useGameStore } from '../state/GameStore';
import { StoreGame } from '../types';

interface AddStoreGameModalProps {
  open: boolean;
  onClose: () => void;
  editingGame?: StoreGame;
}

type FormState = {
  title: string;
  description: string;
  developer: string;
  coverUrl: string;
  heroUrl: string;
  tags: string;
  size: string;
  downloadUrl: string;
  expectedExecutable: string;
};

const DEFAULT_FORM: FormState = {
  title: '',
  description: '',
  developer: '',
  coverUrl: '',
  heroUrl: '',
  tags: 'Acao, Indie',
  size: '10 GB',
  downloadUrl: '',
  expectedExecutable: '',
};

const normalizeTag = (raw: string): string | null => {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  const ascii = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/gi, 'c');

  return ascii
    .split(/\s+/)
    .map((part) =>
      part.length > 0 ? part[0].toUpperCase() + part.slice(1).toLowerCase() : part,
    )
    .join(' ');
};

export const AddStoreGameModal: React.FC<AddStoreGameModalProps> = ({
  open,
  onClose,
  editingGame,
}) => {
  const { addStoreGame, editStoreGame } = useGameStore();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
      setError(null);
      return;
    }

    if (editingGame) {
      setForm({
        title: editingGame.title,
        description: editingGame.description,
        developer: editingGame.developer,
        coverUrl: editingGame.coverUrl,
        heroUrl: editingGame.heroUrl ?? '',
        tags: editingGame.tags.join(', '),
        size: editingGame.size ?? '',
        downloadUrl: editingGame.downloadUrl,
        expectedExecutable: editingGame.expectedExecutable ?? '',
      });
    } else {
      setForm(DEFAULT_FORM);
    }
    setError(null);
  }, [open, editingGame]);

  const tags = useMemo(
    () =>
      form.tags
        .split(',')
        .map(normalizeTag)
        .filter((tag): tag is string => Boolean(tag)),
    [form.tags],
  );

  if (!open) {
    return null;
  }

  const updateField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

    if (error) {
      setError(null);
    }
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setError('Informe o nome do jogo.');
      return;
    }

    if (!form.coverUrl.trim()) {
      setError('Informe a URL da capa.');
      return;
    }

    const downloadUrl = form.downloadUrl.trim();

    if (!downloadUrl) {
      setError('Informe o link de download.');
      return;
    }

    let parsedUrl: URL;

    try {
      parsedUrl = new URL(downloadUrl);
    } catch (error) {
      setError('Link de download inválido.');
      return;
    }

    const host = parsedUrl.hostname.toLowerCase();

    if (!host.includes('drive.google') && !host.includes('mediafire.com')) {
      setError('Informe um link do Google Drive ou MediaFire.');
      return;
    }

    const payload = {
      title: form.title.trim(),
      description:
        form.description.trim() ||
        'Jogo adicionado à loja manualmente. Atualize a descrição quando quiser.',
      developer: form.developer.trim() || 'Desconhecido',
      coverUrl: form.coverUrl.trim(),
      heroUrl: form.heroUrl.trim() || undefined,
      tags: tags.length > 0 ? tags : ['Indie'],
      size: form.size.trim() || undefined,
      downloadUrl,
      expectedExecutable: form.expectedExecutable.trim() || undefined,
    };

    if (editingGame) {
      editStoreGame(editingGame.id, payload);
    } else {
      addStoreGame(payload);
    }

    onClose();
  };

  return (
    <div className="modal modal--visible" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__container">
        <header className="modal__header">
          <div>
            <h2>{editingGame ? 'Editar jogo' : 'Adicionar jogo à loja'}</h2>
            <p>
              {editingGame
                ? 'Altere as informações do jogo cadastrado na loja.'
                : 'Cadastre um jogo com link de download externo. Após instalado, vincule o executável pela biblioteca.'}
            </p>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Fechar modal"
          >
            ×
          </button>
        </header>

        <form className="modal__form" onSubmit={handleSubmit}>
          <div className="modal__grid">
            <label>
              Nome do jogo *
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateField('title', event.target.value)}
                placeholder="Ex: Star Raiders"
                required
              />
            </label>

            <label>
              Desenvolvedor / Estúdio
              <input
                type="text"
                value={form.developer}
                onChange={(event) => updateField('developer', event.target.value)}
                placeholder="Ex: NovaLabs"
              />
            </label>

            <label className="modal__full">
              Descrição
              <textarea
                value={form.description}
                onChange={(event) => updateField('description', event.target.value)}
                placeholder="Resumo rápido sobre o jogo..."
                rows={3}
              />
            </label>

            <label>
              URL da capa *
              <input
                type="url"
                value={form.coverUrl}
                onChange={(event) => updateField('coverUrl', event.target.value)}
                placeholder="https://"
                required
              />
            </label>

            <label>
              URL da imagem de destaque
              <input
                type="url"
                value={form.heroUrl}
                onChange={(event) => updateField('heroUrl', event.target.value)}
                placeholder="https://"
              />
            </label>

            <label>
              Tamanho estimado (ex: 30 GB)
              <input
                type="text"
                value={form.size}
                onChange={(event) => updateField('size', event.target.value)}
                placeholder="30 GB"
              />
            </label>

            <label>
              Tags (separe por vírgula)
              <input
                type="text"
                value={form.tags}
                onChange={(event) => updateField('tags', event.target.value)}
                placeholder="Acao, Indie"
              />
            </label>

            <label className="modal__full">
              Link de download *
              <input
                type="url"
                value={form.downloadUrl}
                onChange={(event) => updateField('downloadUrl', event.target.value)}
                placeholder="https://mediafire.com/..."
                required
              />
            </label>

            <label className="modal__full">
              Nome ou caminho do executável (opcional)
              <input
                type="text"
                value={form.expectedExecutable}
                onChange={(event) => updateField('expectedExecutable', event.target.value)}
                placeholder="Ex: Game.exe ou bin\\Game.exe"
              />
            </label>
          </div>

          {error ? <p className="modal__error">{error}</p> : null}

          <footer className="modal__footer">
            <button
              type="button"
              className="modal__secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button type="submit" className="modal__primary">
              {editingGame ? 'Salvar alterações' : 'Adicionar à loja'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};
