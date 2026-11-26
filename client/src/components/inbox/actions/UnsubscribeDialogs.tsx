import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { theme } from 'theme/theme';

import { BlockSenderWarning } from 'components/BlockSenderWarning';
import { ConfirmModal } from 'components/ConfirmModal';
import { EMOJI_LINK } from 'constants/emojis';
import { UNSUBSCRIBE_METHODS, UNSUBSCRIBE_OUTCOMES, UnsubscribeMethod } from 'constants/unsubscribe';
import { UNSUBSCRIBE_FLOW_STEPS, UnsubscribeFlow } from 'hooks/useUnsubscribeFlow';

const CONFIRM_MESSAGE_KEYS: Record<UnsubscribeMethod, string> = {
  [UNSUBSCRIBE_METHODS.ONE_CLICK]: 'inbox.unsubscribeFlow.confirmOneClick',
  [UNSUBSCRIBE_METHODS.MAILTO]: 'inbox.unsubscribeFlow.confirmMailto',
  [UNSUBSCRIBE_METHODS.LINK]: 'inbox.unsubscribeFlow.confirmLink',
};

const ICON_DONE = '✅';
const ICON_ERROR = '⚠️';

/** The dialog for the flow's current step, or null between steps. */
const StepDialog: React.FC<{ flow: UnsubscribeFlow }> = ({ flow }) => {
  const { t } = useTranslation();
  const { step, senderName, senderAddress } = flow;

    switch (step.kind) {
      case UNSUBSCRIBE_FLOW_STEPS.CONFIRM:
        return (
          <ConfirmModal
            isOpen
            icon={EMOJI_LINK}
            title={t('inbox.unsubscribeFlow.confirmTitle', { sender: senderName })}
            message={t(CONFIRM_MESSAGE_KEYS[step.action.method], { sender: senderName })}
            confirmLabel={t('inbox.unsubscribe')}
            cancelLabel={t('common.cancel')}
            confirmColor={theme.colors.primary.main}
            onConfirm={() => void flow.confirm()}
            onCancel={flow.dismiss}
          />
        );
      case UNSUBSCRIBE_FLOW_STEPS.OPEN_LINK:
        return (
          <ConfirmModal
            isOpen
            icon={EMOJI_LINK}
            title={t('inbox.unsubscribeFlow.openLinkTitle')}
            message={t('inbox.unsubscribeFlow.openLinkMessage', { sender: senderName })}
            confirmLabel={t('inbox.unsubscribeFlow.openLinkConfirm')}
            cancelLabel={t('common.cancel')}
            confirmColor={theme.colors.primary.main}
            onConfirm={flow.openFallbackLink}
            onCancel={flow.dismiss}
          />
        );
      case UNSUBSCRIBE_FLOW_STEPS.OFFER_ARCHIVE:
        return (
          <ConfirmModal
            isOpen
            icon={ICON_DONE}
            title={t(
              step.outcome === UNSUBSCRIBE_OUTCOMES.UNSUBSCRIBED
                ? 'inbox.unsubscribeFlow.doneTitle'
                : 'inbox.unsubscribeFlow.finishInTabTitle',
              { sender: senderName }
            )}
            message={
              step.siblingCount
                ? t('inbox.unsubscribeFlow.archiveOfferWithOthers', { sender: senderName, count: step.siblingCount })
                : t('inbox.unsubscribeFlow.archiveOffer', { sender: senderName })
            }
            notice={
              <BlockSenderWarning
                title={t('inbox.unsubscribeFlow.blockWarningTitle', { address: senderAddress })}
                detail={t('inbox.unsubscribeFlow.blockWarningDetail')}
              />
            }
            confirmLabel={t('inbox.unsubscribeFlow.archiveAndBlock')}
            cancelLabel={t('inbox.unsubscribeFlow.keep')}
            confirmColor={theme.colors.primary.main}
            onConfirm={() => void flow.archiveSender()}
            onCancel={flow.dismiss}
          />
        );
      case UNSUBSCRIBE_FLOW_STEPS.ERROR:
        return (
          <ConfirmModal
            isOpen
            icon={ICON_ERROR}
            title={t('inbox.unsubscribeFlow.errorTitle')}
            message={t('inbox.unsubscribeFlow.errorMessage', { sender: senderName })}
            confirmLabel={t('inbox.unsubscribeFlow.ok')}
            cancelLabel={t('common.cancel')}
            confirmColor={theme.colors.primary.main}
            onConfirm={flow.dismiss}
            onCancel={flow.dismiss}
          />
        );
      default:
        return null;
    }
};

/**
 * The confirm → result → "archive their mail?" dialogs of the unsubscribe flow. Portalled to the
 * body because the inbox cards that own the flow can sit inside transformed (animated) ancestors,
 * which would trap a position: fixed overlay inside the card.
 */
export const UnsubscribeDialogs: React.FC<{ flow: UnsubscribeFlow }> = ({ flow }) =>
  createPortal(<StepDialog flow={flow} />, document.body);
