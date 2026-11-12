import { Component, type ReactNode } from 'react';

/**
 * Last line of defence: if a screen hits an error while drawing (for example
 * a damaged map), show a way out instead of a blank white page. Unsaved
 * editor changes are copied to this browser when the editor closes, so
 * opening the map again offers to recover them.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; at: string }> {
  state = { error: null as Error | null, at: '' };

  static getDerivedStateFromError(error: Error) {
    return { error, at: window.location.hash };
  }

  componentDidCatch(error: Error) {
    console.error(error);
  }

  componentDidMount() {
    window.addEventListener('hashchange', this.onHash);
  }

  componentWillUnmount() {
    window.removeEventListener('hashchange', this.onHash);
  }

  /** Going to another page clears the error, so the back button and links still work. */
  private onHash = () => {
    if (this.state.error && window.location.hash !== this.state.at) this.setState({ error: null, at: '' });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page-message" role="alert" data-testid="crash">
        <p><strong>Something went wrong showing this page.</strong></p>
        <p>Your saved work is safe. If you had changes that weren’t saved yet, this browser kept a copy: open the map again to recover them.</p>
        <div className="btn-row">
          <button className="btn" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn primary" onClick={() => { window.location.hash = '/'; }}>Back to maps</button>
        </div>
      </div>
    );
  }
}
