import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { useTheme } from '../theme';
import Avatar from './Avatar';
import Icon from './Icon';
import CommandPalette from './CommandPalette';
import { NotificationBell, NotificationsProvider } from '../notifications';

function Item({ to, icon, children, end }) {
  return <NavLink to={to} end={end}><Icon name={icon} /><span>{children}</span></NavLink>;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  const isAdmin = user.role === 'admin';
  const canApprove = isAdmin || user.role === 'manager';
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);
  useEffect(() => {
    const onKey = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearching((v) => !v); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <NotificationsProvider>
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <header className="topbar">
        <button className="icon" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" size={22} /></button>
        <div className="brand-mark"><span className="monogram">O</span><span className="wordmark">OrgFlow</span></div>
        <div className="topbar-actions">
          <button className="icon" onClick={() => setSearching(true)} aria-label="Search"><Icon name="search" size={20} /></button>
          <NotificationBell />
        </div>
      </header>
      <div className="scrim" onClick={() => setOpen(false)} />

      <aside className="sidebar" aria-label="Main navigation">
        <div className="brand-mark"><span className="monogram">O</span><span className="wordmark">OrgFlow</span>
          <span className="desk-bell"><NotificationBell /></span>
          <button className="icon close" onClick={() => setOpen(false)} aria-label="Close menu"><Icon name="close" /></button>
        </div>
        <button className="search-trigger" onClick={() => setSearching(true)}>
          <Icon name="search" size={16} /><span>Search</span><kbd>{isMac ? '⌘K' : 'Ctrl K'}</kbd>
        </button>

        <nav>
          <p className="nav-group">Company</p>
          <Item to="/" icon="home" end>Overview</Item>
          <Item to="/announcements" icon="megaphone">Announcements</Item>
          <Item to="/employees" icon="users">People</Item>
          <Item to="/org-chart" icon="sitemap">Org chart</Item>
          <Item to="/departments" icon="building">Departments</Item>

          <p className="nav-group">Time off</p>
          <Item to="/leave" icon="suitcase">My leave</Item>
          <Item to="/calendar" icon="calendar">Team calendar</Item>
          <Item to="/holidays" icon="flag">Holidays</Item>
          {canApprove && <Item to="/approvals" icon="approve">Approvals</Item>}

          {isAdmin && (<>
            <p className="nav-group">Administration</p>
            <Item to="/reports" icon="chart">Reports</Item>
            <Item to="/audit" icon="activity">Activity log</Item>
          </>)}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/account" className="who">
            <Avatar name={name} size={36} />
            <span><strong>{name}</strong><small>{user.role}</small></span>
          </NavLink>
          <div className="foot-actions">
            <button className="ghost" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} /> {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <button className="ghost" onClick={() => { logout(); nav('/login'); }}><Icon name="logout" /> Sign out</button>
          </div>
        </div>
      </aside>
      <main className="content"><Outlet /></main>
      {searching && <CommandPalette role={user.role} onClose={() => setSearching(false)} />}
    </div>
    </NotificationsProvider>
  );
}
