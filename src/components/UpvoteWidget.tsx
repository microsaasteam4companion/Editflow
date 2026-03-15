import { useEffect, useState } from 'react';

declare global {
  interface Window {
    __upvote_cleanup?: () => void;
  }
}

interface UpvoteWidgetProps {
  userId?: string;
  email?: string;
}

export default function UpvoteWidget({ userId, email }: UpvoteWidgetProps) {
  const [remountKey, setRemountKey] = useState(0);

  useEffect(() => {
    // Force hard remount for cleanup when identity changes
    setRemountKey(k => k + 1);
    
    // Proactive cleanup of existing floating elements
    if (window.__upvote_cleanup) window.__upvote_cleanup();
  }, [userId, email]);

  return (
    <div key={remountKey}>
      <div className="upvote-widget"
           data-application-id="69b6fc563c257178f36b2a92"
           data-user-id={userId || ''}
           data-email={email || ''}
           data-position="right"
           data-theme="light"
           data-logo-url="/logo.png"         // Optional: your logo
           data-product-overview="..."       // Optional
           data-about-text="..."             // Optional
           data-faqs='[{"question":"Q?","answer":"A."}]'>
        <script src="https://upvote.entrext.com/widget.js" async />
      </div>
    </div>
  );
}
