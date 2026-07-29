import { useCallback, useEffect, useState } from 'react';
import ClaudeTerminal from '../components/claude/ClaudeTerminal.jsx';
import { guestApi, getGuestToken, setGuestToken } from '../api/guest.api.js';

const shell = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#1a1b26',
  color: '#a9b1d6',
  padding: 24,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

const card = {
  width: '100%',
  maxWidth: 380,
  background: '#16161e',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: 28,
};

const input = {
  width: '100%',
  padding: '11px 12px',
  fontSize: 16, // 16px keeps iOS from zooming the viewport on focus
  color: '#c0caf5',
  background: '#1a1b26',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8,
  outline: 'none',
  boxSizing: 'border-box',
};

const label = { display: 'block', fontSize: 13, color: '#9ca3af', marginBottom: 6 };

export default function GuestBuildPage() {
  const [phase, setPhase] = useState('loading'); // loading | closed | form | terminal
  const [session, setSession] = useState(null);
  const [name, setName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // On load: if there's a token from a previous visit, try to resume with it.
  // The server re-checks the window, so a stale token from yesterday's session
  // just drops us back to the form.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (getGuestToken()) {
        try {
          const data = await guestApi.session();
          if (cancelled) return;
          setSession(data);
          setPhase('terminal');
          return;
        } catch {
          setGuestToken(null);
        }
      }

      try {
        const { open } = await guestApi.status();
        if (cancelled) return;
        setPhase(open ? 'form' : 'closed');
      } catch {
        if (!cancelled) setPhase('closed');
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const data = await guestApi.login(passcode.trim(), name.trim());
      setGuestToken(data.token);
      setSession(data);
      setPasscode('');
      setPhase('terminal');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not connect. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = useCallback(() => {
    setGuestToken(null);
    setSession(null);
    setPhase('form');
  }, []);

  // If the window closed mid-session the terminal can't recover, so drop back
  // to the closed screen rather than letting it reconnect against a dead door.
  const getTicket = useCallback(async () => {
    try {
      return await guestApi.getWsTicket();
    } catch (err) {
      const status = err.response?.status;
      if (status === 401 || status === 403) {
        setGuestToken(null);
        setSession(null);
        setPhase('closed');
      }
      throw err;
    }
  }, []);

  if (phase === 'loading') {
    return <div style={shell}><span style={{ color: '#6b7280' }}>Loading…</span></div>;
  }

  if (phase === 'closed') {
    return (
      <div style={shell}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🛠️</div>
          <h1 style={{ fontSize: 18, color: '#c0caf5', margin: '0 0 8px' }}>Building isn&apos;t open right now</h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0, lineHeight: 1.5 }}>
            Ask whoever set this up to turn it on, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'terminal' && session) {
    return (
      <ClaudeTerminal
        title={`${session.name} — /${session.folder}`}
        getTicket={getTicket}
        onClose={signOut}
      />
    );
  }

  return (
    <div style={shell}>
      <form style={card} onSubmit={submit}>
        <div style={{ fontSize: 32, marginBottom: 12, textAlign: 'center' }}>🛠️</div>
        <h1 style={{ fontSize: 20, color: '#c0caf5', margin: '0 0 6px', textAlign: 'center' }}>Let&apos;s build something</h1>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 22px', textAlign: 'center', lineHeight: 1.5 }}>
          Type your first name and the passcode to get your own workspace.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={label} htmlFor="guest-name">Your first name</label>
          <input
            id="guest-name"
            style={input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            autoCapitalize="words"
            maxLength={40}
            required
          />
          <p style={{ fontSize: 11, color: '#4b5563', margin: '6px 0 0' }}>
            If someone else here has your name, add your last initial.
          </p>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={label} htmlFor="guest-passcode">Passcode</label>
          <input
            id="guest-passcode"
            style={input}
            type="password"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            autoComplete="off"
            required
          />
        </div>

        {error && (
          <p style={{ fontSize: 13, color: '#f87171', margin: '0 0 14px' }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !name.trim() || !passcode.trim()}
          style={{
            width: '100%',
            padding: '12px',
            fontSize: 15,
            fontWeight: 600,
            color: '#1a1b26',
            background: busy ? '#4b5563' : '#7aa2f7',
            border: 'none',
            borderRadius: 8,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          {busy ? 'Connecting…' : 'Start building'}
        </button>
      </form>
    </div>
  );
}
