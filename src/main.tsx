import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/overpass/400.css';
import '@fontsource/overpass/700.css';
import '@fontsource/overpass/900.css';
import './styles.css';
import { applyTheme } from './theme';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { configureReporter, installGlobalHandlers } from './errors/report';

// Problems people run into are reported without personal data (docs/MONITORING.md).
// Sending is off unless the build has an error-tracking address.
configureReporter({
  dsn: import.meta.env.VITE_SENTRY_DSN as string | undefined,
  release: import.meta.env.VITE_RELEASE as string | undefined,
  environment: import.meta.env.PROD ? 'production' : 'development',
});
installGlobalHandlers();
applyTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
