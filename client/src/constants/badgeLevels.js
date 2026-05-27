// Frontier Girls / CuriosityUntamed badge levels with display names and colors.
// Colors should be verified against official Frontier Girls materials.
//   color       — main fill (used on level pills + card tints)
//   borderColor — saturated outline / completed-arc accent
//   trackColor    — softer "incomplete" shade used by the minimal task-set
//                   ring so the partly-filled medallion stays subtle behind
//                   the badge image (light mode).
//   darkTrackColor — a dark hue of the level color for dark mode. Keeps the
//                    "incomplete" portion of the ring tinted with the level
//                    (red-900 for Preschool, blue-900 for Level 2, etc.)
//                    instead of a generic gray.
export const BADGE_LEVELS = {
  preschool: { label: 'Preschool · Penguin',   ageRange: 'Ages 3-5',    color: '#FCA5A5', textColor: '#7F1D1D', borderColor: '#EF4444', trackColor: '#FECACA' /* red-200    */, darkTrackColor: '#7F1D1D' /* red-900    */ },
  level1:    { label: 'Level 1 · Otter',       ageRange: 'Ages 5-8',    color: '#FDE047', textColor: '#713F12', borderColor: '#FBBF24', trackColor: '#FEF08A' /* yellow-200 */, darkTrackColor: '#713F12' /* yellow-900 */ },
  level2:    { label: 'Level 2 · Dolphin',     ageRange: 'Ages 8-11',   color: '#60A5FA', textColor: '#1E40AF', borderColor: '#3B82F6', trackColor: '#BFDBFE' /* blue-200   */, darkTrackColor: '#1E3A8A' /* blue-900   */ },
  level3:    { label: 'Level 3 · Butterfly',   ageRange: 'Ages 11-14',  color: '#86EFAC', textColor: '#14532D', borderColor: '#22C55E', trackColor: '#86EFAC' /* green-300  */, darkTrackColor: '#14532D' /* green-900  */ },
  level4:    { label: 'Level 4 · Eagle',       ageRange: 'Ages 14-18',  color: '#D1D5DB', textColor: '#1F2937', borderColor: '#6B7280', trackColor: '#D1D5DB' /* gray-300   */, darkTrackColor: '#374151' /* gray-700   */ },
  level5:    { label: 'Level 5 · Owl',         ageRange: 'Adults 18+',  color: '#374151', textColor: '#FFFFFF', borderColor: '#111827', trackColor: '#D1D5DB' /* gray-300   */, darkTrackColor: '#1F2937' /* gray-800   */ },
};

export const BADGE_LEVEL_ORDER = ['preschool', 'level1', 'level2', 'level3', 'level4', 'level5'];
