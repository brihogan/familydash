// State for one step's AI conversation.
//
// Two transports behind one interface:
//   • the real API (default) — threads live in ai_threads / ai_messages
//   • the mock store (`mock: true`) — used by the dev-only /ai-preview harness,
//     which has no auth and no real step to hang a thread off
//
// Everything that renders is transport-agnostic.

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ensureThread, getThread, appendMessage, pushTrail,
  mockReply, mockAnswerReview, MOCK_LATENCY_MS,
} from './mockThreads.js';
import { aiTutorApi } from '../../api/aiTutor.api.js';

// Word-at-a-time reveal. Long enough to feel like something is thinking, short
// enough that a 9-year-old doesn't wander off.
//
// Driven by elapsed time rather than "one word per tick": a backgrounded or
// throttled tab clamps timers to ~1/second, and a per-tick reveal would sit
// frozen mid-sentence for a minute. Time-based, a throttled tab just catches up
// in a couple of jumps.
const REVEAL_TICK_MS = 30;
const REVEAL_MS_PER_WORD = 22;
const REVEAL_MAX_MS = 1600;

// `canOpen` false = read-only: resume an existing thread but never create one.
// A parent looking at their kid's step shouldn't spend a model call, and
// shouldn't put words in a conversation the kid didn't start.
export default function useStepChat({ meta, tier, enabled, mock = false, canOpen = true }) {
  const stepId = meta?.stepId;
  const userId = meta?.userId;

  const [, bump] = useState(0);
  const [apiMessages, setApiMessages] = useState([]);
  const [apiMode, setApiMode] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);   // "…" before any text lands
  const [reveal, setReveal] = useState(null);      // { text } while typing
  const timers = useRef([]);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; timers.current.forEach(clearTimeout); };
  }, []);

  // Open (or resume) the thread the first time the panel mounts for this step.
  useEffect(() => {
    if (!enabled || stepId == null) return;

    if (mock) {
      ensureThread(meta);
      bump((n) => n + 1);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    // The opener costs a model call, so a second concurrent open (React's dev
    // StrictMode double-effect, a double-tap, a remount) doesn't generate its
    // own — it gets `generating: true` and waits for the first one's result.
    // Poll until it lands rather than rendering an empty conversation, which is
    // what left the panel blank until a reload.
    let attempts = 0;
    const MAX_ATTEMPTS = 20;   // ~30s at 1.5s — well past a slow generation
    const POLL_MS = 1500;

    const load = () => {
      aiTutorApi.getThread(userId, stepId, { open: canOpen })
        .then((data) => {
          if (cancelled || !alive.current) return;
          setApiMode(data.mode || null);

          if (data.generating && attempts < MAX_ATTEMPTS) {
            attempts += 1;
            timers.current.push(setTimeout(load, POLL_MS));
            return; // stay in the loading state — something IS coming
          }

          setApiMessages(data.messages || []);
          setLoading(false);
          if (data.generating) {
            setError('That took longer than expected. Close and reopen the step to try again.');
          }
        })
        .catch((err) => {
          if (cancelled || !alive.current) return;
          setLoading(false);
          setError(err?.response?.data?.error || 'Could not start the conversation.');
        });
    };

    load();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, stepId, userId, mock, canOpen]);

  const mockThread = mock && enabled && stepId != null ? getThread(stepId) : null;
  const messages = mock ? (mockThread?.messages || []) : apiMessages;

  // Reveal the text word by word, then commit the finished message.
  const deliver = useCallback((reply, commit) => {
    const words = reply.text.split(' ');
    const total = words.length;
    const durMs = Math.min(REVEAL_MAX_MS, total * REVEAL_MS_PER_WORD);
    const startedAt = Date.now();
    setPending(false);
    setReveal({ text: '' });

    const tick = () => {
      if (!alive.current) return;
      const elapsed = Date.now() - startedAt;
      const shown = durMs === 0 ? total : Math.min(total, Math.ceil((elapsed / durMs) * total));
      if (shown < total) {
        setReveal({ text: words.slice(0, shown).join(' ') });
        timers.current.push(setTimeout(tick, REVEAL_TICK_MS));
      } else {
        setReveal(null);
        commit();
      }
    };
    timers.current.push(setTimeout(tick, REVEAL_TICK_MS));
  }, []);

  const busy = pending || !!reveal;

  // One path for both a typed question and a tapped follow-up chip; `kind`
  // switches the server into answer-coach mode.
  const submit = useCallback((rawText, kind, source) => {
    const text = String(rawText || '').trim();
    if (!text || busy || loading) return;

    if (mock) {
      if (!mockThread) return;
      appendMessage(stepId, { role: 'kid', kind, text, source });
      bump((n) => n + 1);
      setPending(true);
      timers.current.push(setTimeout(() => {
        const reply = kind === 'answer_review'
          ? mockAnswerReview({ draft: text, tier, thread: getThread(stepId) })
          : mockReply({ thread: getThread(stepId), input: text, tier });
        deliver(reply, () => {
          appendMessage(stepId, {
            role: 'ai', kind: 'chat', text: reply.text,
            chips: reply.chips || [], crossBadge: reply.crossBadge || null,
          });
          if (reply.topic) pushTrail(stepId, reply.topic);
          bump((n) => n + 1);
        });
      }, MOCK_LATENCY_MS));
      return;
    }

    // Optimistically show the kid's own turn — the server persists it before
    // calling the model, so this matches what a refetch would return.
    const optimistic = { id: `local-${Date.now()}`, role: 'kid', kind, text, chips: [], source };
    setApiMessages((prev) => [...prev, optimistic]);
    setPending(true);
    setError(null);

    aiTutorApi.ask(userId, stepId, text, kind, source)
      .then(({ message }) => {
        if (!alive.current) return;
        deliver(message, () => setApiMessages((prev) => [...prev, message]));
      })
      .catch((err) => {
        if (!alive.current) return;
        setPending(false);
        setReveal(null);
        setError(err?.response?.data?.error || 'That did not go through. Try again?');
      });
  }, [mock, mockThread, stepId, userId, tier, busy, loading, deliver]);

  // `send` is what the composer calls; `tapChip` is what a suggested follow-up
  // calls. Same request, different provenance.
  const send = useCallback((text) => submit(text, 'chat', 'typed'), [submit]);
  const tapChip = useCallback((text) => submit(text, 'chat', 'chip'), [submit]);
  // Tapping an unfamiliar phrase in a reply. The question is literally the
  // phrase with a question mark — the same thing you'd type yourself, and
  // trivially reversible so we can tell which terms have already been covered.
  const askTerm = useCallback((term) => submit(`${term}?`, 'chat', 'term'), [submit]);
  const reviewAnswer = useCallback((draft) => submit(draft, 'answer_review'), [submit]);

  return {
    messages,
    mode: mock ? (mockThread?.mode || null) : apiMode,
    loading,
    error,
    readOnly: !canOpen,
    pending,
    reveal,
    busy,
    count: messages.length,
    send,
    tapChip,
    askTerm,
    reviewAnswer,
  };
}
