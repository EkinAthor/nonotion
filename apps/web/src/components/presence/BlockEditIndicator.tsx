import type { PresenceUser } from '@nonotion/shared';
import { getPresenceColor } from '@/lib/realtime';

interface BlockEditIndicatorProps {
  user: PresenceUser;
}

/**
 * Visual indicator that another user is editing a block.
 * Shows a colored left border and a floating name tag.
 */
export default function BlockEditIndicator({ user }: BlockEditIndicatorProps) {
  const colors = getPresenceColor(user.userId);

  return (
    <>
      {/* Colored left border */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
        style={{ backgroundColor: colors.border }}
      />
      {/* Name tag */}
      <div
        className="absolute -top-5 left-1 px-1.5 py-0.5 text-[10px] font-medium rounded whitespace-nowrap z-10"
        style={{ backgroundColor: colors.border, color: 'white' }}
      >
        {user.name}
      </div>
    </>
  );
}
