import React from 'react';

const XpraFrame = React.memo(({ src }) => {
  if (!src) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Xpra stream will appear here when available.
      </div>
    );
  }

  return (
    <iframe
      title="Xpra session"
      src={src}
      className="h-full w-full rounded-md border border-slate-700 bg-black"
      sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
    />
  );
});

XpraFrame.displayName = 'XpraFrame';

export default XpraFrame;
