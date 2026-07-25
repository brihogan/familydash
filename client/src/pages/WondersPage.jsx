// "Things you wondered about" — every step conversation, newest first.
//
// This is the screen that tells us whether the feature works. If these chains
// are one message long, the follow-up chips aren't good enough and the rabbit
// hole isn't happening. Parent-visible by design (and the kid is told so).
//
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faChevronLeft, faTriangleExclamation, faCircleInfo } from '@fortawesome/free-solid-svg-icons';
import { IconDisplay } from '../components/shared/IconPicker.jsx';
import { MODE_LABELS } from '../components/ai/mockThreads.js';
import useWonders from '../components/ai/useWonders.js';
import { aiTutorApi } from '../api/aiTutor.api.js';
import { BADGE_LEVELS } from '../constants/badgeLevels.js';
import useAiTutorEnabled from '../constants/aiFlags.js';

// Full transcript, loaded on demand. Fetching it also marks a flagged thread as
// seen, so opening one clears its warning.
function Transcript({ userId, threadId }) {
  const [messages, setMessages] = useState(null);

  useEffect(() => {
    let cancelled = false;
    aiTutorApi.getConversation(userId, threadId)
      .then((d) => { if (!cancelled) setMessages(d.messages || []); })
      .catch(() => { if (!cancelled) setMessages([]); });
    return () => { cancelled = true; };
  }, [userId, threadId]);

  if (!messages) {
    return <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">Loading…</p>;
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2">
      <p className="text-[11px] text-gray-400 dark:text-gray-500 text-right">
        Outlined bubbles were typed, not tapped
      </p>
      {messages.map((m) => {
        if (m.kind === 'handoff') {
          return (
            <p key={m.id} className="text-xs italic text-gray-400 dark:text-gray-500">↩ {m.text}</p>
          );
        }
        if (m.role === 'kid') {
          // Outlined = they typed it themselves. Filled = they tapped one of the
          // suggested follow-ups. A thread of nothing but filled bubbles is the
          // tutor leading; the outlined ones are them reaching for something.
          // An answer they wrote for the step is typed by definition.
          const typed = m.source === 'typed' || m.kind === 'answer_review';
          return (
            <div
              key={m.id}
              title={typed ? 'Typed themselves' : 'Tapped a suggested question'}
              className={`self-end max-w-[85%] rounded-2xl rounded-br-sm px-3 py-1.5 ${
                typed
                  ? 'bg-brand-500 ring-2 ring-offset-2 ring-brand-400 dark:ring-brand-300 ring-offset-white dark:ring-offset-gray-800'
                  : 'bg-brand-500'
              }`}
            >
              {m.kind === 'answer_review' && (
                <p className="text-[10px] uppercase tracking-wider text-white/70 mb-0.5">their answer</p>
              )}
              <p className="text-sm text-white whitespace-pre-line">{m.text}</p>
            </div>
          );
        }
        return (
          <div key={m.id} className="self-start max-w-[95%] rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-700/60 px-3 py-1.5">
            <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-line">{m.text}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function WondersPage() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { enabled: on, loaded: flagLoaded } = useAiTutorEnabled(userId);
  const { threads, loading } = useWonders(userId, on);
  const [openId, setOpenId] = useState(null);

  return (
    <div className="max-w-2xl mx-auto px-4 py-5">
      <button
        onClick={() => navigate(-1)}
        className="mb-3 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        <FontAwesomeIcon icon={faChevronLeft} className="mr-1.5 text-xs" />
        Back
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        🤔 Things you wondered about
      </h1>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Every question you asked while working on a badge step.
      </p>

      {flagLoaded && !on && (
        <p className="mt-8 text-sm text-gray-400 dark:text-gray-500">
          The badge-step AI tutor is turned off for this person. A parent can turn it on in
          Settings → Family &amp; Chores → the person → “Ask AI about badge steps”.
        </p>
      )}

      {on && !loading && threads.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-4xl">🌱</p>
          <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
            Nothing yet. Open a badge step and tap a question to start digging.
          </p>
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {threads.map((t) => (
          <div
            key={t.threadId}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4"
          >
            <div className="flex items-center gap-2">
              {t.badgeImageFile ? (
                <img src={`/api/uploads/badges/${t.badgeImageFile}`} alt="" className="w-7 h-7 rounded-full object-cover" />
              ) : (
                <span className="text-lg leading-none"><IconDisplay value={t.badgeEmoji} fallback="✦" /></span>
              )}
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.badgeName}</p>
              <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">{t.messageCount} messages</span>
            </div>

            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              {BADGE_LEVELS[t.badgeLevel]?.label || t.badgeLevel}
              {t.mode && MODE_LABELS[t.mode] ? ` · ${MODE_LABELS[t.mode]}` : ''}
            </p>

            <p className="mt-2 text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
              {t.stepText}
            </p>

            {/* Parent-only. The tutor already told them to talk to a grown-up —
                this makes sure the grown-up hears about it. */}
            {t.flagged && (() => {
              const urgent = t.flagLevel === 'urgent';
              return (
                <div className={`mt-2 rounded-lg border px-3 py-2 ${
                  urgent
                    ? 'border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-900/20'
                    : 'border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20'
                }`}>
                  <p className={`text-xs font-semibold ${
                    urgent ? 'text-red-800 dark:text-red-200' : 'text-amber-800 dark:text-amber-200'
                  }`}>
                    <FontAwesomeIcon icon={urgent ? faTriangleExclamation : faCircleInfo} className="mr-1.5" />
                    {urgent ? 'Worth a chat' : 'Something they asked about'}
                  </p>
                  {t.flagReason && (
                    <p className={`mt-1 text-xs ${
                      urgent ? 'text-red-800/90 dark:text-red-200/90' : 'text-amber-800/90 dark:text-amber-200/90'
                    }`}>{t.flagReason}</p>
                  )}
                </div>
              );
            })()}

            {/* The breadcrumb — this is the rabbit hole made visible. */}
            {t.trail?.length > 0 && (
              <p className="mt-2 text-sm text-brand-600 dark:text-brand-400">
                {t.trail.join(' → ')}
              </p>
            )}

            <div className="mt-3 flex items-center gap-4">
              <button
                onClick={() => navigate(`/tasks/${userId}/${t.taskSetId}?openStep=${t.stepId}`)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline"
              >
                Reopen
                <FontAwesomeIcon icon={faArrowRight} className="text-[10px]" />
              </button>
              <button
                onClick={() => setOpenId(openId === t.threadId ? null : t.threadId)}
                className="text-xs font-semibold text-gray-500 dark:text-gray-400 hover:underline"
              >
                {openId === t.threadId ? 'Hide conversation' : 'Read conversation'}
              </button>

              {/* Questions they typed themselves. Chip taps aren't counted —
                  those are the tutor offering a door and them walking through
                  it; these are them reaching for something unprompted. */}
              {t.typedCount > 0 && (
                <span
                  title={`${t.typedCount} question${t.typedCount === 1 ? '' : 's'} they typed themselves`}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border border-brand-300 dark:border-brand-500/40 text-brand-600 dark:text-brand-400"
                >
                  ✏️ {t.typedCount} asked
                </span>
              )}
            </div>

            {openId === t.threadId && <Transcript userId={userId} threadId={t.threadId} />}
          </div>
        ))}
      </div>
    </div>
  );
}
