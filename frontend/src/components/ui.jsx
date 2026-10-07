import { useEffect } from 'react';

export function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <header><h2>{title}</h2><button className="icon" onClick={onClose} aria-label="Close">×</button></header>
        {children}
      </div>
    </div>
  );
}

export const Badge = ({ status }) => <span className={`badge ${status}`}>{status}</span>;

export const ErrorNote = ({ error }) => (error ? <div className="alert" role="alert">{error}</div> : null);

export const Empty = ({ children }) => <div className="empty">{children}</div>;

export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
