import CurrencyDisplay from '../shared/CurrencyDisplay.jsx';

export default function AccountCard({ account, selected, onClick, onEdit }) {
  return (
    <div
      className={`relative w-full text-left p-4 rounded-xl border-2 transition-all cursor-pointer ${
        selected
          ? 'border-brand-400 bg-brand-50 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200 shadow-sm'
      }`}
      onClick={() => onClick(account)}
    >
      <p className="text-sm font-semibold text-gray-700 capitalize">
        {account.name}
      </p>
      <p className="text-xs text-gray-400 capitalize mb-2">{account.type}</p>
      <CurrencyDisplay cents={account.balance_cents} className="text-xl font-bold" />
      {onEdit && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onEdit(account); }}
          className="absolute bottom-2 right-2 text-xs text-gray-400 hover:text-brand-600 transition-colors"
        >
          Edit
        </button>
      )}
    </div>
  );
}
