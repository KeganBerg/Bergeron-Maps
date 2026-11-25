import { describe, expect, it } from 'vitest';
import { sendProblem, verifyProblem } from './signInProblem';
import { MESSAGES } from '../i18n/useLanguage';

describe('sign-in problems', () => {
  it('turns Supabase errors into reasons', () => {
    expect(sendProblem({ message: 'Email rate limit exceeded' })).toEqual({ kind: 'tooMany' });
    expect(sendProblem({ message: 'For security purposes, you can only request this after 42 seconds.' })).toEqual({ kind: 'wait', seconds: 42 });
    expect(sendProblem({ message: 'Error sending magic link email' })).toEqual({ kind: 'sendFailed' });
    expect(sendProblem({ message: 'Signups not allowed for otp' })).toEqual({ kind: 'noAccount' });
    expect(sendProblem({ message: 'Load failed' })).toEqual({ kind: 'offline' });
    expect(sendProblem({ message: 'Something odd' })).toEqual({ kind: 'other', message: 'Something odd' });
    expect(verifyProblem({ message: 'Token has expired or is invalid' }, 'badCode')).toEqual({ kind: 'badCode' });
    expect(verifyProblem({ message: 'Failed to fetch' }, 'link')).toEqual({ kind: 'offline' });
  });

  it('says every reason in every language', () => {
    for (const t of Object.values(MESSAGES)) {
      expect(t.signInProblem({ kind: 'wait', seconds: 42 })).toContain('42');
      expect(t.signInProblem({ kind: 'sendFailed' })).toContain('support@bergeronmaps.com');
      for (const kind of ['link', 'badCode', 'unavailable', 'tooMany', 'noAccount', 'offline', 'enterEmail', 'enterCode'] as const) {
        expect(t.signInProblem({ kind }).length).toBeGreaterThan(4);
      }
    }
    // Supabase's own text is English: the other languages say something they can read instead.
    expect(MESSAGES.es.signInProblem({ kind: 'other', message: 'Something odd' })).not.toContain('Something odd');
  });
});
