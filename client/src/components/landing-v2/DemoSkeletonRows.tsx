import React from 'react';

/**
 * Greyed-out placeholder email rows that pad the Action tab of the live demo,
 * so "bumped to the top of Action" puts the routed card above something
 * visible. Purely decorative — content comes from i18n skeleton.* keys.
 */
interface DemoSkeletonRowsProps {
  /** i18n row ids (under <prefix>.skeleton.*) to render, in order. */
  rowIds: readonly string[];
  /** Prefix-aware translator passed down from LiveDemo. */
  localT: (suffix: string) => string;
}

export const DemoSkeletonRows: React.FC<DemoSkeletonRowsProps> = ({ rowIds, localT }) => (
  <>
    {rowIds.map(rowId => {
      const sender = localT(`skeleton.${rowId}.sender`);
      return (
        <div className="skel-row" key={rowId} aria-hidden="true">
          <span className="skel-avatar">{sender.charAt(0).toUpperCase()}</span>
          <span className="skel-sender">{sender}</span>
          <span className="skel-subj">{localT(`skeleton.${rowId}.subject`)}</span>
          <span className="skel-time">{localT(`skeleton.${rowId}.time`)}</span>
        </div>
      );
    })}
  </>
);
