import React, { useEffect, useMemo, useState } from 'react';

import { useGameStore } from '../state/GameStore';

interface AddGameModalProps {
  open: boolean;
  onClose: () => void;
}

type FormState = {
  title: string;
  description: string;
  developer: string;
  coverUrl: string;
  heroUrl: string;
  tags: string;
  size: string;
  executablePath: string;
};

const DEFAULT_FORM: FormState = {
  title: '',
  description: '',
  developer: '',
  coverUrl: '',
  heroUrl: '',
  tags: 'Acao, Multiplayer',
  size: '10 GB',
  executablePath: '',
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

export const AddGameModal: React.FC<AddGameModalProps> = ({ open, onClose }) => {
  const { addCustomGame } = useGameStore();
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    if (!open) {
      setForm(DEFAULT_FORM);
      setError(null);
      setValidating(false);
    }
  }, [open]);

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

  const validateExecutablePath = async (filePath: string) => {
    const api = window.electronAPI;

    if (!api?.validateExecutable) {
      return { success: true, filePath };
    }

    try {
      setValidating(true);
      const validation = await api.validateExecutable(filePath);

      if (!validation.success) {
        setError(validation.message);
        return validation;
      }

      return validation;
    } catch (validationError) {
      const message =
        validationError instanceof Error
          ? validationError.message
          : 'Falha ao validar o executável selecionado.';
      setError(message);
      return { success: false as const, message };
    } finally {
      setValidating(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!form.title.trim()) {
      setError('Informe o nome do jogo.');
      return;
    }

    if (!form.executablePath.trim()) {
      setError('Informe o caminho do executável (.exe).');
      return;
    }

    if (!form.coverUrl.trim()) {
      setError('Informe a URL da imagem (capa).');
      return;
    }

    const validation = await validateExecutablePath(form.executablePath.trim());

    if (!validation.success) {
      return;
    }

    addCustomGame({
      title: form.title.trim(),
      description:
        form.description.trim() ||
        'Jogo adicionado manualmente. Atualize a descrição quando quiser.',
      developer: form.developer.trim() || 'Desconhecido',
      coverUrl: form.coverUrl.trim(),
      heroUrl: form.heroUrl.trim() || form.coverUrl.trim(),
      tags: tags.length > 0 ? tags : ['Indie'],
      size: form.size.trim() || '5 GB',
      executablePath: validation.filePath,
    });

    onClose();
  };

  const handlePickExecutable = async () => {
    const api = window.electronAPI;

    if (api?.selectExecutable) {
      try {
        const result = await api.selectExecutable();

        if (result.canceled) {
          return;
        }

        const validation = await validateExecutablePath(result.filePath);

        if (!validation.success) {
          return;
        }

        updateField('executablePath', validation.filePath);
        return;
      } catch (selectError) {
        setError(
          selectError instanceof Error
            ? selectError.message
            : 'Falha ao selecionar o executável.',
        );
        return;
      }
    }

    const fallback = window.prompt(
      'Informe o caminho completo do executável (.exe)',
      form.executablePath,
    );

    if (fallback && fallback.trim()) {
      const validation = await validateExecutablePath(fallback.trim());

      if (!validation.success) {
        return;
      }

      updateField('executablePath', validation.filePath);
    }
  };

  return (
    <div className="modal modal--visible" role="dialog" aria-modal="true">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__container">
        <header className="modal__header">
          <div>
            <h2>Adicionar jogo manualmente</h2>
            <p>
              Vincule um jogo já instalado no seu computador preenchendo as
              informações abaixo.
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
                placeholder="Ex: Cyber Runner"
                required
              />
            </label>

            <label>
              Desenvolvedor / Estúdio
              <input
                type="text"
                value={form.developer}
                onChange={(event) => updateField('developer', event.target.value)}
                placeholder="Ex: Neon Labs"
              />
            </label>

            <label className="modal__full">
              Descrição
              <textarea
                value={form.description}
                onChange={(event) =>
                  updateField('description', event.target.value)
                }
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
              Tamanho (ex: 25 GB)
              <input
                type="text"
                value={form.size}
                onChange={(event) => updateField('size', event.target.value)}
                placeholder="25 GB"
              />
            </label>

            <label>
              Tags (separe por vírgula)
              <input
                type="text"
                value={form.tags}
                onChange={(event) => updateField('tags', event.target.value)}
                placeholder="Acao, Multiplayer"
              />
            </label>

            <label className="modal__full">
              Caminho do executável (.exe) *
              <div className="input-with-trigger">
                <input
                  type="text"
                  value={form.executablePath}
                  onChange={(event) =>
                    updateField('executablePath', event.target.value)
                  }
                  placeholder="C:\\Jogos\\MeuJogo\\MeuJogo.exe"
                  required
                />
                <button
                  type="button"
                  className="input-with-trigger__button"
                  onClick={handlePickExecutable}
                >
                  Procurar...
                </button>
              </div>
            </label>
          </div>

          {error ? <p className="modal__error">{error}</p> : null}
          {validating ? (
            <p className="modal__hint">Validando executável...</p>
          ) : null}

          <footer className="modal__footer">
            <button
              type="button"
              className="modal__secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button type="submit" className="modal__primary">
              Adicionar à biblioteca
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
};

