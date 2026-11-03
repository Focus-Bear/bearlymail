import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { FiDownload } from 'react-icons/fi';

import { OverflowMenu, OverflowMenuItem } from 'components/common/OverflowMenu';
import { useEmlDownload } from 'hooks/useEmlDownload';

const MENU_ICON_SIZE = 14;

const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

/**
 * Per-message ⋮ menu in the thread view. It sits inside the clickable message
 * header, and React re-dispatches events from the portalled dropdown through
 * this tree, so clicks are stopped here or they would also expand/collapse
 * the message.
 */
export const ThreadMessageMenu: React.FC<{ emailId: string }> = ({ emailId }) => {
  const { t } = useTranslation();
  const downloadEml = useEmlDownload();
  const items = useMemo<OverflowMenuItem[]>(
    () => [
      {
        key: 'downloadEml',
        label: t('emailDetail.downloadEml'),
        icon: <FiDownload size={MENU_ICON_SIZE} />,
        onClick: () => void downloadEml(emailId),
      },
    ],
    [downloadEml, emailId, t]
  );

  return (
    <div onClick={stopPropagation} onKeyDown={stopPropagation} role="presentation">
      <OverflowMenu items={items} aria-label={t('emailDetail.messageOptions')} />
    </div>
  );
};
