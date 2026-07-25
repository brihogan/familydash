// Dev-only harness for the badge-step AI tutor UI.
//
// Mounted at /ai-preview and only registered when import.meta.env.DEV, so it
// never ships. It exists because Phase 1 is a look-at-it-and-adjust phase:
// this gets you to the panel without logging in, picking a kid, or finding a
// badge that happens to be at the level you want to see.
//
// Swap the level to check the voice per age band; swap the step to check the
// mode-specific openers.

import { useState } from 'react';
import StepChatPanel from '../components/ai/StepChatPanel.jsx';
import useStepChat from '../components/ai/useStepChat.js';
import { BADGE_LEVELS, BADGE_LEVEL_ORDER } from '../constants/badgeLevels.js';
import { tierForLevel, ANSWER_REVIEW_MIN_CHARS } from '../constants/aiTiers.js';
import { resetThreads } from '../components/ai/mockThreads.js';

// Real requirement text from the Curiosity Untamed library, one per mode.
const STEPS = [
  { id: 901, badge: 'Alien Life', emoji: '🛸', mode: 'know',
    text: 'Discuss the scale of the universe and the Fermi Paradox.  Do you think there are aliens out there?' },
  { id: 902, badge: 'Aviation', emoji: '✈️', mode: 'make',
    text: 'Make at least two different types of paper airplane.  How do they differ?  Which one flies better?  Why?' },
  { id: 903, badge: 'Bowling', emoji: '🎳', mode: 'go',
    text: 'Visit a bowling alley, take a tour, speak with someone involved with bowling.' },
  { id: 904, badge: 'Mini Golf', emoji: '⛳', mode: 'do',
    text: 'Understand mini golf terminology. Par Eagle Birdie Bogey Hole-In-One The Green Spin Teeing Off' },
  { id: 905, badge: 'Clean Language', emoji: '💬', mode: 'social',
    text: 'Interview an elderly member of the community and discuss how clean language is important. How has it changed since they were younger?' },
];

export default function AiPreviewPage() {
  const [levelKey, setLevelKey] = useState('level2');
  const [stepIdx, setStepIdx] = useState(0);
  const [frame, setFrame] = useState('desktop');
  const [answer, setAnswer] = useState('');

  const step = STEPS[stepIdx];
  const lvl  = BADGE_LEVELS[levelKey];
  const tier = tierForLevel(levelKey, BADGE_LEVELS);

  // Distinct thread per (step, level) so switching either one starts fresh.
  const stepId = step.id * 100 + BADGE_LEVEL_ORDER.indexOf(levelKey);

  const chat = useStepChat({
    enabled: tier.enabled,
    mock: true, // no auth and no real step here — canned replies only
    tier,
    meta: {
      stepId,
      taskSetId: 999,
      userId: 53,
      badgeName: step.badge,
      badgeEmoji: step.emoji,
      levelLabel: lvl.label,
      stepText: step.text,
      kidName: 'Daniel',
    },
  });

  const canReview = tier.enabled && answer.trim().length >= ANSWER_REVIEW_MIN_CHARS;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          AI tutor · Phase 1 preview
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Dev-only harness. Replies are canned; the Alien Life thread has real content, the rest are placeholders.
        </p>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-4 p-3 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700">
          <label className="text-xs">
            <span className="block font-semibold text-gray-500 dark:text-gray-400 mb-1">Badge level → age</span>
            <select
              value={levelKey}
              onChange={(e) => { setLevelKey(e.target.value); }}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 text-sm"
            >
              {BADGE_LEVEL_ORDER.map((k) => (
                <option key={k} value={k}>{BADGE_LEVELS[k].label} · {BADGE_LEVELS[k].ageRange}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block font-semibold text-gray-500 dark:text-gray-400 mb-1">Step (real requirement text)</span>
            <select
              value={stepIdx}
              onChange={(e) => setStepIdx(Number(e.target.value))}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 text-sm"
            >
              {STEPS.map((s, i) => (
                <option key={s.id} value={i}>{s.emoji} {s.badge} — {s.mode}</option>
              ))}
            </select>
          </label>

          <label className="text-xs">
            <span className="block font-semibold text-gray-500 dark:text-gray-400 mb-1">Frame</span>
            <select
              value={frame}
              onChange={(e) => setFrame(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-lg px-2 py-1.5 text-sm"
            >
              <option value="desktop">Side panel (lg+)</option>
              <option value="mobile">Tab (narrow)</option>
            </select>
          </label>

          <button
            onClick={() => { resetThreads(); setAnswer(''); window.location.reload(); }}
            className="self-end text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300"
          >
            Reset threads
          </button>
        </div>

        {/* Step + panel, framed the way the real modal frames them */}
        <div
          className={`rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex ${
            frame === 'mobile' ? 'max-w-sm mx-auto' : ''
          }`}
          style={{ height: '78vh' }}
        >
          {frame === 'desktop' && (
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
              <div className="max-w-lg mx-auto flex flex-col items-center text-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center text-5xl bg-amber-50 dark:bg-gray-800 shadow-md">
                  {step.emoji}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">{step.badge}</p>
                <span
                  className="mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full border"
                  style={{ backgroundColor: lvl.color, color: lvl.textColor, borderColor: lvl.borderColor }}
                >
                  {lvl.label}
                </span>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-5">Required step</h2>
                <div className="mt-4 w-full text-left bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{step.text}</p>
                </div>

                <div className="mt-5 w-full text-left">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
                    Your response
                  </label>
                  <textarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={6}
                    placeholder="Write your answer here…"
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 rounded-xl px-3.5 py-3 text-sm leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                  {canReview && (
                    <button
                      onClick={() => chat.reviewAnswer(answer)}
                      disabled={chat.busy}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-brand-300 dark:border-brand-500/40 text-brand-700 dark:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/15 disabled:opacity-40"
                    >
                      🔎 Read what I wrote
                    </button>
                  )}
                  <p className="mt-2 text-[11px] text-gray-400">
                    Try: “I think there probably ARE aliens because there are so many stars. But maybe they are too far away.”
                  </p>
                </div>
              </div>
            </div>
          )}

          {tier.enabled ? (
            <StepChatPanel
              chat={chat}
              tier={tier}
              mode={chat.mode}
              onCrossBadge={(cb) => window.alert(`Phase 3 navigates to: ${cb.badge} — ${cb.stepLabel}`)}
              className={frame === 'desktop' ? 'w-[26rem] shrink-0 border-l border-gray-200 dark:border-gray-700' : 'flex-1'}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                The tutor is off at {lvl.label} ({lvl.ageRange}).<br />
                A 3-year-old can’t type, and shouldn’t be alone in a chat box.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
