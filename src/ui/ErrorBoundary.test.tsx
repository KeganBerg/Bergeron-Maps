import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetReporter } from '../errors/report';
import { ErrorBoundary } from './ErrorBoundary';

function Throws({ error }: { error: Error }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    resetReporter();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.location.hash = '';
    sessionStorage.clear();
  });

  it('shows a way out and a code to give support', () => {
    render(<ErrorBoundary><Throws error={new Error('bad map')} /></ErrorBoundary>);
    expect(screen.getByTestId('crash')).toBeTruthy();
    expect(screen.getByTestId('crash-code').textContent).toMatch(/code [0-9A-F]{8}/);
  });

  it('after a new version went live, offers a reload instead of “something went wrong” (in the editor, without reloading by itself)', () => {
    window.location.hash = '#/edit/map_1';
    render(<ErrorBoundary><Throws error={new TypeError('Failed to fetch dynamically imported module: https://a.com/app/assets/x.js')} /></ErrorBoundary>);
    expect(screen.getByTestId('crash-update').textContent).toMatch(/just updated/);
    expect(screen.queryByTestId('crash')).toBeNull();
  });
});
