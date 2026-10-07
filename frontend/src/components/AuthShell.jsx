import Icon from './Icon';

/** Two-panel frame for sign-in, forgot and reset pages. */
export default function AuthShell({ children }) {
  return (
    <div className="auth">
      <aside className="auth-brand">
        <div className="brand-mark"><span className="monogram">O</span><span className="wordmark">OrgFlow</span></div>
        <div className="auth-copy">
          <h2>The people side of your company, in one place.</h2>
          <ul>
            <li><Icon name="suitcase" /> Ask for time off and see it approved</li>
            <li><Icon name="sitemap" /> Know who works where and who they report to</li>
            <li><Icon name="megaphone" /> Hear company news first</li>
          </ul>
        </div>
      </aside>
      <main className="auth-main">{children}</main>
    </div>
  );
}
