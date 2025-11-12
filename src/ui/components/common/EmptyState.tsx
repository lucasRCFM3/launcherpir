import React from 'react';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  actionLabel,
  onAction,
}) => (
  <div className="empty-state">
    <div className="empty-state__icon">✨</div>
    <h3 className="empty-state__title">{title}</h3>
    <p className="empty-state__description">{description}</p>

    {actionLabel ? (
      <button type="button" className="empty-state__action" onClick={onAction}>
        {actionLabel}
      </button>
    ) : null}
  </div>
);

