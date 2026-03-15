import { useEffect } from 'react';

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
  useEffect(() => {
    // Proactive cleanup of existing floating elements
    if (window.__upvote_cleanup) {
      window.__upvote_cleanup();
    }

    // Load the script
    const script = document.createElement('script');
    script.src = "https://upvote.entrext.com/widget.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
      if (window.__upvote_cleanup) {
        window.__upvote_cleanup();
      }
    };
  }, [userId, email]);

  return (
    <div 
      className="upvote-widget"
      data-application-id="69b6fc563c257178f36b2a92"
      data-user-id={userId || ''}
      data-email={email || ''}
      data-position="right"
      data-theme="light"
      data-logo-url="/logo.png"
      data-product-overview="..."
      data-about-text="..."
      data-faqs='[{"question":"Q?","answer":"A."}]'
    />
  );
}
