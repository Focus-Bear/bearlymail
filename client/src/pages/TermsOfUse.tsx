import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme/theme';

const TermsOfUse: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: theme.colors.background.default,
      padding: theme.spacing.xl,
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <button
        onClick={() => navigate(-1)}
        style={{
          background: 'transparent',
          border: 'none',
          color: theme.colors.primary.main,
          cursor: 'pointer',
          fontSize: theme.typography.fontSize.base,
          marginBottom: theme.spacing.lg,
          textDecoration: 'underline',
        }}
      >
        ← Back
      </button>

      <h1 style={{
        fontSize: theme.typography.fontSize['3xl'],
        fontWeight: theme.typography.fontWeight.bold,
        marginBottom: theme.spacing.lg,
        color: theme.colors.text.primary,
      }}>
        Terms of Use
      </h1>

      <div style={{
        backgroundColor: theme.colors.background.paper,
        padding: theme.spacing.xl,
        borderRadius: theme.borderRadius.lg,
        boxShadow: theme.shadows.sm,
        lineHeight: theme.typography.lineHeight.relaxed,
        color: theme.colors.text.primary,
      }}>
        <p style={{ marginBottom: theme.spacing.md, fontSize: theme.typography.fontSize.sm, color: theme.colors.text.secondary }}>
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            1. Agreement to Terms
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            By accessing or using BearlyMail ("Service"), you agree to be bound by these Terms of Use. If you disagree with any part of these terms, you may not access the Service.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            2. Description of Service
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            BearlyMail is an email management service that helps users organize, prioritize, and manage their email using AI-powered features including:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Email prioritization and scoring</li>
            <li>AI-generated summaries</li>
            <li>Draft reply suggestions</li>
            <li>Email batching and scheduling</li>
            <li>Calendar booking integration</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            3. Account Requirements
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            To use the Service, you must:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Be at least 13 years old</li>
            <li>Provide accurate and complete registration information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized access</li>
            <li>Be approved from our waitlist (if applicable)</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            4. Acceptable Use
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            You agree not to:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Use the Service for any illegal purpose</li>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe upon intellectual property rights</li>
            <li>Transmit harmful code, viruses, or malware</li>
            <li>Interfere with or disrupt the Service</li>
            <li>Attempt to gain unauthorized access to the Service</li>
            <li>Use the Service to send spam or unsolicited emails</li>
            <li>Impersonate any person or entity</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            5. Subscription and Payment
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            The Service may offer free trials and paid subscription plans:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Free trials are offered for a limited time (e.g., 7 days)</li>
            <li>Subscriptions automatically renew unless canceled</li>
            <li>You are responsible for all charges incurred under your account</li>
            <li>Refunds are subject to our refund policy</li>
            <li>Prices may change with notice to existing subscribers</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            6. Intellectual Property
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            The Service and its original content, features, and functionality are owned by BearlyMail and are protected by international copyright, trademark, and other intellectual property laws.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            7. User Content
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            You retain ownership of your email content. By using the Service, you grant us a limited license to process, store, and analyze your emails solely for the purpose of providing the Service.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            8. Third-Party Services
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            The Service integrates with third-party services (Google, OpenAI, etc.). Your use of these services is subject to their respective terms of service and privacy policies.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            9. Disclaimers
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND. We do not guarantee that:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>The Service will be uninterrupted or error-free</li>
            <li>All emails will be processed correctly</li>
            <li>AI-generated content will be accurate or appropriate</li>
            <li>The Service will meet your specific requirements</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            10. Limitation of Liability
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, BEARLYMAIL SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            11. Termination
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We may terminate or suspend your account and access to the Service immediately, without prior notice, for conduct that we believe violates these Terms or is harmful to other users, us, or third parties.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            12. Changes to Terms
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We reserve the right to modify these Terms at any time. Material changes will be notified to you via email or through the Service. Your continued use after such changes constitutes acceptance.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            13. Governing Law
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            These Terms shall be governed by and construed in accordance with applicable laws, without regard to conflict of law principles.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            14. Contact Information
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            For questions about these Terms, please contact us at:
          </p>
          <p style={{ marginBottom: theme.spacing.md }}>
            Email: legal@bearlymail.com<br />
            Made by Focus Bear
          </p>
        </section>
      </div>
    </div>
  );
};

export default TermsOfUse;





