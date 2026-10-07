import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import Icon from './components/Icon';

const Ctx = createContext({ items: [], unread: 0, refresh: () => {}, markRead: () => {}, markAll: () => {} });

/** One poller for the whole app: every minute and whenever the tab regains focus. */
export function NotificationsProvider({ children }) {
  const [state, setState] = useState({ items: [], unread: 0 });

  const refresh = useCallback(() => api('/notifications?limit=15')
    .then((d) => setState({ items: d.items, unread: d.unreadCount })).catch(() => {}), []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  const markRead = useCallback(async (id) => {
    setState((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, read: true } : n)), unread: Math.max(0, s.unread - (s.items.find((n) => n.id === id && !n.read) ? 1 : 0)) }));
    api(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }, []);
  const markAll = useCallback(async () => {
    setState((s) => ({ items: s.items.map((n) => ({ ...n, read: true })), unread: 0 }));
    api('/notifications/read-all', { method: 'POST' }).catch(() => {});
  }, []);

  return <Ctx.Provider value={{ ...state, refresh, markRead, markAll }}>{children}</Ctx.Provider>;
}

const timeAgo = (iso) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function NotificationBell() {
  const { items, unread, refresh, markRead, markAll } = useContext(Ctx);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const nav = useNavigate();

  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [open, refresh]);

  const go = (n) => { if (!n.read) markRead(n.id); setOpen(false); if (n.link) nav(n.link); };

  return (
    <div className="bell" ref={ref}>
      <button className="icon bell-btn" onClick={() => setOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="bell-dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-pop" role="dialog" aria-label="Notifications">
          <div className="notif-head"><h2>Notifications</h2>
            <button className="link" onClick={markAll} disabled={!unread}>Mark all as read</button></div>
          {items.length === 0 ? <p className="empty">You're all caught up.</p> : (
            <ul>{items.map((n) => (
              <li key={n.id}>
                <button className={`notif${n.read ? '' : ' unread'}`} onClick={() => go(n)}>
                  <span className="notif-title">{n.title}</span>
                  {n.body && <span className="notif-body">{n.body}</span>}
                  <small>{timeAgo(n.createdAt)}</small>
                </button>
              </li>))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
