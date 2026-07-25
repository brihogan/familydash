// The step conversation panel.
//
// Purely presentational — everything it needs comes from useStepChat. It never
// knows what page it's on, because it's always inside a step: the context is
// the badge, the step text and the level, full stop. That's the whole reason
// this isn't a floating window that has to guess what it's looking at.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPaperPlane, faWandMagicSparkles } from '@fortawesome/free-solid-svg-icons';
import ChatMessage from './ChatMessage.jsx';
import ChipRow from './ChipRow.jsx';
import { MODE_LABELS } from './mockThreads.js';

// Two deliberate choices here, both learned the hard way in this panel:
//
//   • `getTarget` is re-read every tick rather than resolved once up front. The
//     answer is streaming in underneath while this runs, so a number captured
//     at send time is stale by the time the tween lands and the question stops
//     short of the top.
//   • Driven by setTimeout on elapsed time, not requestAnimationFrame.
//     rAF is suspended outright in a background tab, so the scroll simply never
//     happened; a throttled timer still fires and time-based easing just
//     completes in fewer, larger steps. (scrollTo({behavior:'smooth'}) has the
//     same problem, and can't be cancelled cleanly mid-flight either.)
const SCROLL_MS = 420;
const TICK_MS = 16;
const easeOut = (t) => 1 - (1 - t) ** 3;

function cancelScroll(handle) {
  if (!handle.current) return;
  clearTimeout(handle.current.timer);
  handle.current = null;
}

function smoothScrollTo(el, getTarget, handle, delayMs) {
  cancelScroll(handle);

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const run = () => {
    const from = el.scrollTop;
    if (reduced || Math.abs(getTarget() - from) < 2) {
      el.scrollTop = getTarget();
      handle.current = null;
      return;
    }

    const startedAt = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - startedAt) / SCROLL_MS);
      el.scrollTop = from + (getTarget() - from) * easeOut(t);
      if (t < 1) handle.current = { timer: setTimeout(step, TICK_MS) };
      else handle.current = null;
    };
    handle.current = { timer: setTimeout(step, TICK_MS) };
  };

  if (reduced || !delayMs) { run(); return; }
  handle.current = { timer: setTimeout(run, delayMs) };
}

function TypingDots() {
  return (
    <div className="self-start rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 px-4 py-3">
      <div className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span
            key={d}
            className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-gray-500 animate-bounce"
            style={{ animationDelay: `${d}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function StepChatPanel({
  chat, tier, mode, stepTitle = null, onCrossBadge, notice = null,
  onStartTogether = null, ownerName = null, viewerId = null, className = '',
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);
  const innerRef = useRef(null);
  const spacerRef = useRef(null);
  const lastKidId = useRef(null);
  const settled = useRef(false);
  const scrollAnim = useRef(null);
  const { messages, pending, reveal, busy } = chat;

  // Which turns get the entrance animation. Decided once per message id and
  // never revised, because a re-render mid-animation that dropped the class
  // would cut it off — and re-renders happen constantly while an answer streams.
  //
  // Seeded on the first render that actually HAS messages, not the first render
  // full stop — the thread arrives from a fetch, so seeding on an empty list
  // would mark the whole resumed history as new and replay it.
  const animFlags = useRef(null);
  if (animFlags.current === null) {
    if (messages.length) animFlags.current = new Map(messages.map((m) => [m.id, false]));
  } else {
    for (const m of messages) {
      if (!animFlags.current.has(m.id)) animFlags.current.set(m.id, true);
    }
  }

  // Scrolling model: when you ask something, YOUR question goes to the top of
  // the panel and the answer grows beneath it — so you start reading at the
  // first line and scroll down at your own pace. Pinning to the bottom (the
  // obvious chat default) does the opposite: the answer slides upward as it
  // streams and you're forever reading the last two lines of something whose
  // beginning has already gone.
  //
  // Two pieces make that work:
  //   1. A spacer under the conversation, sized so the newest question CAN
  //      reach the top even when the answer is short. Without it there's
  //      nothing to scroll into and the question stays wherever it landed.
  //   2. Scroll only when a NEW question appears — never mid-stream, which
  //      would yank the page out from under someone already reading.
  //
  // Styles are written straight to the nodes rather than through state so the
  // measure → size → scroll sequence happens in one layout pass, with no
  // intermediate frame where the spacer is stale.
  useLayoutEffect(() => {
    const el = listRef.current;
    const inner = innerRef.current;
    const spacer = spacerRef.current;
    if (!el || !inner || !spacer) return;

    let kidIdx = -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].role === 'kid') { kidIdx = i; break; }
    }

    // Nothing asked yet (just the opener) — sit at the top and read.
    if (kidIdx < 0) {
      spacer.style.height = '0px';
      if (!settled.current && messages.length) settled.current = true;
      return;
    }

    const kidNode = inner.children[kidIdx];
    if (!kidNode) return;

    // Measure with the spacer collapsed so it can't inflate its own input.
    //
    // The height matters exactly: with `spacer = clientHeight - below`, the
    // furthest the list can scroll works out to precisely the question's own
    // offset — so it can always reach the top and never a pixel further. Any
    // less and the browser clamps the scroll mid-answer, leaving the question
    // stranded partway down.
    // Collapsing the spacer to measure momentarily shortens the content, and
    // the browser clamps scrollTop to the new maximum the instant it does —
    // restoring the height afterwards does NOT put the scroll back. Without
    // this save/restore the view snaps to the top mid-answer, every time the
    // streaming text triggers a re-measure.
    const keepScroll = el.scrollTop;
    spacer.style.height = '0px';
    const below = inner.getBoundingClientRect().bottom - kidNode.getBoundingClientRect().top;
    spacer.style.height = `${Math.max(0, el.clientHeight - below)}px`;
    if (el.scrollTop !== keepScroll) el.scrollTop = keepScroll;

    // Only reposition on a genuinely new question.
    const newest = messages[kidIdx].id;
    if (lastKidId.current === newest) return;
    lastKidId.current = newest;

    const target = () => el.scrollTop
      + kidNode.getBoundingClientRect().top - el.getBoundingClientRect().top - 8;

    // Let the question finish landing before the panel carries it upward —
    // two movements in sequence read as one gesture, whereas overlapping them
    // just looks like a glitch. First open of a thread has nothing to watch,
    // so it jumps.
    const isFirst = !settled.current;
    settled.current = true;
    smoothScrollTo(el, target, scrollAnim, isFirst ? 0 : 220);
  }, [messages, reveal?.text, pending]);

  // Selecting text in a reply attaches it to the composer as a pill, rather
  // than floating a button over the selection. Android and iOS both pop their
  // own selection menu on top of anything we draw there, so the one place
  // guaranteed to be ours is the composer.
  //
  // Crucially the pill SURVIVES the selection being collapsed — dismissing the
  // system menu clears the selection, and losing the pill at that moment would
  // make the feature feel broken. It stays until sent or dismissed.
  const [attached, setAttached] = useState(null);

  useEffect(() => {
    if (chat.readOnly) return undefined;

    const read = () => {
      const sel = window.getSelection?.();
      const list = listRef.current;
      if (!sel || sel.isCollapsed || !list) return;   // keep whatever is attached

      const text = sel.toString().trim().replace(/\s+/g, ' ');
      if (text.length < 2 || text.length > 120) return;

      const node = sel.getRangeAt(0).commonAncestorContainer;
      const el = node.nodeType === 1 ? node : node.parentElement;
      // `.self-start` is the tutor's side — selecting your own question back
      // and asking about it is meaningless.
      if (!el?.closest?.('.self-start') || !list.contains(el)) return;

      setAttached(text);
    };

    document.addEventListener('selectionchange', read);
    return () => document.removeEventListener('selectionchange', read);
  }, [chat.readOnly]);

  // Don't leave a scroll tween running against a torn-down node.
  useEffect(() => () => cancelScroll(scrollAnim), []);

  // Three shapes:
  //   pill alone      → a lookup, exactly like tapping an underlined phrase
  //   pill + question → their own question, with the phrase quoted so the
  //                     tutor knows what "it" refers to
  //   question alone  → an ordinary question
  const submit = () => {
    const t = draft.trim();
    if (busy || (!t && !attached)) return;

    setDraft('');
    setAttached(null);
    window.getSelection?.()?.removeAllRanges();

    if (attached && !t) chat.askSelection(attached);
    else if (attached) chat.send(`About “${attached}” — ${t}`);
    else chat.send(t);
  };

  // Terms already looked up in this thread. A term question is the phrase plus
  // a question mark, so stripping it back gives the term.
  const explainedTerms = new Set(
    messages
      .filter((m) => m.role === 'kid' && m.source === 'term')
      .map((m) => m.text.replace(/\?$/, '')),
  );

  const lastAiIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) if (messages[i].role === 'ai') return i;
    return -1;
  })();

  return (
    <div className={`flex flex-col min-h-0 bg-white dark:bg-gray-900 ${className}`}>
      {/* Header. Below lg the panel replaces the step column rather than
          sitting beside it, so the step's own title is nowhere on screen —
          show it here instead of "Talk about this step", which by then is
          stating the obvious. Side by side, the step is already visible and
          the reading tier is the more useful thing to surface. */}
      <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
        {stepTitle && (
          <div className="flex items-start gap-2 lg:hidden">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="text-brand-500 text-sm mt-0.5 shrink-0" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
              {stepTitle}
            </h3>
          </div>
        )}

        <div className={stepTitle ? 'hidden lg:block' : ''}>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faWandMagicSparkles} className="text-brand-500 text-sm" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Talk about this step</h3>
          </div>
          <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
            {tier?.label} · {tier?.ages}
            {mode && MODE_LABELS[mode] ? ` · ${MODE_LABELS[mode]}` : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto px-4 py-3">
        <div ref={innerRef} className="flex flex-col gap-2.5">
          {messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              animate={animFlags.current?.get(m.id) === true}
              explained={explainedTerms}
              onAskTerm={busy || chat.readOnly ? null : chat.askTerm}
              viewerId={viewerId}
            >
              {/* Chips only under the newest AI message — older rows keep their
                  cross-badge card but stop offering stale follow-ups. */}
              {/* Nothing actionable until you're actually in the conversation:
                  a tappable chip in read-only mode was a way straight past the
                  "I'm here with them" gate, and the cross-badge jump would have
                  403'd for a parent anyway. */}
              {m.role === 'ai' && (
                <ChipRow
                  chips={i === lastAiIdx && !busy && !chat.readOnly ? m.chips : []}
                  crossBadge={chat.readOnly ? null : m.crossBadge}
                  disabled={busy}
                  onTap={chat.tapChip}
                  onCrossBadge={onCrossBadge}
                />
              )}
            </ChatMessage>
          ))}

          {chat.loading && <TypingDots />}
          {pending && <TypingDots />}
          {reveal && (
            <div className="self-start max-w-[95%] rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5">
              <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
                {reveal.text}
              </p>
            </div>
          )}

          {chat.error && (
            <div className="self-start max-w-[95%] rounded-xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 px-3 py-2">
              <p className="text-sm text-red-700 dark:text-red-300">{chat.error}</p>
            </div>
          )}
        </div>

        {/* Room below the conversation so the newest question can sit at the
            top even when its answer is short. A sibling of the message list,
            not a child, so measuring the list's height never includes it. */}
        <div ref={spacerRef} aria-hidden style={{ height: 0 }} />

      </div>

      {/* Why a cross-badge jump didn't happen (not enrolled, already finished). */}
      {notice && (
        <div className="shrink-0 border-t border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-900/20 px-4 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">{notice}</p>
        </div>
      )}

      {/* Composer — hidden for a reader (a parent looking at their kid's step);
          they can read the conversation but not add to it. */}
      {chat.readOnly ? (
        <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            {chat.messages.length
              ? 'You’re reading their conversation.'
              : 'Nothing here yet — this starts when they open the step.'}
          </p>

          {/* Working through the step together is the common case for a young
              kid, so a parent needs a way in. It stays THEIR conversation —
              saved to their log, pitched at their reading level — and anything
              the parent types is labelled, so nobody later mistakes a parent's
              question for the child's. */}
          {onStartTogether && (
            <>
              <button
                type="button"
                onClick={onStartTogether}
                className="mt-2 w-full py-2 rounded-xl text-sm font-semibold text-white bg-brand-500 hover:bg-brand-600 transition-colors"
              >
                👋 I’m here with {ownerName || 'them'}
              </button>
              <p className="mt-1.5 text-[11px] text-gray-400 dark:text-gray-500">
                Talks to {ownerName || 'them'} at their level, and saves to their conversations.
                Anything you type is marked as yours.
              </p>
            </>
          )}
        </div>
      ) : (
      <div className="shrink-0 border-t border-gray-200 dark:border-gray-700 p-3">
        {/* Text picked out of a reply, waiting to be sent. On its own it's a
            "what does this mean?"; with a question typed after it, it tells the
            tutor what "it" refers to. */}
        {attached && (
          <div className="mb-2 flex items-start gap-1.5 rounded-xl border border-brand-200 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10 px-2.5 py-1.5">
            <span className="text-sm italic text-brand-800 dark:text-brand-200 leading-snug line-clamp-2 flex-1">
              “{attached}”
            </span>
            <button
              type="button"
              onClick={() => setAttached(null)}
              aria-label="Remove"
              className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-300 hover:bg-brand-100 dark:hover:bg-brand-500/20"
            >
              <span className="text-sm leading-none">×</span>
            </button>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            }}
            rows={1}
            maxLength={500}
            placeholder={attached ? 'ask about it, or just send…' : 'ask something…'}
            className="flex-1 resize-none border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-xl px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-brand-400 max-h-32"
          />
          <button
            type="button"
            onClick={submit}
            disabled={(!draft.trim() && !attached) || busy}
            aria-label="Send"
            className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}
