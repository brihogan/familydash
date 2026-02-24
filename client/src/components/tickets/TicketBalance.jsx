export default function TicketBalance({ balance }) {
  return (
    <div className="bg-gradient-to-br from-brand-500 to-purple-600 rounded-2xl p-6 text-white text-center shadow-lg">
      <p className="text-sm font-medium opacity-80 mb-1">Ticket Balance</p>
      <p className="text-5xl font-bold">{balance}</p>
      <p className="text-sm opacity-70 mt-1">🎟 tickets</p>
    </div>
  );
}
