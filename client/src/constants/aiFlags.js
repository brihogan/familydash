// Whether the badge-step AI tutor is on for a given person.
//
// This is a real per-user setting (`users.ai_tutor_enabled`, off by default,
// flipped by a parent in Settings → the person → "Ask AI about badge steps").
// The server enforces it on every endpoint; this is only so the UI doesn't
// offer something that would be rejected.
//
// Members are cached module-side because deeply nested step rows need a
// synchronous answer without threading a prop through every call site. The
// cache is short-lived on purpose: a parent who flips the toggle and navigates
// (no reload, so module state survives) must not keep seeing the old answer.
// `invalidateAiTutorFlags()` makes that instant; the TTL is the backstop for
// every path that forgets to call it.

import { useState, useEffect } from 'react';
import { familyApi } from '../api/family.api.js';

const TTL_MS = 30_000;

let members = null;
let fetchedAt = 0;
let inflight = null;

function fresh() {
  return members && Date.now() - fetchedAt < TTL_MS;
}

function load() {
  if (fresh()) return Promise.resolve(members);
  if (!inflight) {
    inflight = familyApi.getFamily()
      .then((data) => {
        members = data.members || data.users || [];
        fetchedAt = Date.now();
        return members;
      })
      .catch(() => members || [])
      .finally(() => { inflight = null; });
  }
  return inflight;
}

// Synchronous lookup for call sites that can't await (step rows, the resume
// pill). False until the members fetch lands, which is the safe direction to be
// wrong in — a component that renders the panel gates on the hook instead.
export function aiTutorEnabledFor(userId) {
  if (!members || userId == null) return false;
  const m = members.find((u) => String(u.id) === String(userId));
  return !!m?.ai_tutor_enabled;
}

// Returns { enabled, loaded }. `loaded` matters: without it every consumer
// renders its "the tutor is off" state for one frame before the answer arrives,
// which reads as a bug.
// First name for a family member, from the same cache. Empty until the members
// fetch lands, so treat it as a nicety rather than something to gate on.
export function memberFirstName(userId) {
  if (!members || userId == null) return '';
  const m = members.find((u) => String(u.id) === String(userId));
  return (m?.name || '').split(' ')[0];
}

export default function useAiTutorEnabled(userId) {
  const [state, setState] = useState(() => (
    fresh() ? { enabled: aiTutorEnabledFor(userId), loaded: true } : { enabled: false, loaded: false }
  ));

  useEffect(() => {
    if (userId == null) return;
    let cancelled = false;
    if (fresh()) {
      setState({ enabled: aiTutorEnabledFor(userId), loaded: true });
      return;
    }
    setState((s) => ({ ...s, loaded: false }));
    load().then(() => {
      if (!cancelled) setState({ enabled: aiTutorEnabledFor(userId), loaded: true });
    });
    return () => { cancelled = true; };
  }, [userId]);

  return state;
}

// Call after a parent changes the setting so the next read isn't stale.
export function invalidateAiTutorFlags() {
  members = null;
  fetchedAt = 0;
}
