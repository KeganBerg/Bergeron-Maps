import { useState } from 'react';
import { gettingStartedSteps, showGettingStarted } from '../model/gettingStarted';
import { navigate } from '../router';
import { Icon } from '../ui/icons';

const HIDDEN_KEY = 'bm-getting-started-hidden';

/**
 * The account lead's checklist on the home page after buying online: name the site, build a
 * map, publish it, give the team access. Each step links to where it's done, and the help line
 * says how to reach us. It goes away once a map is live, or when hidden.
 */
export function GettingStarted({ sites, maps, onBuild }: {
  sites: string[]; maps: { publishedAt?: string | null }[]; onBuild: () => void;
}) {
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; } });
  const steps = gettingStartedSteps(sites, maps);
  if (!showGettingStarted(steps, hidden)) return null;
  const hide = () => { try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { /* hidden for this visit */ } setHidden(true); };
  const action = (key: string) =>
    key === 'name' ? <button className="btn small" onClick={() => navigate('/team')}>Sites &amp; people</button>
      : key === 'map' ? <button className="btn small primary" onClick={onBuild}>Build a map</button>
        : key === 'team' ? <button className="btn small" onClick={() => navigate('/team')}>Give access</button>
          : null;
  return (
    <section className="getting-started" aria-labelledby="gs-title" data-testid="getting-started">
      <div className="gs-head">
        <h3 id="gs-title">Getting started</h3>
        <button className="link small" onClick={hide}>Hide</button>
      </div>
      <ol className="gs-steps">
        {steps.map((s, i) => (
          <li key={s.key} className={s.done ? 'done' : ''} data-testid={`gs-${s.key}`}>
            <span className="gs-num" aria-hidden="true">{s.done ? <Icon name="check" size={14} /> : i + 1}</span>
            <span className="gs-text"><strong>{s.label}</strong><span className="muted small">{s.hint}</span></span>
            {!s.done && action(s.key)}
            {s.done && <span className="sr-only">Done</span>}
          </li>
        ))}
      </ol>
      <p className="muted small gs-help">
        Need a hand? Email <a href="mailto:bergeronmaps@gmail.com?subject=Help%20setting%20up%20Bergeron%20Maps">bergeronmaps@gmail.com</a> and
        we&apos;ll walk you through it, or set up a call.
      </p>
    </section>
  );
}
