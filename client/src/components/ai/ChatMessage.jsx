// One turn in a step conversation. Three shapes:
//
//   chat          — normal back-and-forth (AI left, kid right)
//   answer_review — the kid's own draft, quoted back before the coach responds.
//                   Deliberately styled as a quote, not a chat bubble, so it
//                   reads as "here's what you wrote" rather than a question.
//   handoff       — the band shown at the top of a thread you arrived at from
//                   another badge ("↩ carried over from Alien Life").

import { Fragment } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRotateLeft, faPenToSquare } from '@fortawesome/free-solid-svg-icons';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Minimal inline formatting — *italics* only. The preview build uses italics to
// mark canned copy; the real model is instructed to write plain prose.
function Formatted({ text }) {
  return (
    <>
      {String(text).split(/(\*[^*]+\*)/g).map((chunk, i) => (
        <Fragment key={i}>
          {chunk.startsWith('*') && chunk.endsWith('*') && chunk.length > 2
            ? <em className="opacity-70">{chunk.slice(1, -1)}</em>
            : chunk}
        </Fragment>
      ))}
    </>
  );
}

// Phrases the tutor flagged as probably-unfamiliar become tappable, so a kid on
// an iPad can ask "what's a Kepler Space Telescope?" without selecting text and
// retyping it. Terms it has already explained in this thread stop being marked
// — otherwise the same words stay lit up like unread notifications.
//
// Longest first: "Kepler Space Telescope" must win over "Space" so the shorter
// phrase can't carve up the longer one.
function RichText({ text, terms = [], explained, onAskTerm }) {
  const live = (terms || []).filter((t) => onAskTerm && !explained?.has(t));
  if (!live.length) return <Formatted text={text} />;

  const pattern = [...live].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
  const parts = String(text).split(new RegExp(`(${pattern})`, 'g'));

  return (
    <>
      {parts.map((chunk, i) => (
        live.includes(chunk)
          ? (
            <button
              key={i}
              type="button"
              onClick={() => onAskTerm(chunk)}
              aria-label={`Explain: ${chunk}`}
              className="ai-term"
            >
              {chunk}
            </button>
          )
          : <Formatted key={i} text={chunk} />
      ))}
    </>
  );
}

// `animate` is set only for a turn that arrived while the panel was open — a
// resumed conversation renders its history still, rather than replaying every
// question the kid ever asked.
export default function ChatMessage({ message, children, animate = false, explained, onAskTerm }) {
  const { role, kind, text } = message;
  const enter = animate ? ' ai-question-in' : '';

  if (kind === 'handoff') {
    return (
      <div className="rounded-xl border border-dashed border-brand-300 dark:border-brand-500/40 bg-brand-50/50 dark:bg-brand-500/10 px-3 py-2">
        <p className="text-xs text-brand-700 dark:text-brand-300">
          <FontAwesomeIcon icon={faArrowRotateLeft} className="mr-1.5 text-[10px]" />
          {text}
        </p>
      </div>
    );
  }

  if (kind === 'answer_review') {
    return (
      <div className={`self-end w-full max-w-[92%]${enter}`}>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1 text-right">
          <FontAwesomeIcon icon={faPenToSquare} className="mr-1 text-[10px]" />
          What you wrote
        </p>
        <div className="rounded-xl border-l-4 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/60 px-3 py-2">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line italic">{text}</p>
        </div>
      </div>
    );
  }

  if (role === 'kid') {
    return (
      <div className={`self-end max-w-[85%] rounded-2xl rounded-br-sm bg-brand-500 px-3.5 py-2${enter}`}>
        <p className="text-sm text-white leading-relaxed whitespace-pre-line">{text}</p>
      </div>
    );
  }

  return (
    <div className="self-start max-w-[95%]">
      <div className="rounded-2xl rounded-bl-sm bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5">
        <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-line">
          <RichText text={text} terms={message.terms} explained={explained} onAskTerm={onAskTerm} />
        </p>
      </div>
      {children}
    </div>
  );
}
