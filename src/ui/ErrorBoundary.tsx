import { Component, type ErrorInfo, type ReactNode } from 'react';
import { errorDetails, isStaleCodeError, reloadForNewVersion, reportError, routeShape, type ErrorReport } from '../errors/report';

/**
 * Last line of defence: if a screen hits an error while drawing (for example
 * a damaged map), show a way out instead of a blank white page. Unsaved
 * editor changes are copied to this browser when the editor closes, so
 * opening the map again offers to recover them.
 */
interface State { error: Error | null; at: string; report: ErrorReport | null; copied: boolean }

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, at: '', report: null, copied: false };

  static getDerivedStateFromError(error: Error) {
    return { error, at: window.location.hash };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // A page from the previous version asked for code that's gone: reload into the new
    // version (not in the editor, where unsaved changes would be lost; Reload is offered).
    if (isStaleCodeError(error)) {
      if (routeShape().startsWith('#/edit') || reloadForNewVersion()) return;
      // Already reloaded once and the files are still missing: a broken deploy, worth reporting.
    }
    const component = info.componentStack?.trim().split('\n')[0]?.trim().replace(/^at /, '');
    this.setState({ report: reportError(error, 'crash', { component }) });
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.onHash);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.onHash);
  }

  /** Going to another page clears the error, so the back button and links still work. */
  private onHash = () => {
    if (this.state.error && window.location.hash !== this.state.at) this.setState({ error: null, at: '', report: null, copied: false });
  };

  private copy = () => {
    const r = this.state.report;
    if (!r) return;
    void navigator.clipboard?.writeText(errorDetails(r)).then(() => this.setState({ copied: true }), () => {});
  };

  render() {
    const { error, report, copied } = this.state;
    if (!error) return this.props.children;
    if (isStaleCodeError(error))
      return (
        <div className="page-message" role="alert" data-testid="crash-update">
          <p><strong>Bergeron Maps was just updated.</strong></p>
          <p>Reload to get the latest version. Your saved work is safe, and changes that weren’t saved yet are kept in this browser.</p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    return (
      <div className="page-message" role="alert" data-testid="crash">
        <p><strong>Something went wrong showing this page.</strong></p>
        <p>Your saved work is safe. If you had changes that weren’t saved yet, this browser kept a copy: open the map again to recover them.</p>
        {report && (
          <p className="muted" data-testid="crash-code">
            If it keeps happening, send us code <strong>{report.code}</strong>.{' '}
            <button type="button" className="link" onClick={this.copy}>{copied ? 'Details copied' : 'Copy details'}</button>
          </p>
        )}
        <div className="btn-row">
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn primary" onClick={() => { window.location.hash = '/'; }}>Back to maps</button>
        </div>
      </div>
    );
  }
}
