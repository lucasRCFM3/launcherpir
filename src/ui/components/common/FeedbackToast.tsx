import React, { useEffect } from 'react';

interface FeedbackToastProps {
  message: string;
  duration?: number;
  onClose: () => void;
}

export const FeedbackToast: React.FC<FeedbackToastProps> = ({
  message,
  duration = 3600,
  onClose,
}) => {
  useEffect(() => {
    const timeout = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onClose]);

  return (
    <div className="feedback-toast">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Fechar notificação">
        ×
      </button>
    </div>
  );
};

