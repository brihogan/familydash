import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator } from '@fortawesome/free-solid-svg-icons';
import UnifiedBankDialog from '../bank/UnifiedBankDialog.jsx';

/**
 * Small outlined button that opens a unified bank dialog (parent only).
 * Used on the dashboard to quickly deposit / withdraw / transfer for a kid.
 */
export default function QuickBankAdjust({ userId, onDone, large = false }) {
  const [open, setOpen] = useState(false);

  const handleOpen = (e) => {
    e.stopPropagation();
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center justify-center border border-gray-300 text-gray-500 hover:text-brand-600 hover:border-brand-400 transition-colors ${
          large ? 'rounded-full w-9 h-9' : 'rounded px-1.5 py-0.5'
        }`}
        title="Bank transaction"
      >
        <FontAwesomeIcon icon={faCalculator} className={large ? 'text-base' : 'text-xs'} />
      </button>

      <UnifiedBankDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        initialMode="deposit"
        onSuccess={() => {
          onDone();
        }}
      />
    </>
  );
}
