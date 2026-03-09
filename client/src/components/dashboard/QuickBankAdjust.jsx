import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCalculator } from '@fortawesome/free-solid-svg-icons';
import UnifiedBankDialog from '../bank/UnifiedBankDialog.jsx';

/**
 * Small outlined button that opens a unified bank dialog (parent only).
 * Used on the dashboard to quickly deposit / withdraw / transfer for a kid.
 */
export default function QuickBankAdjust({ userId, onDone, large = false, requireCurrencyWork = false }) {
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
        className={`inline-flex items-center justify-center bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors ${
          large ? 'rounded-full w-9 h-9' : 'rounded-full w-7 h-7'
        }`}
        title="Bank transaction"
      >
        <FontAwesomeIcon icon={faCalculator} className={large ? 'text-base' : 'text-xs block'} />
      </button>

      <UnifiedBankDialog
        open={open}
        onClose={() => setOpen(false)}
        userId={userId}
        initialMode="deposit"
        requireCurrencyWork={requireCurrencyWork}
        onSuccess={() => {
          onDone();
        }}
      />
    </>
  );
}
