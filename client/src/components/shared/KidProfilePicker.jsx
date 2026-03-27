import { useNavigate } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear } from '@fortawesome/free-solid-svg-icons';
import Avatar from './Avatar.jsx';

/**
 * Row of kid profile-pic buttons for switching between kids (parent only).
 * Optionally shows a gear icon for a "manage/everyone" mode.
 *
 * @param {{ kids: Array, currentId: string|number, routePrefix: string, manageRoute?: string, manageLabel?: string }} props
 */
export default function KidProfilePicker({ kids, currentId, routePrefix, manageRoute = null, manageLabel = 'Manage', className }) {
  const navigate = useNavigate();
  const isManageMode = !!manageRoute && !currentId;

  return (
    <div className={className ?? "flex items-center gap-2 mb-5 p-1 overflow-x-auto scrollbar-hide"}>
      {manageRoute && (
        <button
          onClick={() => navigate(manageRoute)}
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors border-2 ${
            isManageMode
              ? 'border-brand-500 bg-brand-100 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400'
              : 'border-transparent bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 opacity-50 hover:opacity-75'
          }`}
          title={manageLabel}
        >
          <FontAwesomeIcon icon={faGear} className="text-lg" />
        </button>
      )}
      {kids.map((kid) => {
        const isSelected = String(kid.id) === String(currentId);
        return (
          <button
            key={kid.id}
            onClick={() => navigate(`${routePrefix}/${kid.id}`)}
            className={`rounded-full shrink-0 border-2 transition-colors ${
              isSelected
                ? 'border-brand-500'
                : 'border-transparent opacity-40 hover:opacity-70'
            }`}
            title={kid.name}
          >
            <Avatar name={kid.name} color={kid.avatar_color || '#6366f1'} emoji={kid.avatar_emoji} size="md" />
          </button>
        );
      })}
    </div>
  );
}
