import CurrencyDisplay from '../shared/CurrencyDisplay.jsx';

export default function AccountCard({ account, selected, onClick, onEdit }) {
  return (
    <div
      className={`relative w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
        selected
          ? 'border-brand-400 bg-brand-50 dark:bg-indigo-900/30 shadow-sm'
          : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600 shadow-sm'
      }`}
      onClick={() => onClick(account)}
    >
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
        {account.name}
      </p>
      <p className="text-xs text-gray-400 dark:text-gray-500 capitalize mb-2">{account.type}</p>
      <CurrencyDisplay cents={account.balance_cents} className="text-xl font-bold" />
      {onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(account); }}
          className="absolute bottom-2 right-2 text-xs text-gray-400 dark:text-gray-500 hover:text-brand-600 transition-colors"
        >
          Edit
        </button>
      )}
    </div>
  );
}
