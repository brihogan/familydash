import { useState, useEffect, useRef, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faXmark, faObjectGroup, faArrowsSplitUpAndLeft, faArrowLeft, faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons';
import { formatCents } from '../../utils/formatCents.js';

// ─── Config ───────────────────────────────────────────────────────────────────
// Sorted highest → lowest; includes quarter between $1 and dime.
const DENOMS = [
  // Bills — all emerald-green, compressed to mid-range (em-200 → em-700)
  { key: 'b100',    cents: 10000, label: '$100', type: 'bill', bg: '#047857', border: '#065f46', fg: '#f0fdf4' },
  { key: 'b50',     cents: 5000,  label: '$50',  type: 'bill', bg: '#059669', border: '#047857', fg: '#ecfdf5' },
  { key: 'b20',     cents: 2000,  label: '$20',  type: 'bill', bg: '#10b981', border: '#059669', fg: '#ecfdf5' },
  { key: 'b10',     cents: 1000,  label: '$10',  type: 'bill', bg: '#34d399', border: '#10b981', fg: '#064e3b' },
  { key: 'b5',      cents: 500,   label: '$5',   type: 'bill', bg: '#6ee7b7', border: '#34d399', fg: '#065f46' },
  { key: 'b1',      cents: 100,   label: '$1',   type: 'bill', bg: '#a7f3d0', border: '#6ee7b7', fg: '#065f46' },
  // Coins — d sets diameter; quarter=large, nickel=medium, dime/penny=small
  // Non-penny coins are grey, compressed to mid-range (gray-200 → gray-400); penny keeps copper look
  { key: 'quarter', cents: 25,    label: '25¢',  type: 'coin', d: 68, bg: '#9ca3af', border: '#6b7280', fg: '#f1f5f9' },
  { key: 'dime',    cents: 10,    label: '10¢',  type: 'coin', d: 52, bg: '#d1d5db', border: '#9ca3af', fg: '#1f2937' },
  { key: 'nickel',  cents: 5,     label: '5¢',   type: 'coin', d: 60, bg: '#e5e7eb', border: '#d1d5db', fg: '#374151' },
  { key: 'penny',   cents: 1,     label: '1¢',   type: 'coin', d: 52, bg: '#fff7ed', border: '#fdba74', fg: '#9a3412' },
];

const COIN_D   = 52;
const BILL_W   = 70;
const BILL_H   = 45;
const MAX_VIZ  = 5;
const COIN_OFF = 4;
const BILL_OFF = 3;
const TOP_FRAC = 0.55;
const COLS     = 4;

const MAX_COIN_H = COIN_D + COIN_OFF * (MAX_VIZ - 1); // 60
const MAX_BILL_H = BILL_H + BILL_OFF * (MAX_VIZ - 1); // 50

const FLIP_RISE_PX       =  55; // px each ghost rises before falling
const FLIP_RISE_DUR      = 240; // ms for the upward rise
const FLIP_FALL_DUR      = 380; // ms for fall (+ simultaneous flip animation)
const FLIP_STAGGER_MS    =  90; // ms between consecutive ghost rises
const FLIP_MAX_PER_DENOM =   4; // max individual ghosts shown per denomination

// Action zone (mini panel, right side, vertically centred)
const AZ_H_MIN     = 106;  // height when empty (icons + hint text)
const AZ_PAD_R     = 14;   // right margin from drag area edge
const AZ_PAD_B     = 14;   // bottom margin from drag area edge
const AZ_W_BASE    = 210;  // panel width for 0–2 active items
const AZ_W_WIDE    = 260;  // panel width when 3 items fill all columns
const AZ_COLS      = 3;    // item columns
const AZ_ROW_H     = 90;   // height per row of items (generous for spacing)
const AZ_INNER_PAD = 8;    // inner padding (base, used when empty)
const AZ_HORIZ_PAD = 12;   // horizontal padding inside the panel on each side
const AZ_BTN_H     = 56;   // button section height when zone has items
const AZ_SEP       = 8;    // gap between last item row and button section
const AZ_H_BACK    = 340;  // height of split back-face (3 vertical option rows)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeBreakdown(cents) {
  let rem = Math.max(0, Math.round(cents || 0));
  const counts = {};
  for (const d of DENOMS) {
    counts[d.key] = Math.floor(rem / d.cents);
    rem %= d.cents;
  }
  return counts;
}

// 4-column grid, denomination order (highest first).
// Last row is centred when not full.
// rowH is computed dynamically to fill the zone height.
function computeZonePositions(zoneCounts, W, startY, zoneH) {
  const items  = DENOMS.filter((d) => (zoneCounts[d.key] ?? 0) > 0);
  const PAD    = 12;
  const LABEL  = 22;
  const PAD_T  = 8;
  const availW = W - PAD * 2;
  const numRows = Math.ceil(items.length / COLS);
  const availH  = zoneH - LABEL - PAD_T;
  const rowH    = numRows > 0 ? Math.max(48, Math.min(82, availH / numRows)) : 82;
  const pos     = {};

  items.forEach((d, i) => {
    const row      = Math.floor(i / COLS);
    const col      = i % COLS;
    // Last (partial) row: distribute evenly across full width so they centre
    const rowCount = Math.min(COLS, items.length - row * COLS);
    const slotW    = availW / rowCount;
    pos[d.key] = {
      x: PAD + slotW * col + slotW / 2,
      y: startY + LABEL + PAD_T + rowH * row + rowH / 2,
    };
  });

  return pos;
}

// Items inside the action zone: 2-column grid starting at the top of the zone.
// innerPad is increased when zone is active so items have more breathing room.
function computeActionPositions(actionCounts, azX, azTopY, azW, innerPad = AZ_INNER_PAD, horizPad = AZ_HORIZ_PAD) {
  const items  = DENOMS.filter((d) => (actionCounts[d.key] ?? 0) > 0);
  if (!items.length) return {};
  const availW = azW - horizPad * 2;
  const pos    = {};
  items.forEach((d, i) => {
    const row      = Math.floor(i / AZ_COLS);
    const col      = i % AZ_COLS;
    const rowCount = Math.min(AZ_COLS, items.length - row * AZ_COLS);
    const slotW    = availW / rowCount;
    pos[d.key] = {
      x: azX + horizPad + slotW * col + slotW / 2,
      y: azTopY + innerPad + AZ_ROW_H * row + AZ_ROW_H / 2,
    };
  });
  return pos;
}

// Returns the action-zone panel width for a given active item count.
function azWFor(itemCount) {
  return itemCount >= AZ_COLS ? AZ_W_WIDE : AZ_W_BASE;
}

// Greedy fill: distribute `remCents` across `denoms` (highest first).
// Returns a counts object, or null if exact change can't be made.
function greedyFill(remCents, denoms) {
  const counts = {};
  let rem = remCents;
  for (const d of denoms) {
    const n = Math.floor(rem / d.cents);
    if (n > 0) { counts[d.key] = n; rem -= n * d.cents; }
  }
  return rem === 0 ? counts : null;
}

// Produce up to 3 distinct split options for the action zone.
// Only the LARGEST denomination is broken down; everything smaller passes through unchanged.
// Heuristic: skip denoms you'd need > 20 of to avoid absurd options.
function computeSplitOptions(action) {
  const maxDenomEntry = DENOMS.find(d => (action[d.key] ?? 0) > 0);
  if (!maxDenomEntry) return [];

  const splitTotal = action[maxDenomEntry.key] * maxDenomEntry.cents;

  // Smaller denoms pass through unchanged in every option
  const leftover = {};
  for (const d of DENOMS) {
    if (d.cents < maxDenomEntry.cents && (action[d.key] ?? 0) > 0) {
      leftover[d.key] = action[d.key];
    }
  }

  const eligible = DENOMS.filter(
    d => d.cents < maxDenomEntry.cents && d.cents <= splitTotal && Math.floor(splitTotal / d.cents) <= 20
  );
  if (!eligible.length) return [];

  const seen    = new Set();
  const variants = [];
  const tryAdd  = (counts) => {
    if (!counts) return;
    const key = JSON.stringify(counts);
    if (!seen.has(key)) { seen.add(key); variants.push(counts); }
  };

  // Strategy A: greedy fill (max highest eligible)
  tryAdd(greedyFill(splitTotal, eligible));

  // Strategy B: use exactly 1 of the highest eligible, fill rest
  if (eligible.length >= 2 && variants.length < 3) {
    const [top, ...rest] = eligible;
    if (top.cents < splitTotal) {
      const restCounts = greedyFill(splitTotal - top.cents, rest);
      if (restCounts) {
        const maxCount = Math.max(...Object.values(restCounts), 0);
        if (maxCount <= 12) tryAdd({ [top.key]: 1, ...restCounts });
      }
    }
  }

  // Strategy C: skip highest eligible
  if (eligible.length >= 2 && variants.length < 3) {
    tryAdd(greedyFill(splitTotal, eligible.slice(1)));
  }

  // Strategy D: skip top 2
  if (eligible.length >= 3 && variants.length < 3) {
    tryAdd(greedyFill(splitTotal, eligible.slice(2)));
  }

  // Merge leftover into each variant
  return variants.slice(0, 3).map(variant => {
    const merged = { ...variant };
    for (const [k, n] of Object.entries(leftover)) {
      merged[k] = (merged[k] ?? 0) + n;
    }
    return merged;
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ItemFace({ denom }) {
  const isCoin = denom.type === 'coin';
  const cd     = isCoin ? (denom.d ?? COIN_D) : 0;
  return (
    <div
      style={{
        width:          isCoin ? cd : BILL_W,
        height:         isCoin ? cd : BILL_H,
        borderRadius:   isCoin ? '50%' : 7,
        background:     denom.bg,
        border:         `2px solid ${denom.border}`,
        boxShadow:      '0 2px 6px rgba(0,0,0,0.13), inset 0 1px 2px rgba(255,255,255,0.55)',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       isCoin ? Math.round(cd * 0.24) : 16,
        fontWeight:     800,
        color:          denom.fg,
        letterSpacing:  '-0.3px',
        flexShrink:     0,
      }}
    >
      {denom.label}
    </div>
  );
}

// Stack at a snapped, auto-computed position.
// Positions transition smoothly on layout changes.
function MoneyStack({ denom, count, x, y, onPointerDown, zIndex = 10 }) {
  const isCoin = denom.type === 'coin';
  const cd     = isCoin ? (denom.d ?? COIN_D) : 0;
  const itemW  = isCoin ? cd : BILL_W;
  const itemH  = isCoin ? cd : BILL_H;
  const off    = isCoin ? COIN_OFF : BILL_OFF;
  const viz    = Math.min(count, MAX_VIZ);
  const stackH = itemH + off * (viz - 1);

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position:    'absolute',
        left:        x,
        top:         y,
        transform:   'translate(-50%, -50%)',
        zIndex,
        cursor:      'grab',
        userSelect:  'none',
        touchAction: 'none',
        transition:  'left 0.28s ease, top 0.28s ease',
        filter:      'drop-shadow(0 2px 4px rgba(0,0,0,0.08))',
      }}
    >
      <div style={{ position: 'relative', width: itemW, height: stackH }}>
        {Array.from({ length: viz }).map((_, i) => {
          const isTop = i === viz - 1;
          return (
            <div
              key={i}
              style={{
                position:       'absolute',
                width:          itemW,
                height:         itemH,
                bottom:         i * off,
                left:           0,
                borderRadius:   isCoin ? '50%' : 7,
                background:     denom.bg,
                border:         `2px solid ${denom.border}`,
                boxShadow:      isTop
                  ? '0 2px 6px rgba(0,0,0,0.12), inset 0 1px 2px rgba(255,255,255,0.55)'
                  : '0 1px 2px rgba(0,0,0,0.07)',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       isCoin ? Math.round(cd * 0.24) : 16,
                fontWeight:     800,
                color:          denom.fg,
                letterSpacing:  '-0.3px',
                zIndex:         i,
              }}
            >
              {isTop ? denom.label : null}
            </div>
          );
        })}
      </div>

      {count > 1 && (
        <div
          style={{
            position:       'absolute',
            top:            isCoin ? -8 : -11,
            right:          isCoin ? -8 : -13,
            background:     '#1f2937',
            color:          '#f9fafb',
            fontSize:       11,
            fontWeight:     700,
            borderRadius:   9999,
            minWidth:       20,
            height:         20,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            padding:        '0 4px',
            border:         '1.5px solid #fff',
            lineHeight:     1,
          }}
        >
          {count}
        </div>
      )}
    </div>
  );
}

// Ghost that follows the pointer while dragging.
// When count > 1 (long-press full-stack grab), renders followers that orbit around the
// live pointer position. Each follower has a progressively longer CSS transition so they
// trail by just a few frames on fast drags but quickly converge when movement slows/stops.
const ORBIT_DUR_MS = 2200;
// Per-follower breathe configs: different durations+delays drift them pleasantly out of phase
const PULSE_CONFIGS = [
  { dur: '0.82s', delay: '0s'    },
  { dur: '1.04s', delay: '0.27s' },
  { dur: '0.71s', delay: '0.51s' },
  { dur: '1.17s', delay: '0.14s' },
];
function DragGhost({ denom, x, y, count = 1 }) {
  const isCoin        = denom.type === 'coin';
  const hw            = (isCoin ? (denom.d ?? COIN_D) : BILL_W) / 2;
  const hh            = (isCoin ? (denom.d ?? COIN_D) : BILL_H) / 2;
  const viz           = Math.min(count, MAX_VIZ);
  const followerCount = viz - 1;

  return (
    <>
      {followerCount > 0 && Array.from({ length: followerCount }).map((_, i) => {
        const { dur, delay } = PULSE_CONFIGS[i] ?? PULSE_CONFIGS[0];
        const opacity    = 0.55 + 0.10 * (i / Math.max(followerCount - 1, 1));
        const orbitDelay = -(i * ORBIT_DUR_MS / followerCount);
        return (
          <div
            key={i}
            style={{
              // Outer layer: moves the orbit-center to the pointer via GPU-composited
              // transform so it never triggers layout — no transition, tracks immediately.
              position:   'absolute',
              left:       0,
              top:        0,
              transform:  `translate(${x - hw}px, ${y - hh}px)`,
              zIndex:     148 + (followerCount - i),
              pointerEvents: 'none',
              opacity,
            }}
          >
            {/* Orbit layer — rotates around the element center (= pointer center) */}
            <div style={{
              transformOrigin: `${hw}px ${hh}px`,
              animation:       `stack-orbit ${ORBIT_DUR_MS}ms linear infinite`,
              animationDelay:  `${orbitDelay}ms`,
            }}>
              {/* Breathing layer — scale pulses independently of orbit rotation */}
              <div style={{
                animation:       `follower-pulse ${dur} ease-in-out ${delay} infinite alternate`,
                transformOrigin: 'center',
              }}>
                <ItemFace denom={denom} />
              </div>
            </div>
          </div>
        );
      })}
      {/* Main item centred on the pointer */}
      <div
        style={{
          position:      'absolute',
          left:          x,
          top:           y,
          transform:     'translate(-50%, -50%) scale(1.08)',
          zIndex:        152,
          pointerEvents: 'none',
          filter:        'drop-shadow(0 12px 24px rgba(0,0,0,0.28))',
          opacity:       0.92,
        }}
      >
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <ItemFace denom={denom} />
          {count > 1 && (
            <div style={{
              position:       'absolute',
              top:            isCoin ? -8 : -11,
              right:          isCoin ? -8 : -13,
              background:     '#1f2937',
              color:          '#f9fafb',
              fontSize:       11,
              fontWeight:     700,
              borderRadius:   9999,
              minWidth:       20,
              height:         20,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              padding:        '0 4px',
              border:         '1.5px solid #fff',
              lineHeight:     1,
              pointerEvents:  'none',
            }}>
              {count}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// Ghost that animates from drop point to snap position, then disappears.
// The target MoneyStack hides its "arriving" item during this animation
// so only this ghost is visible as the in-flight piece.
// delay (ms) staggers the start so multiple ghosts cascade like a deck of cards.
function LandingGhost({ denom, startX, startY, endX, endY, onDone, delay = 0 }) {
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setArrived(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div
      onTransitionEnd={arrived ? onDone : undefined}
      style={{
        position:      'absolute',
        left:          arrived ? endX : startX,
        top:           arrived ? endY : startY,
        transform:     'translate(-50%, -50%)',
        zIndex:        120,
        pointerEvents: 'none',
        transition:    arrived
          ? `left 0.34s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms, top 0.34s cubic-bezier(0.34,1.56,0.64,1) ${delay}ms`
          : 'none',
        filter:        'drop-shadow(0 6px 14px rgba(0,0,0,0.18))',
      }}
    >
      <ItemFace denom={denom} />
    </div>
  );
}

// Compact non-draggable denomination display used on the split back-face.
function MiniMoneyStack({ denom, count }) {
  const isCoin = denom.type === 'coin';
  const mcd    = isCoin ? Math.round((denom.d ?? COIN_D) * 0.70) : 0; // scaled coin diameter
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, pointerEvents: 'none' }}>
      <div style={{
        width: isCoin ? mcd : 58, height: isCoin ? mcd : 36,
        borderRadius: isCoin ? '50%' : 5,
        background: denom.bg, border: `2px solid ${denom.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isCoin ? Math.round(mcd * 0.3) : 14, fontWeight: 800, color: denom.fg, flexShrink: 0,
      }}>
        {denom.label}
      </div>
      <span style={{ fontSize: 10, color: '#6b7280', fontWeight: 700, lineHeight: 1 }}>×{count}</span>
    </div>
  );
}

// Multi-phase merge ghost.
// Phase 1 (staggered): rises FLIP_RISE_PX upward.
// Phase 2 (at peak):   simultaneously falls to targetX/Y and flips rotateX 0→180°,
//                      so the new denomination is revealed during the descent.
// All ghosts land at the same target position → stacked as one visible bill.
function FlipGhost({ oldDenom, newDenom, startX, startY, targetX, targetY,
                     riseDelay, zIndex = 130 }) {
  const [posX,       setPosX]       = useState(startX);
  const [posY,       setPosY]       = useState(startY);
  const [transition, setTransition] = useState('none');
  const [flipping,   setFlipping]   = useState(false);

  useEffect(() => {
    // Phase 1 — rise (staggered per ghost)
    const t1 = setTimeout(() => {
      setTransition(`left ${FLIP_RISE_DUR}ms ease-out, top ${FLIP_RISE_DUR}ms ease-out`);
      setPosY(startY - FLIP_RISE_PX);
    }, riseDelay);

    // Phase 2 — at the peak: fall to target + flip simultaneously
    const t2 = setTimeout(() => {
      setTransition(
        `left ${FLIP_FALL_DUR}ms cubic-bezier(0.34,1.56,0.64,1), ` +
        `top ${FLIP_FALL_DUR}ms cubic-bezier(0.34,1.56,0.64,1)`
      );
      setPosX(targetX);
      setPosY(targetY);
      setFlipping(true); // CSS animation starts same render tick
    }, riseDelay + FLIP_RISE_DUR);

    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const isCoin = oldDenom.type === 'coin';
  const w = isCoin ? (oldDenom.d ?? COIN_D) : BILL_W;
  const h = isCoin ? (oldDenom.d ?? COIN_D) : BILL_H;

  return (
    <div style={{
      position:      'absolute',
      left:          posX,
      top:           posY,
      transform:     'translate(-50%, -50%)',
      zIndex,
      pointerEvents: 'none',
      transition,
      filter:        'drop-shadow(0 6px 14px rgba(0,0,0,0.25))',
    }}>
      {flipping ? (
        <div style={{ perspective: '600px' }}>
          <div style={{
            width:               w,
            height:              h,
            position:            'relative',
            transformStyle:      'preserve-3d',
            WebkitTransformStyle:'preserve-3d',
            // flip duration matches fall duration so the reveal completes on landing
            animation:           `merge-flip ${FLIP_FALL_DUR}ms cubic-bezier(0.45,0.05,0.55,0.95) both`,
          }}>
            {/* Front: old denomination */}
            <div style={{
              position: 'absolute', inset: 0,
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ItemFace denom={oldDenom} />
            </div>
            {/* Back: new denomination — pre-rotated so text appears correct */}
            <div style={{
              position: 'absolute', inset: 0,
              backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateX(180deg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <ItemFace denom={newDenom} />
            </div>
          </div>
        </div>
      ) : (
        <ItemFace denom={oldDenom} />
      )}
    </div>
  );
}

// ─── MoneyPopover ─────────────────────────────────────────────────────────────

export default function MoneyPopover({ open, onClose, account }) {
  const dragAreaRef       = useRef(null);
  const longPressTimerRef = useRef(null);
  const [size,      setSize]    = useState({ w: 0, h: 0 });
  const [yourMoney, setYM]      = useState({}); // { [denomKey]: count }
  const [exchange,  setEx]      = useState({}); // { [denomKey]: count }
  const [action,    setAction]  = useState({}); // { [denomKey]: count } — action zone
  const [drag,          setDrag]          = useState(null);
  // landing: array of { key, zone, startX, startY, endX, endY, id }
  const [landing,       setLanding]       = useState([]);
  const [showSplitBack, setShowSplitBack] = useState(false);
  const [splitOptions,  setSplitOptions]  = useState([]);
  // flipGhosts: array of { id, oldDenom, newDenom, startX/Y, targetX/Y, riseDelay, zIdx }
  const [flipGhosts,    setFlipGhosts]    = useState([]);

  // Detect Tailwind class-based dark mode reactively
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setIsDark(document.documentElement.classList.contains('dark'))
    );
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  // Build initial stacks from account balance
  useEffect(() => {
    if (!open) return;
    const counts = computeBreakdown(account?.balance_cents ?? 0);
    const ym = {};
    for (const d of DENOMS) {
      if (counts[d.key] > 0) ym[d.key] = counts[d.key];
    }
    clearTimeout(longPressTimerRef.current);
    setYM(ym);
    setEx({});
    setAction({});
    setDrag(null);
    setLanding([]);
    setShowSplitBack(false);
    setSplitOptions([]);
    setFlipGhosts([]);
  }, [open, account?.balance_cents]);

  // Prevent pull-to-refresh / page scroll on iOS while the popover is open
  useEffect(() => {
    if (!open) return;
    const el = dragAreaRef.current;
    if (!el) return;
    const prevent = (e) => e.preventDefault();
    el.addEventListener('touchmove', prevent, { passive: false });
    return () => el.removeEventListener('touchmove', prevent);
  }, [open]);

  // Track drag-area size with ResizeObserver so grid reflows on resize
  useEffect(() => {
    if (!open) return;
    const el = dragAreaRef.current;
    if (!el) return;
    // Set initial size (may be 0 on first paint, observer will correct it)
    const { width, height } = el.getBoundingClientRect();
    if (width > 0) setSize({ w: width, h: height });
    const ro = new ResizeObserver((entries) => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0) setSize({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const topH = size.h * TOP_FRAC;
  const ymPos = size.w > 0 ? computeZonePositions(yourMoney, size.w, 0,    topH)          : {};
  const exPos = size.w > 0 ? computeZonePositions(exchange,  size.w, topH, size.h - topH) : {};

  // Action zone geometry (top is fixed; zone grows downward as items are added)
  const azItemCount  = DENOMS.filter((d) => (action[d.key] ?? 0) > 0).length;
  const hasAction    = azItemCount > 0;
  const azTotalCents    = DENOMS.reduce((s, d) => s + (action[d.key] ?? 0) * d.cents, 0);
  const azMaxDenomCents = hasAction
    ? Math.max(...DENOMS.filter(d => (action[d.key] ?? 0) > 0).map(d => d.cents))
    : 0;
  // Merge: total value can form a denomination strictly higher than the largest piece already present
  const mergeEnabled = hasAction && DENOMS.some(d => d.cents > azMaxDenomCents && azTotalCents >= d.cents);
  // Split: at least one piece in the zone is larger than a penny (has smaller denominations to break into)
  const splitEnabled = hasAction && DENOMS.some(d => d.cents > 1 && (action[d.key] ?? 0) > 0);
  const azRows      = Math.ceil(azItemCount / AZ_COLS);
  const azInnerPad  = hasAction ? 51 : AZ_INNER_PAD;
  const azH         = showSplitBack
    ? AZ_H_BACK
    : hasAction ? azInnerPad + azRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H : AZ_H_MIN;
  // Panel grows wider when 3 items fill all columns; narrows visually when empty.
  const azW          = azWFor(azItemCount);
  const azEffectiveW = hasAction || showSplitBack ? azW : Math.round(AZ_W_BASE * 0.6);
  const azX          = size.w > 0 ? size.w - azW          - AZ_PAD_R : 9999; // hit-detection
  const azPanelX     = size.w > 0 ? size.w - azEffectiveW - AZ_PAD_R : 9999; // visual panel left edge
  const azTopY      = size.h > 0 ? size.h - azH - AZ_PAD_B : 9999;
  const azPos       = size.w > 0 ? computeActionPositions(action, azX, azTopY, azW, azInnerPad) : {};

  const isOverAZ   = drag
    ? drag.curX >= azX && drag.curX <= azX + azW
      && drag.curY >= azTopY && drag.curY <= azTopY + azH
    : false;
  const activeZone = drag
    ? isOverAZ ? 'action' : drag.curY >= topH ? 'exchange' : 'your'
    : null;

  // ─── Pointer handlers ─────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e, key, zone) => {
    if (landing.length > 0) return;
    e.preventDefault();
    // Capture to the drag area (never unmounts) so pointerup always fires even if
    // the source MoneyStack disappears from the DOM mid-drag
    dragAreaRef.current?.setPointerCapture(e.pointerId);
    clearTimeout(longPressTimerRef.current);

    // Capture full count BEFORE modifying state (for long-press upgrade)
    const srcState   = zone === 'your' ? yourMoney : zone === 'action' ? action : exchange;
    const fullCount  = srcState[key] ?? 0;

    // Remove 1 from source stack immediately (normal single-drag)
    const set = zone === 'your' ? setYM : zone === 'action' ? setAction : setEx;
    set((prev) => {
      const n = prev[key] ?? 0;
      if (n <= 0) return prev;
      const next = { ...prev };
      if (n === 1) delete next[key]; else next[key] = n - 1;
      return next;
    });

    const rect  = dragAreaRef.current.getBoundingClientRect();
    const pressX = e.clientX - rect.left;
    const pressY = e.clientY - rect.top;
    setDrag({ key, zone, curX: pressX, curY: pressY, pressX, pressY, count: 1 });

    // Long-press (500 ms): upgrade drag to grab the whole stack
    if (fullCount > 1) {
      longPressTimerRef.current = setTimeout(() => {
        // Remove all remaining items of this denomination from the source zone
        set((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        // Upgrade drag count so the orbit visual activates
        setDrag((prev) => (prev && prev.key === key ? { ...prev, count: fullCount } : prev));
      }, 500);
    }
  }, [landing, yourMoney, action, exchange]);

  // Fires via event bubbling from the pointer-captured MoneyStack element
  const LONG_PRESS_MOVE_THRESHOLD = 8; // px — cancel long-press if pointer drifts this far

  const handlePointerMove = useCallback((e) => {
    if (!drag) return;
    e.preventDefault();
    const rect = dragAreaRef.current.getBoundingClientRect();
    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;

    // If the pointer has moved beyond the threshold, cancel the long-press upgrade
    const dx = newX - drag.pressX;
    const dy = newY - drag.pressY;
    if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_THRESHOLD) {
      clearTimeout(longPressTimerRef.current);
    }

    setDrag((prev) => ({ ...prev, curX: newX, curY: newY }));
  }, [drag]);

  const handlePointerUp = useCallback(() => {
    if (!drag) return;
    clearTimeout(longPressTimerRef.current);
    const { key, curX, curY, count = 1 } = drag;
    setDrag(null);

    // Helper: create vertical-stack landing ghosts for `n` items landing at `snapPos`
    const makeGhosts = (n, snapPos, targetZone) => {
      if (!snapPos) return [];
      const denom = DENOMS.find((d) => d.key === key);
      const off   = denom.type === 'coin' ? COIN_OFF : BILL_OFF;
      const viz   = Math.min(n, MAX_VIZ);
      const base  = Date.now();
      return Array.from({ length: viz }).map((_, i) => ({
        key,
        zone:   targetZone,
        startX: curX + (Math.random() * 8 - 4),
        startY: curY + (Math.random() * 8 - 4),
        endX:   snapPos.x,
        endY:   snapPos.y + off * ((viz - 1) / 2 - i),
        delay:  i * 40,
        id:     base + i,
      }));
    };

    // Recompute action zone bounds (size/action are closure-captured)
    const curAzItemCount = DENOMS.filter((d) => (action[d.key] ?? 0) > 0).length;
    const curAzHasAction = curAzItemCount > 0;
    const curAzW = azWFor(curAzItemCount);
    const curAzH = curAzHasAction
      ? 51 + Math.ceil(curAzItemCount / AZ_COLS) * AZ_ROW_H + AZ_SEP + AZ_BTN_H
      : AZ_H_MIN;
    const curAzX    = size.w - curAzW - AZ_PAD_R;
    const curAzTopY = size.h - curAzH - AZ_PAD_B;
    const inAZ = curX >= curAzX && curX <= curAzX + curAzW
              && curY >= curAzTopY && curY <= curAzTopY + curAzH;

    if (inAZ) {
      const next           = { ...action, [key]: (action[key] ?? 0) + count };
      const newAzItemCount = DENOMS.filter((d) => (next[d.key] ?? 0) > 0).length;
      const newInnerPad    = newAzItemCount > 0 ? 51 : AZ_INNER_PAD;
      const newAzRows      = Math.ceil(newAzItemCount / AZ_COLS);
      const newAzH         = newAzItemCount > 0 ? 51 + newAzRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H : AZ_H_MIN;
      const newAzW         = azWFor(newAzItemCount);
      const newAzX         = size.w - newAzW - AZ_PAD_R;
      const newAzTopY      = size.h - newAzH - AZ_PAD_B;
      const snapPos        = computeActionPositions(next, newAzX, newAzTopY, newAzW, newInnerPad)[key];
      setAction(next);
      setLanding((prev) => [...prev, ...makeGhosts(count, snapPos, 'action')]);
      return;
    }

    const inExchange = curY >= topH;
    const destZone   = inExchange ? 'exchange' : 'your';

    if (inExchange) {
      const next    = { ...exchange, [key]: (exchange[key] ?? 0) + count };
      const snapPos = computeZonePositions(next, size.w, topH, size.h - topH)[key];
      setEx(next);
      setLanding((prev) => [...prev, ...makeGhosts(count, snapPos, 'exchange')]);
    } else {
      const next    = { ...yourMoney, [key]: (yourMoney[key] ?? 0) + count };
      const snapPos = computeZonePositions(next, size.w, 0, topH)[key];
      setYM(next);
      setLanding((prev) => [...prev, ...makeGhosts(count, snapPos, 'your')]);
    }
  }, [drag, topH, yourMoney, exchange, action, size]);

  // Merge animation:
  //   • action is NOT cleared — panel height stays stable during the animation
  //   • Per-item ghosts rise one-by-one (staggered), then each simultaneously
  //     falls to the merged denomination's final position and flips rotateX to
  //     reveal the new denomination during the descent
  //   • All ghosts land at the same spot → visually one stacked bill
  //   • After the sequence completes, action is replaced with the merged result
  const handleMerge = useCallback(() => {
    if (!mergeEnabled) return;
    const targetDenom = DENOMS.find(d => d.cents > azMaxDenomCents && azTotalCents >= d.cents);
    if (!targetDenom) return;
    const merged = Math.floor(azTotalCents / targetDenom.cents);
    const rem    = azTotalCents - merged * targetDenom.cents;
    const newAction = { [targetDenom.key]: merged };
    if (rem > 0) {
      const remBreakdown = computeBreakdown(rem);
      for (const [k, n] of Object.entries(remBreakdown)) {
        if (n > 0) newAction[k] = n;
      }
    }

    // Current action zone geometry (same logic as render body)
    const curItemCount = DENOMS.filter(d => (action[d.key] ?? 0) > 0).length;
    const curRows      = Math.ceil(curItemCount / AZ_COLS);
    const curInnerPad  = curItemCount > 0 ? 51 : AZ_INNER_PAD;
    const curAzH       = curInnerPad + curRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H;
    const curAzW       = azWFor(curItemCount);
    const curAzX       = size.w - curAzW - AZ_PAD_R;
    const curAzTopY    = size.h - curAzH - AZ_PAD_B;
    const curPos       = computeActionPositions(action, curAzX, curAzTopY, curAzW, curInnerPad);

    // Target: where the merged denomination will sit in the new action zone layout
    const newItemCount  = DENOMS.filter(d => (newAction[d.key] ?? 0) > 0).length;
    const newRows       = Math.ceil(newItemCount / AZ_COLS);
    const newInnerPad   = newItemCount > 0 ? 51 : AZ_INNER_PAD;
    const newAzH        = newInnerPad + newRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H;
    const newAzW        = azWFor(newItemCount);
    const newAzX        = size.w - newAzW - AZ_PAD_R;
    const newAzTopY     = size.h - newAzH - AZ_PAD_B;
    const newPos        = computeActionPositions(newAction, newAzX, newAzTopY, newAzW, newInnerPad);
    const tgt           = newPos[targetDenom.key];
    const targetX       = tgt?.x ?? (newAzX + newAzW / 2);
    const targetY       = tgt?.y ?? (newAzTopY + newAzH / 2);

    // Per-item ghosts (up to FLIP_MAX_PER_DENOM per denom), staggered rise
    const ghosts = [];
    let gid = Date.now();
    let staggerIdx = 0;
    for (const d of DENOMS) {
      const count = action[d.key] ?? 0;
      if (count === 0 || !curPos[d.key]) continue;
      const n = Math.min(count, FLIP_MAX_PER_DENOM);
      for (let i = 0; i < n; i++) {
        ghosts.push({
          id:        gid++,
          oldDenom:  d,
          newDenom:  targetDenom,
          startX:    curPos[d.key].x,
          startY:    curPos[d.key].y,
          targetX,
          targetY,
          riseDelay: staggerIdx * FLIP_STAGGER_MS,
          zIdx:      130 + staggerIdx,
        });
        staggerIdx++;
      }
    }

    // Keep action alive during animation; show ghosts on top of the hidden stacks
    setFlipGhosts(ghosts);

    // Last ghost finishes at: (N-1)*STAGGER + RISE_DUR + FALL_DUR
    const totalMs = (ghosts.length - 1) * FLIP_STAGGER_MS + FLIP_RISE_DUR + FLIP_FALL_DUR + 100;
    setTimeout(() => {
      setFlipGhosts([]);
      setAction(newAction);
    }, totalMs);
  }, [mergeEnabled, azMaxDenomCents, azTotalCents, action, size]);

  // Flip to split back-face
  const handleSplit = useCallback(() => {
    if (!splitEnabled) return;
    setSplitOptions(computeSplitOptions(action));
    setShowSplitBack(true);
  }, [splitEnabled, action]);

  // Flip back without applying a split
  const handleSplitBack = useCallback(() => {
    setShowSplitBack(false);
    setSplitOptions([]);
  }, []);

  // Apply a chosen split: fly every individual item from the swap center into
  // Your Money with a fan spread + cascade stagger (same-denom cards fan out).
  const handleApplySplit = useCallback((optionCounts, buttonEl) => {
    // Compute where items will land in the (new) action zone front face
    const newItemCount = DENOMS.filter(d => (optionCounts[d.key] ?? 0) > 0).length;
    const newInnerPad  = newItemCount > 0 ? 51 : AZ_INNER_PAD;
    const newAzRows    = Math.ceil(newItemCount / AZ_COLS);
    const newAzH       = newItemCount > 0 ? newInnerPad + newAzRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H : AZ_H_MIN;
    const newAzW       = azWFor(newItemCount);
    const newAzX       = size.w - newAzW - AZ_PAD_R;
    const newAzTopY    = size.h - newAzH - AZ_PAD_B;
    const newAzPos     = computeActionPositions(optionCounts, newAzX, newAzTopY, newAzW, newInnerPad);

    // Compute per-denomination ghost start positions from within the tapped button.
    // The button lays out MiniMoneyStack items with flexbox (justify-content: center, gap: 10).
    const denomsInOpt = DENOMS.filter(d => (optionCounts[d.key] ?? 0) > 0);
    const miniWidths  = denomsInOpt.map(d =>
      d.type === 'coin' ? Math.round((d.d ?? COIN_D) * 0.70) : 58
    );
    const totalRowW   = miniWidths.reduce((s, w) => s + w, 0) + (denomsInOpt.length - 1) * 10;

    const itemOrigins = {}; // denom key → {x, y} in drag-area local coords
    const dragRect    = dragAreaRef.current?.getBoundingClientRect();
    const btnRect     = buttonEl?.getBoundingClientRect();
    if (dragRect && btnRect) {
      const btnCx = btnRect.left + btnRect.width  / 2 - dragRect.left;
      const btnCy = btnRect.top  + btnRect.height / 2 - dragRect.top;
      let curX = btnCx - totalRowW / 2;
      denomsInOpt.forEach((d, i) => {
        itemOrigins[d.key] = { x: curX + miniWidths[i] / 2, y: btnCy };
        curX += miniWidths[i] + 10;
      });
    } else {
      // Fallback: back-face center
      const curItemCount = DENOMS.filter(d => (action[d.key] ?? 0) > 0).length;
      const curAzW = azWFor(curItemCount);
      const curAzX = size.w - curAzW - AZ_PAD_R;
      const backTopY = size.h - AZ_H_BACK - AZ_PAD_B;
      denomsInOpt.forEach(d => {
        itemOrigins[d.key] = { x: curAzX + curAzW / 2, y: backTopY + AZ_H_BACK / 2 };
      });
    }

    // Ghosts fly from each denomination's mini-stack position to its action-zone slot.
    // No flip delay — they start immediately as the card rotates back.
    const ghosts = [];
    let gid = Date.now();
    for (const d of DENOMS) {
      const count = optionCounts[d.key] ?? 0;
      if (count === 0 || !newAzPos[d.key]) continue;
      const origin    = itemOrigins[d.key] ?? { x: newAzX + newAzW / 2, y: newAzTopY + newAzH / 2 };
      const { x: endX, y: endY } = newAzPos[d.key];
      const off = d.type === 'coin' ? COIN_OFF : BILL_OFF;
      const viz = Math.min(count, MAX_VIZ);
      for (let i = 0; i < viz; i++) {
        // Each ghost lands at the exact layer position it occupies in MoneyStack
        // (layer 0 = bottom, layer viz-1 = top; center of stack is at endY)
        ghosts.push({
          key:    d.key,
          zone:   'action',
          startX: origin.x + (Math.random() * 6 - 3),
          startY: origin.y + (Math.random() * 6 - 3),
          endX:   endX,
          endY:   endY + off * ((viz - 1) / 2 - i),
          delay:  i * 40,
          id:     gid++,
        });
      }
    }

    setAction(optionCounts);
    setShowSplitBack(false);
    setSplitOptions([]);
    setLanding(prev => [...prev, ...ghosts]);
  }, [action, size, dragAreaRef]);

  // Animate all action-zone items back to Your Money.
  // Every individual item flies from the swap area center; same-denom cards
  // fan out horizontally at their destination and cascade with a stagger delay.
  const handleReset = useCallback(() => {
    if (!Object.keys(action).length) return;

    const newYM = { ...yourMoney };
    for (const [k, count] of Object.entries(action)) {
      newYM[k] = (newYM[k] ?? 0) + count;
    }
    const newTopH      = size.h * TOP_FRAC;
    const newYmPos     = computeZonePositions(newYM, size.w, 0, newTopH);
    const resetCount   = Object.keys(action).length;
    const resetAzW     = azWFor(resetCount);
    const azXLocal     = size.w - resetAzW - AZ_PAD_R;
    const resetRows    = Math.ceil(resetCount / AZ_COLS);
    const resetAzH     = 51 + resetRows * AZ_ROW_H + AZ_SEP + AZ_BTN_H;
    const azTopYLocal  = size.h - resetAzH - AZ_PAD_B;
    const azCenterX    = azXLocal + resetAzW / 2;
    const azCenterY    = azTopYLocal + resetAzH / 2;

    const ghosts = [];
    let gid = Date.now();
    for (const d of DENOMS) {
      const count = action[d.key] ?? 0;
      if (count === 0 || !newYmPos[d.key]) continue;
      const { x: endX, y: endY } = newYmPos[d.key];
      const off = d.type === 'coin' ? COIN_OFF : BILL_OFF;
      const viz = Math.min(count, MAX_VIZ);
      for (let i = 0; i < viz; i++) {
        ghosts.push({
          key:    d.key,
          zone:   'your',
          startX: azCenterX + (Math.random() * 8 - 4),
          startY: azCenterY + (Math.random() * 8 - 4),
          endX:   endX,
          endY:   endY + off * ((viz - 1) / 2 - i),
          delay:  i * 40,
          id:     gid++,
        });
      }
    }

    setYM(newYM);
    setAction({});
    setLanding(prev => [...prev, ...ghosts]);
  }, [action, yourMoney, size]);

  if (!open) return null;

  const activeDenom = drag ? DENOMS.find((d) => d.key === drag.key) : null;

  // Subtract in-flight ghosts so the target stack doesn't show the arriving item.
  const visCount = (zone, key) => {
    const base = zone === 'your'   ? (yourMoney[key] ?? 0)
               : zone === 'action' ? (action[key]    ?? 0)
               :                     (exchange[key]  ?? 0);
    const inFlight = landing.filter(l => l.key === key && l.zone === zone).length;
    return base - inFlight;
  };

  return (
    <>
    <style>{`
      @keyframes merge-flip {
        0%   { transform: rotateX(0deg);   }
        100% { transform: rotateX(180deg); }
      }
      /* Orbit: rotate(A) translateX(r) rotate(-A) keeps the face upright while circling */
      @keyframes stack-orbit {
        from { transform: rotate(0deg)   translateX(22px) rotate(0deg);   }
        to   { transform: rotate(360deg) translateX(22px) rotate(-360deg); }
      }
      /* Breathe: each follower pulses its scale independently (duration/delay set inline) */
      @keyframes follower-pulse {
        from { transform: scale(0.72); }
        to   { transform: scale(0.92); }
      }
    `}</style>
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className="relative z-10 w-full sm:max-w-lg flex flex-col sm:rounded-[38px] sm:shadow-2xl overflow-hidden bg-white dark:bg-gray-900 h-full sm:h-[88vh] sm:max-h-[620px]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{account?.name}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{formatCents(account?.balance_cents ?? 0)}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} />
          </button>
        </div>

        {/* Drag area */}
        <div
          ref={dragAreaRef}
          className="flex-1 relative overflow-hidden select-none"
          style={{ touchAction: 'none', overscrollBehavior: 'none' }}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* ── Your Money zone ────────────────────────────────────── */}
          <div
            className="absolute inset-x-0 top-0 bg-slate-50 dark:bg-gray-800"
            style={{ height: `${TOP_FRAC * 100}%` }}
          >
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-gray-500 uppercase pt-2 text-center pointer-events-none">
              Your Money
            </p>
          </div>


          {/* ── Exchange zone ───────────────────────────────────────── */}
          <div
            className="absolute inset-x-0 bottom-0 bg-slate-100/80 dark:bg-gray-700/50"
            style={{ top: `${TOP_FRAC * 100}%` }}
          >
            <p className="text-[10px] font-semibold tracking-widest text-slate-400 dark:text-gray-500 uppercase pt-3 text-center pointer-events-none">
              Exchange Area
            </p>
          </div>

          {/* ── Zone border overlays ─────────────────────────────────── */}
          <div
            style={{
              position:     'absolute',
              inset:        `4px 4px calc(${(1 - TOP_FRAC) * 100}% + 6px) 4px`,
              borderRadius: 38,
              borderWidth:  25,
              borderStyle:  'solid',
              borderColor:  activeZone === 'your' ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.10)',
              pointerEvents: 'none',
              zIndex:       5,
              transition:   'border-color 150ms ease',
            }}
          />
          <div
            style={{
              position:     'absolute',
              inset:        `calc(${TOP_FRAC * 100}% + 6px) 4px 4px 4px`,
              borderRadius: 38,
              borderWidth:  25,
              borderStyle:  'solid',
              borderColor:  activeZone === 'exchange' ? 'rgba(99,102,241,0.18)' : 'rgba(148,163,184,0.10)',
              pointerEvents: 'none',
              zIndex:       5,
              transition:   'border-color 150ms ease',
            }}
          />

          {/* Empty state */}
          {Object.keys(yourMoney).length === 0 && !drag && (
            <div
              className="absolute inset-x-0 flex items-center justify-center pointer-events-none"
              style={{ top: 0, height: `${TOP_FRAC * 100}%` }}
            >
              <p className="text-sm text-slate-400 dark:text-gray-500">Balance is $0.00</p>
            </div>
          )}

          {/* ── Your Money stacks ──────────────────────────────────── */}
          {DENOMS.map((d) => {
            const count = visCount('your', d.key);
            const pos   = ymPos[d.key];
            if (count <= 0 || !pos) return null;
            return (
              <MoneyStack
                key={`ym-${d.key}`}
                denom={d}
                count={count}
                x={pos.x}
                y={pos.y}
                onPointerDown={(e) => handlePointerDown(e, d.key, 'your')}
              />
            );
          })}

          {/* ── Exchange stacks ─────────────────────────────────────── */}
          {DENOMS.map((d) => {
            const count = visCount('exchange', d.key);
            const pos   = exPos[d.key];
            if (count <= 0 || !pos) return null;
            return (
              <MoneyStack
                key={`ex-${d.key}`}
                denom={d}
                count={count}
                x={pos.x}
                y={pos.y}
                onPointerDown={(e) => handlePointerDown(e, d.key, 'exchange')}
              />
            );
          })}

          {/* ── Action zone stacks (hidden while split back-face or flip is active) ── */}
          {!showSplitBack && flipGhosts.length === 0 && DENOMS.map((d) => {
            const count = visCount('action', d.key);
            const pos   = azPos[d.key];
            if (count <= 0 || !pos) return null;
            return (
              <MoneyStack
                key={`az-${d.key}`}
                denom={d}
                count={count}
                x={pos.x}
                y={pos.y}
                zIndex={20}
                onPointerDown={(e) => handlePointerDown(e, d.key, 'action')}
              />
            );
          })}

          {/* ── Action zone panel (3D flip card) ────────────────────── */}
          {size.w > 0 && (
            <div
              style={{
                position:      'absolute',
                left:          azPanelX,
                top:           azTopY,
                width:         azEffectiveW,
                height:        azH,
                perspective:   '700px',
                zIndex:        15,
                pointerEvents: flipGhosts.length > 0 ? 'none' : undefined,
                transition:    'height 220ms ease, top 220ms ease, width 220ms ease, left 220ms ease',
              }}
            >
              {/* Flip card inner */}
              <div
                style={{
                  width: '100%', height: '100%',
                  position: 'relative',
                  transformStyle: 'preserve-3d',
                  WebkitTransformStyle: 'preserve-3d',
                  transition: 'transform 380ms ease',
                  transform: showSplitBack ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* ── FRONT FACE ── */}
                <div
                  style={{
                    position: 'absolute', width: '100%', height: '100%',
                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                    borderRadius: 16,
                    borderWidth: hasAction ? 6 : 3, borderStyle: 'solid',
                    borderColor: activeZone === 'action'
                      ? 'rgba(99,102,241,0.55)'
                      : isDark ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.32)',
                    background: isDark ? 'rgba(30,41,59,0.97)' : 'rgba(248,250,252,0.95)',
                    boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.07)',
                    overflow: 'hidden',
                    transition: 'border-width 220ms ease, border-color 150ms ease',
                  }}
                >
                  {/* ── Put Back bar — thick top border that's also a button ── */}
                  {hasAction && (
                    <button
                      onClick={handleReset}
                      style={{
                        position: 'absolute', top: 0, left: 0, right: 0,
                        height: 32,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 5,
                        background: activeZone === 'action'
                          ? 'rgba(99,102,241,0.55)'
                          : isDark ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.32)',
                        border: 'none',
                        borderRadius: '10px 10px 0 0', // inner radius = 16px panel − 6px border
                        cursor: 'pointer',
                        fontSize: 13, fontWeight: 700,
                        color: 'rgba(255,255,255,0.9)',
                        letterSpacing: '0.35px',
                        transition: 'background 120ms',
                      }}
                      onPointerEnter={e => {
                        if (e.pointerType !== 'mouse') return;
                        e.currentTarget.style.background = activeZone === 'action'
                          ? 'rgba(99,102,241,0.7)'
                          : isDark ? 'rgba(100,116,139,0.65)' : 'rgba(148,163,184,0.52)';
                      }}
                      onPointerLeave={e => {
                        if (e.pointerType !== 'mouse') return;
                        e.currentTarget.style.background = activeZone === 'action'
                          ? 'rgba(99,102,241,0.55)'
                          : isDark ? 'rgba(100,116,139,0.45)' : 'rgba(148,163,184,0.32)';
                      }}
                    >
                      <FontAwesomeIcon icon={faArrowUpFromBracket} style={{ fontSize: 12 }} />
                      Put back
                    </button>
                  )}

                  {/* ── Bottom action buttons ── */}
                  <div
                    style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0,
                      height: hasAction ? AZ_BTN_H : azH,
                      display: 'flex',
                      flexDirection: hasAction ? 'row' : 'column',
                      alignItems: 'center',
                      justifyContent: hasAction ? 'space-between' : 'center',
                      gap: hasAction ? 6 : 6,
                      padding: hasAction ? '5px 8px' : '10px 12px 4px',
                      transition: 'height 220ms ease',
                    }}
                  >
                    {hasAction ? (
                      <>
                        <button
                          disabled={!mergeEnabled || flipGhosts.length > 0}
                          onClick={handleMerge}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 5, padding: '9px 6px', borderRadius: 7,
                            cursor: (mergeEnabled && flipGhosts.length === 0) ? 'pointer' : 'not-allowed',
                            border: `1.5px solid ${isDark ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.35)'}`,
                            background: isDark ? 'rgba(99,102,241,0.18)' : 'rgba(99,102,241,0.09)',
                            fontSize: 13, fontWeight: 600,
                            color: isDark ? 'rgba(165,180,252,0.95)' : 'rgba(67,56,202,0.9)',
                            opacity: (mergeEnabled && flipGhosts.length === 0) ? 1 : 0.35,
                            transition: 'opacity 80ms',
                          }}
                        >
                          <FontAwesomeIcon icon={faObjectGroup} style={{ fontSize: 13, flexShrink: 0 }} />
                          Merge
                        </button>
                        <button
                          disabled={!splitEnabled}
                          onClick={handleSplit}
                          style={{
                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            gap: 5, padding: '9px 6px', borderRadius: 7,
                            cursor: splitEnabled ? 'pointer' : 'not-allowed',
                            border: `1.5px solid ${isDark ? 'rgba(52,211,153,0.5)' : 'rgba(16,185,129,0.35)'}`,
                            background: isDark ? 'rgba(16,185,129,0.2)' : 'rgba(16,185,129,0.09)',
                            fontSize: 13, fontWeight: 600,
                            color: isDark ? 'rgba(52,211,153,0.95)' : 'rgba(4,120,87,0.9)',
                            opacity: splitEnabled ? 1 : 0.35,
                          }}
                        >
                          <FontAwesomeIcon icon={faArrowsSplitUpAndLeft} style={{ fontSize: 13, flexShrink: 0 }} />
                          Split
                        </button>
                      </>
                    ) : (
                      <>
                        <div style={{ display: 'flex', flexDirection: 'row', gap: 14 }}>
                          <FontAwesomeIcon icon={faObjectGroup}          style={{ fontSize: 19, color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.45)' }} />
                          <FontAwesomeIcon icon={faArrowsSplitUpAndLeft} style={{ fontSize: 19, color: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.45)' }} />
                        </div>
                        <p style={{ margin: 0, fontSize: 8.5, lineHeight: 1.4, textAlign: 'center', color: isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.5)' }}>
                          Drag money into this area to split or break it into different amounts
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* ── BACK FACE (split options, 3 vertical rows) ── */}
                <div
                  style={{
                    position: 'absolute', width: '100%', height: '100%',
                    backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    borderRadius: 16,
                    border: `3px solid ${isDark ? 'rgba(52,211,153,0.5)' : 'rgba(16,185,129,0.4)'}`,
                    background: isDark ? 'rgba(30,41,59,0.99)' : 'rgba(248,250,252,0.97)',
                    boxShadow: isDark ? '0 2px 12px rgba(0,0,0,0.4)' : '0 2px 12px rgba(0,0,0,0.07)',
                    display: 'flex', flexDirection: 'column',
                    padding: '7px 8px 8px',
                    gap: 5,
                    overflow: 'hidden',
                  }}
                >
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <button
                      onClick={handleSplitBack}
                      style={{
                        fontSize: 10, color: isDark ? '#94a3b8' : '#6b7280',
                        display: 'flex', alignItems: 'center', gap: 3,
                        cursor: 'pointer', background: 'none', border: 'none', padding: '2px 0',
                      }}
                    >
                      <FontAwesomeIcon icon={faArrowLeft} style={{ fontSize: 9 }} />
                      <span>Back</span>
                    </button>
                    <span style={{ fontSize: 10, fontWeight: 600, color: isDark ? '#94a3b8' : '#4b5563' }}>Split into</span>
                  </div>

                  {/* Option rows — one per row, stacked vertically */}
                  {splitOptions.map((opt, i) => (
                    <button
                      key={i}
                      onClick={(e) => handleApplySplit(opt, e.currentTarget)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: 10, padding: '6px 8px', flexWrap: 'wrap',
                        background: isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.06)',
                        border: `1.5px solid ${isDark ? 'rgba(99,102,241,0.4)' : 'rgba(99,102,241,0.22)'}`,
                        borderRadius: 9, cursor: 'pointer',
                        transition: 'background 120ms, border-color 120ms',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background    = isDark ? 'rgba(99,102,241,0.25)' : 'rgba(99,102,241,0.13)';
                        e.currentTarget.style.borderColor   = isDark ? 'rgba(99,102,241,0.6)'  : 'rgba(99,102,241,0.45)';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background    = isDark ? 'rgba(99,102,241,0.15)' : 'rgba(99,102,241,0.06)';
                        e.currentTarget.style.borderColor   = isDark ? 'rgba(99,102,241,0.4)'  : 'rgba(99,102,241,0.22)';
                      }}
                    >
                      {DENOMS.filter(d => (opt[d.key] ?? 0) > 0).map(d => (
                        <MiniMoneyStack key={d.key} denom={d} count={opt[d.key]} />
                      ))}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Merge flip ghosts ──────────────────────────────────── */}
          {flipGhosts.map((g) => (
            <FlipGhost
              key={g.id}
              oldDenom={g.oldDenom}
              newDenom={g.newDenom}
              startX={g.startX}
              startY={g.startY}
              targetX={g.targetX}
              targetY={g.targetY}
              riseDelay={g.riseDelay}
              zIndex={g.zIdx}
            />
          ))}

          {/* ── Drag ghost (follows pointer) ───────────────────────── */}
          {activeDenom && drag && (
            <DragGhost denom={activeDenom} x={drag.curX} y={drag.curY} count={drag.count ?? 1} />
          )}

          {/* ── Landing ghosts (animate to snap position) ──────────── */}
          {landing.map((l) => {
            const d = DENOMS.find(x => x.key === l.key);
            if (!d) return null;
            return (
              <LandingGhost
                key={l.id}
                denom={d}
                startX={l.startX}
                startY={l.startY}
                endX={l.endX}
                endY={l.endY}
                delay={l.delay ?? 0}
                onDone={() => setLanding(prev => prev.filter(x => x.id !== l.id))}
              />
            );
          })}
        </div>
      </div>
    </div>
    </>
  );
}
