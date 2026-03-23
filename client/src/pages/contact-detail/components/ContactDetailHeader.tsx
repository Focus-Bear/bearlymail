import React from 'react';
import { theme } from 'theme/theme';
import { ContactDetail, ContactTypeConfig } from 'types/contact';

import { ContactTypeBadge } from 'components/crm/ContactTypeBadge';

interface Props {
  contact: ContactDetail;
  typeConfig?: ContactTypeConfig | undefined;
  WIDTH_64_PX: number;
  HEIGHT_64_PX: number;
}

const ContactDetailHeader: React.FC<Props> = ({ contact, typeConfig, WIDTH_64_PX, HEIGHT_64_PX }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.lg, marginBottom: theme.spacing.lg }}>
      {contact.photoUrl ? (
        <img
          src={contact.photoUrl}
          alt=""
          style={{ width: `${WIDTH_64_PX}px`, height: `${HEIGHT_64_PX}px`, borderRadius: '50%', objectFit: 'cover' }}
        />
      ) : (
        <div
          style={{
            width: `${WIDTH_64_PX}px`,
            height: `${HEIGHT_64_PX}px`,
            borderRadius: '50%',
            backgroundColor: theme.colors.primary.subtle,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: theme.colors.primary.main,
            fontSize: '24px',
            fontWeight: theme.typography.fontWeight.semibold,
            flexShrink: 0,
          }}
        >
          {(contact.name || contact.email)[0].toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.sm, marginBottom: theme.spacing.xs }}>
          <h1 style={{ ...theme.typography.heading.h4, color: theme.colors.text.primary, margin: 0 }}>
            {contact.name || contact.email}
          </h1>
          {typeConfig && (
            <ContactTypeBadge label={typeConfig.label} color={typeConfig.color} icon={typeConfig.icon} size="md" />
          )}
        </div>
        <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSize.base }}>
          {contact.email}
        </div>
      </div>
    </div>
  );
};

export default ContactDetailHeader;
