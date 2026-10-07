import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext({ success: () => {}, error: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((kind, message) => {
    const id = nextId.current++;
    setItems((xs) => [...xs.slice(-3), { id, kind, message }]);
    setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
  }, [dismiss]);

  const api = { success: (m) => push('success', m), error: (m) => push('error', m) };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
            <span>{t.message}</span>
            <button className="icon" onClick={() => dismiss(t.id)} aria-label="Dismiss">×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
