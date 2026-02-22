import { useState } from 'react';

const DISMISSED_KEY = 'nonotion_demo_banner_dismissed';

export default function DemoBanner() {
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISSED_KEY) === 'true'
  );

  if (dismissed) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm flex-shrink-0">
      <span>
        <strong>Demo Mode</strong> — Changes are saved in your browser&apos;s local storage only and will not persist across devices or browser resets.
      </span>
      <button
        onClick={handleDismiss}
        className="ml-4 p-1 rounded hover:bg-amber-100 text-amber-600 flex-shrink-0"
        title="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
