import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  OrgMember,
  useInviteMember,
  useMyOrganization,
  useRemoveMember,
  useUpdateMemberRole,
} from 'queries/useMyOrganization';
import { useApplyPromoCode, useSeatUsage, useVolumeUsage, VolumeUsage } from 'queries/useOrgUsage';
import { theme } from 'theme/theme';

import { ConfirmModal } from 'components/ConfirmModal';
import { PlanPickerModal } from 'components/settings/plan-picker/PlanPickerModal';
import { PlanStatusBanner } from 'components/settings/PlanStatusBanner';
import { PLANS_QUERY_OPEN, PLANS_QUERY_PARAM } from 'constants/strings';
import { useAuth } from 'contexts/AuthContext';
import { useNotifications } from 'contexts/NotificationContext';

type OrgRole = 'admin' | 'member';

const ROLE_ADMIN: OrgRole = 'admin';
const ROLE_MEMBER: OrgRole = 'member';
const ROLE_OWNER = 'owner';
const STATUS_ACTIVE = 'active';
const PLAN_TRIAL = 'trial';
const PLAN_ACTIVE = 'active';
const STATUS_PENDING = 'pending';
const VOLUME_WARN_THRESHOLD = 80;
const VOLUME_CRITICAL_THRESHOLD = 100;

const sectionStyle: React.CSSProperties = {
  marginBottom: '32px',
};

const headingStyle: React.CSSProperties = {
  fontSize: '20px',
  fontWeight: 600,
  color: theme.colors.text.primary,
  marginBottom: '8px',
};

const descStyle: React.CSSProperties = {
  fontSize: '14px',
  color: theme.colors.text.secondary,
  marginBottom: '24px',
};

const inputStyle: React.CSSProperties = {
  border: `1px solid ${theme.colors.border.light}`,
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '14px',
  color: theme.colors.text.primary,
  backgroundColor: theme.colors.background.paper,
  width: '100%',
};

const buttonStyle: React.CSSProperties = {
  backgroundColor: theme.colors.primary.main,
  color: theme.colors.common.white,
  border: 'none',
  borderRadius: '6px',
  padding: '8px 16px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerButtonStyle: React.CSSProperties = {
  ...buttonStyle,
  backgroundColor: theme.colors.error.main,
};

const memberRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 0',
  borderBottom: `1px solid ${theme.colors.border.light}`,
  gap: '12px',
};

const progressBarContainerStyle: React.CSSProperties = {
  width: '100%',
  height: '8px',
  backgroundColor: theme.colors.border.light,
  borderRadius: '4px',
  overflow: 'hidden',
  marginTop: '6px',
};

interface VolumeProgressBarProps {
  percentUsed: number;
}

const VolumeProgressBar: React.FC<VolumeProgressBarProps> = ({ percentUsed }) => {
  const clamped = Math.min(percentUsed, 100);
  let color: string;
  if (clamped >= VOLUME_CRITICAL_THRESHOLD) {
    color = theme.colors.error.main;
  } else if (clamped >= VOLUME_WARN_THRESHOLD) {
    color = theme.colors.warning?.main ?? '#f59e0b';
  } else {
    color = theme.colors.primary.main;
  }
  return (
    <div style={progressBarContainerStyle}>
      <div
        style={{
          width: `${clamped}%`,
          height: '100%',
          backgroundColor: color,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
};

/**
 * Email volume usage (used / limit, % bar, warnings). Rendered independently of
 * team-org membership: email volume is metered per-org server-side and the
 * `/organizations/usage` endpoint always returns a value (real or the default
 * tier), so every user — including solo users not in a team — can see their cap.
 */
const EmailVolumeUsage: React.FC<{ volumeUsage?: VolumeUsage }> = ({ volumeUsage }) => {
  const { t } = useTranslation();
  // Self-hosted deployments have no usage limits — hide the bar entirely.
  if (!volumeUsage || volumeUsage.selfHosted) {
    return null;
  }
  const volumePercent = volumeUsage.percentUsed ?? 0;
  const isVolumeWarning = volumePercent >= VOLUME_WARN_THRESHOLD;
  const isVolumeCritical = volumePercent >= VOLUME_CRITICAL_THRESHOLD;
  return (
    <div style={{ marginBottom: '24px' }}>
      <div style={{ fontSize: '14px', color: theme.colors.text.secondary, marginBottom: '4px' }}>
        {t('team.settings.emailUsage', {
          used: volumeUsage.emailsUsed,
          limit: volumeUsage.emailLimit,
          percent: volumePercent,
        })}
      </div>
      <VolumeProgressBar percentUsed={volumePercent} />
      {isVolumeCritical && (
        <p style={{ color: theme.colors.error.main, fontSize: '13px', marginTop: '6px' }}>
          {t('team.settings.volumeLimitReached')}
        </p>
      )}
      {isVolumeWarning && !isVolumeCritical && (
        <p style={{ color: theme.colors.warning?.main ?? '#f59e0b', fontSize: '13px', marginTop: '6px' }}>
          {t('team.settings.volumeWarning', { percent: volumePercent })}
        </p>
      )}
    </div>
  );
};

// eslint-disable-next-line max-lines-per-function -- settings section with many conditional branches
export const TeamSettingsSection: React.FC = () => {
  const { t } = useTranslation();
  const { showError } = useNotifications();
  const { user } = useAuth();
  const { data: org, isLoading } = useMyOrganization();
  const { data: seatUsage } = useSeatUsage();
  const { data: volumeUsage } = useVolumeUsage();
  const inviteMutation = useInviteMember();
  const updateRoleMutation = useUpdateMemberRole();
  const removeMutation = useRemoveMember();
  const promoMutation = useApplyPromoCode();

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>(ROLE_MEMBER);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [memberToRemove, setMemberToRemove] = useState<OrgMember | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [promoMessage, setPromoMessage] = useState('');
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Deep link from the AI-limit banner's "View plans" CTA: ?plans=open
  // auto-opens the plan picker, then the param is stripped (replace, keeping
  // the #team-usage hash) so refresh/back doesn't re-open the modal.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get(PLANS_QUERY_PARAM) !== PLANS_QUERY_OPEN) {
      return;
    }
    setPlanPickerOpen(true);
    params.delete(PLANS_QUERY_PARAM);
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true });
  }, [location.pathname, location.search, location.hash, navigate]);

  // Purchase gating: only org owners/admins can buy in-app (the webhook
  // activates the org owned by the purchasing user); plain members get a
  // read-only plan list; self-hosted deployments have no plans at all.
  const selfHosted = volumeUsage?.selfHosted === true;
  const myRole = org?.members?.find(member => member.userId === user?.id)?.role;
  const isOwnerOrAdmin = myRole === ROLE_OWNER || myRole === ROLE_ADMIN || (!!org && !!user && org.ownerId === user.id);
  const canPurchase = !!org && isOwnerOrAdmin;
  const showMemberNote = !!org && !isOwnerOrAdmin;
  const showViewPlansButton =
    canPurchase &&
    !selfHosted &&
    (volumeUsage?.planStatus === PLAN_TRIAL || volumeUsage?.planStatus === PLAN_ACTIVE);
  const openPlanPicker = () => setPlanPickerOpen(true);

  const planPickerModal = !selfHosted && (
    <PlanPickerModal
      isOpen={planPickerOpen}
      onClose={() => setPlanPickerOpen(false)}
      volumeUsage={volumeUsage}
      canPurchase={canPurchase}
      showMemberNote={showMemberNote}
    />
  );

  const roleOptions: Array<{ value: OrgRole; label: string }> = [
    { value: ROLE_ADMIN, label: t('team.settings.roleAdmin') },
    { value: ROLE_MEMBER, label: t('team.settings.roleMember') },
  ];

  const handleInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    setInviteError('');
    setInviteSuccess('');
    try {
      await inviteMutation.mutateAsync({ email: inviteEmail, role: inviteRole });
      setInviteSuccess(t('team.settings.inviteSent'));
      setInviteEmail('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('team.settings.inviteError');
      setInviteError(message);
    }
  };

  const handleRoleChange = async (member: OrgMember, newRole: OrgRole) => {
    try {
      await updateRoleMutation.mutateAsync({ memberId: member.id, role: newRole });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('team.settings.roleChangeError');
      showError(message);
    }
  };

  const handleRemove = (member: OrgMember) => {
    setMemberToRemove(member);
  };

  const handleConfirmRemove = async () => {
    if (!memberToRemove) {
      return;
    }
    const member = memberToRemove;
    setMemberToRemove(null);
    try {
      await removeMutation.mutateAsync(member.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('team.settings.removeError');
      showError(message);
    }
  };

  const handleCancelRemove = () => {
    setMemberToRemove(null);
  };

  const handleApplyPromo = async (event: React.FormEvent) => {
    event.preventDefault();
    setPromoMessage('');
    try {
      const result = await promoMutation.mutateAsync(promoCode);
      setPromoMessage(result.success ? t('team.settings.promoApplied') : result.message);
      if (result.success) {
        setPromoCode('');
      }
    } catch {
      setPromoMessage(t('team.settings.promoError'));
    }
  };

  if (isLoading) {
    return (
      <div id="team" style={sectionStyle}>
        <h2 style={headingStyle}>{t('team.settings.title')}</h2>
        <p style={descStyle}>{t('common.loading')}</p>
      </div>
    );
  }

  if (!org) {
    return (
      <div id="team" style={sectionStyle}>
        <h2 style={headingStyle}>{t('team.settings.title')}</h2>
        {/* Email usage is per-account and shows even without a team org. */}
        <PlanStatusBanner volumeUsage={volumeUsage} onUpgradeClick={selfHosted ? undefined : openPlanPicker} />
        <div id="team-usage">
          <EmailVolumeUsage volumeUsage={volumeUsage} />
        </div>
        <p style={descStyle}>{t('team.settings.noOrg')}</p>
        {planPickerModal}
      </div>
    );
  }

  const activeMembers = org.members.filter(member => member.status === STATUS_ACTIVE);
  const pendingMembers = org.members.filter(member => member.status === STATUS_PENDING);

  return (
    <div id="team" style={sectionStyle}>
      <ConfirmModal
        isOpen={memberToRemove !== null}
        title={t('team.settings.confirmRemoveTitle')}
        message={t('team.settings.confirmRemove', {
          name: memberToRemove?.displayName ?? memberToRemove?.email ?? '',
        })}
        confirmLabel={t('team.settings.remove')}
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
      />

      <h2 id="team-members" style={headingStyle}>
        {t('team.settings.title')}
      </h2>

      <PlanStatusBanner volumeUsage={volumeUsage} onUpgradeClick={selfHosted ? undefined : openPlanPicker} />

      {showViewPlansButton && (
        <div style={{ marginBottom: '16px' }}>
          <button style={buttonStyle} onClick={openPlanPicker} data-testid="view-plans-button">
            {t('team.settings.planPicker.viewPlans')}
          </button>
        </div>
      )}

      {planPickerModal}

      <p style={descStyle}>
        {t('team.settings.orgName')}: <strong>{org.name}</strong>
      </p>

      <div id="team-usage">
        {seatUsage && (
          <div style={{ marginBottom: '16px', fontSize: '14px', color: theme.colors.text.secondary }}>
            {t('team.settings.seats', {
              active: seatUsage.activeSeats,
              max: seatUsage.maxSeats,
            })}
          </div>
        )}

        <EmailVolumeUsage volumeUsage={volumeUsage} />
      </div>

      <h3 style={{ ...headingStyle, fontSize: '16px', marginBottom: '8px' }}>{t('team.settings.members')}</h3>

      {activeMembers.length === 0 && <p style={descStyle}>{t('team.settings.noMembers')}</p>}

      {activeMembers.map(member => (
        <div key={member.id} style={memberRowStyle}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500, color: theme.colors.text.primary, fontSize: '14px' }}>
              {member.displayName ?? member.email}
            </div>
            <div style={{ fontSize: '12px', color: theme.colors.text.secondary }}>{member.email}</div>
          </div>

          {member.role !== ROLE_OWNER && (
            <select
              value={member.role}
              onChange={event => handleRoleChange(member, event.target.value as OrgRole)}
              style={{ ...inputStyle, width: 'auto' }}
            >
              {roleOptions.map(opt => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}

          {member.role === ROLE_OWNER && (
            <span style={{ fontSize: '12px', color: theme.colors.text.secondary }}>{t('team.settings.owner')}</span>
          )}

          {member.role !== ROLE_OWNER && (
            <button style={dangerButtonStyle} onClick={() => handleRemove(member)} disabled={removeMutation.isPending}>
              {t('team.settings.remove')}
            </button>
          )}
        </div>
      ))}

      {pendingMembers.length > 0 && (
        <>
          <h3 style={{ ...headingStyle, fontSize: '16px', marginTop: '24px', marginBottom: '8px' }}>
            {t('team.settings.pendingInvites')}
          </h3>
          {pendingMembers.map(member => (
            <div key={member.id} style={memberRowStyle}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '14px', color: theme.colors.text.secondary }}>{member.email}</div>
              </div>
              <span style={{ fontSize: '12px', color: theme.colors.text.secondary }}>{t('team.settings.pending')}</span>
            </div>
          ))}
        </>
      )}

      <h3 style={{ ...headingStyle, fontSize: '16px', marginTop: '32px', marginBottom: '8px' }}>
        {t('team.settings.inviteMember')}
      </h3>

      <form
        onSubmit={handleInvite}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}
      >
        <input
          type="email"
          value={inviteEmail}
          onChange={event => setInviteEmail(event.target.value)}
          placeholder={t('team.settings.emailPlaceholder')}
          style={inputStyle}
          required
        />
        <select value={inviteRole} onChange={event => setInviteRole(event.target.value as OrgRole)} style={inputStyle}>
          {roleOptions.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button type="submit" style={buttonStyle} disabled={inviteMutation.isPending}>
          {inviteMutation.isPending ? t('team.settings.inviting') : t('team.settings.sendInvite')}
        </button>
        {inviteSuccess && (
          <p style={{ color: theme.colors.success.main, fontSize: '14px', margin: 0 }}>{inviteSuccess}</p>
        )}
        {inviteError && <p style={{ color: theme.colors.error.main, fontSize: '14px', margin: 0 }}>{inviteError}</p>}
      </form>

      <h3 id="team-promo" style={{ ...headingStyle, fontSize: '16px', marginTop: '32px', marginBottom: '8px' }}>
        {t('team.settings.promoCodeTitle')}
      </h3>
      <form
        onSubmit={handleApplyPromo}
        style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}
      >
        <input
          type="text"
          value={promoCode}
          onChange={event => setPromoCode(event.target.value)}
          placeholder={t('team.settings.promoCodePlaceholder')}
          style={inputStyle}
          required
        />
        <button type="submit" style={buttonStyle} disabled={promoMutation.isPending}>
          {promoMutation.isPending ? t('team.settings.promoApplying') : t('team.settings.promoApply')}
        </button>
        {promoMessage && (
          <p
            style={{
              color:
                promoMutation.isSuccess && promoMutation.data?.success
                  ? theme.colors.success.main
                  : theme.colors.error.main,
              fontSize: '14px',
              margin: 0,
            }}
          >
            {promoMessage}
          </p>
        )}
      </form>
    </div>
  );
};
