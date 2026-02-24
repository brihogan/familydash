import { NavLink } from 'react-router-dom';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Settings</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <NavLink to="/settings/users"
          className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all">
          <h2 className="font-semibold text-gray-800 mb-1">Family Members</h2>
          <p className="text-sm text-gray-500">Add or manage parents and kids.</p>
        </NavLink>
        <NavLink to="/settings/rewards"
          className="block p-5 bg-white border border-gray-200 rounded-xl hover:border-brand-300 hover:shadow-sm transition-all">
          <h2 className="font-semibold text-gray-800 mb-1">Manage Rewards</h2>
          <p className="text-sm text-gray-500">Create and edit the rewards catalog.</p>
        </NavLink>
      </div>
    </div>
  );
}
