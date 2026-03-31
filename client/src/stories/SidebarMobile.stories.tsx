/**
 * Storybook stories for Sidebar mobile open/closed states.
 *
 * PR #1202 changed the mobile-hide strategy from `translateX(-100%)` to
 * `display: none` to eliminate the flash-of-visible-sidebar on initial render.
 *
 * These stories import and render the REAL Sidebar component from the codebase,
 * wrapped in a MemoryRouter to satisfy react-router hooks.
 */
import React, { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { Meta, StoryObj } from '@storybook/react';

import { Sidebar } from 'components/inbox/Sidebar';

// ─── Mock user ───────────────────────────────────────────────────────────────

const mockUser = {
  id: 'demo-user-1',
  email: 'demo@bearlymail.com',
  isAdmin: false,
};

const mockLogout = () => {
  console.log('logout called');
};

// ─── App shell wrappers ──────────────────────────────────────────────────────

const MobileOpenWrapper: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <MemoryRouter initialEntries={['/inbox']}>
      <div
        style={{
          width: '390px',
          height: '844px',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          background: '#F5F5F5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <Sidebar
          user={mockUser}
          logout={mockLogout}
          isMobileMenuOpen={isOpen}
          onCloseMobileMenu={() => setIsOpen(false)}
          isCollapsed={false}
        />
        <div style={{ padding: '16px', paddingTop: '72px' }}>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>Sidebar is open (mobile). Tap backdrop to close.</p>
        </div>
      </div>
    </MemoryRouter>
  );
};

const MobileClosedWrapper: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <MemoryRouter initialEntries={['/inbox']}>
      <div
        style={{
          width: '390px',
          height: '844px',
          position: 'relative',
          overflow: 'hidden',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          background: '#F5F5F5',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <Sidebar
          user={mockUser}
          logout={mockLogout}
          isMobileMenuOpen={isOpen}
          onCloseMobileMenu={() => setIsOpen(false)}
          isCollapsed={false}
        />
        <div style={{ padding: '16px' }}>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>Sidebar is closed (display: none). No flash on load.</p>
          <button
            onClick={() => setIsOpen(true)}
            style={{
              marginTop: '8px',
              padding: '8px 16px',
              background: '#E9902C',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            ☰ Open sidebar
          </button>
        </div>
      </div>
    </MemoryRouter>
  );
};

const DesktopWrapper: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <MemoryRouter initialEntries={['/inbox']}>
      <div
        style={{
          width: '1200px',
          height: '768px',
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid #E5E7EB',
          borderRadius: '12px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}
      >
        <Sidebar
          user={mockUser}
          logout={mockLogout}
          isMobileMenuOpen={false}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(prev => !prev)}
        />
        <div style={{ flex: 1, padding: '24px', background: '#F5F5F5' }}>
          <p style={{ color: '#6B7280', fontSize: '14px' }}>Desktop layout — sidebar is always visible.</p>
        </div>
      </div>
    </MemoryRouter>
  );
};

// ─── Meta ────────────────────────────────────────────────────────────────────

const meta: Meta = {
  title: 'Inbox/Sidebar/Mobile',
  parameters: {
    layout: 'centered',
    backgrounds: { default: 'light gray' },
    docs: {
      description: {
        component: `
**PR #1202 — Mobile sidebar \`display:none\` fix**

Previously the mobile sidebar used \`transform: translateX(-100%)\` to hide itself when closed. This caused a visible flash on initial render because the browser paints the element before JavaScript applies the transform.

The fix switches to \`display: none\` (closed) / \`display: flex\` (open) which fully removes the element from layout, eliminating the flash entirely.

These stories render the **real \`Sidebar\` component** from \`components/inbox/Sidebar.tsx\`, not a reimplemented shell.
        `,
      },
    },
  },
};

export default meta;
type Story = StoryObj;

/**
 * Sidebar closed (default mobile state).
 * The panel has `display: none` — no sidebar visible, no flash.
 */
export const MobileClosed: Story = {
  name: 'Mobile — Closed (display: none)',
  render: () => <MobileClosedWrapper />,
};

/**
 * Sidebar open (user tapped the hamburger menu).
 * The panel has `display: flex` and overlays content with a dimmed backdrop.
 */
export const MobileOpen: Story = {
  name: 'Mobile — Open (display: flex)',
  render: () => <MobileOpenWrapper />,
};

/**
 * Desktop layout — sidebar always visible, supports collapse toggle.
 */
export const Desktop: Story = {
  name: 'Desktop — Expanded & Collapsible',
  render: () => <DesktopWrapper />,
};
