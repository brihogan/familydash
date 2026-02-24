/**
 * Colored circle avatar with initials or an emoji.
 * @param {{ name: string, color: string, emoji?: string | null, size?: 'sm' | 'md' | 'lg' }} props
 */
export default function Avatar({ name, color, emoji, size = 'md' }) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const sizeClass = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
  }[size];

  const emojiSize = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
  }[size];

  const initialsSize = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-lg',
  }[size];

  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      style={{ backgroundColor: color }}
    >
      {emoji
        ? <span className={emojiSize} style={{ lineHeight: 1 }}>{emoji}</span>
        : <span className={initialsSize}>{initials}</span>
      }
    </div>
  );
}
