import { usePresenceStore } from '@/stores/presenceStore';
import { getPresenceColor } from '@/lib/realtime';

/**
 * Horizontal row of avatar circles showing who else is viewing this page.
 * Placed in the page top bar.
 */
export default function PresenceAvatarBar() {
  const pageUsers = usePresenceStore((s) => s.pageUsers);

  if (pageUsers.length === 0) return null;

  const maxVisible = 4;
  const visible = pageUsers.slice(0, maxVisible);
  const overflow = pageUsers.length - maxVisible;

  return (
    <div className="flex items-center -space-x-2">
      {visible.map((user) => {
        const colors = getPresenceColor(user.userId);
        const initials = getInitials(user.name);
        return (
          <div
            key={user.userId}
            className="relative group"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-7 h-7 rounded-full ring-2 ring-white"
                style={{ boxShadow: `0 0 0 2px ${colors.border}` }}
              />
            ) : (
              <div
                className="w-7 h-7 rounded-full ring-2 ring-white flex items-center justify-center text-xs font-medium text-white"
                style={{ backgroundColor: colors.border }}
              >
                {initials}
              </div>
            )}
            {/* Tooltip */}
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
              {user.name}
            </div>
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="w-7 h-7 rounded-full ring-2 ring-white bg-gray-400 flex items-center justify-center text-xs font-medium text-white">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] ?? '?').toUpperCase();
}
