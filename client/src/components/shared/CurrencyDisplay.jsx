import { formatCents } from '../../utils/formatCents.js';

export default function CurrencyDisplay({ cents, className = '' }) {
  const formatted = formatCents(cents);
  const negative = cents < 0;
  return (
    <span className={`font-mono ${negative ? 'text-red-600' : 'text-green-700'} ${className}`}>
      {formatted}
    </span>
  );
}
