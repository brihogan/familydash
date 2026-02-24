/**
 * Format integer cents as a dollar string.
 * formatCents(1250) → "$12.50"
 * formatCents(-500) → "-$5.00"
 */
export function formatCents(cents) {
  const abs = Math.abs(cents);
  const formatted = (abs / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cents < 0 ? `-$${formatted}` : `$${formatted}`;
}
