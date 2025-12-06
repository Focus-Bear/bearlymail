import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../theme/theme';

const PrivacyPolicy: React.FC = () => {
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
        Privacy Policy
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
            1. Introduction
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            BearlyMail ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our email management service.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            2. Information We Collect
          </h2>
          <h3 style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
            marginTop: theme.spacing.md,
          }}>
            2.1 Account Information
          </h3>
          <p style={{ marginBottom: theme.spacing.md }}>
            When you register, we collect your email address, name, and any other information you provide during registration.
          </p>

          <h3 style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
            marginTop: theme.spacing.md,
          }}>
            2.2 Email Data
          </h3>
          <p style={{ marginBottom: theme.spacing.md }}>
            With your explicit consent, we access and process your emails to provide our services. This includes:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Email content (subject, body, sender, recipient)</li>
            <li>Email metadata (dates, thread information, labels)</li>
            <li>Email attachments (processed temporarily for analysis)</li>
          </ul>

          <h3 style={{
            fontSize: theme.typography.fontSize.lg,
            fontWeight: theme.typography.fontWeight.semibold,
            marginBottom: theme.spacing.sm,
            marginTop: theme.spacing.md,
          }}>
            2.3 Usage Data
          </h3>
          <p style={{ marginBottom: theme.spacing.md }}>
            We collect information about how you interact with our service, including feature usage, preferences, and analytics data through PostHog.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            3. How We Use Your Information
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We use your information to:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Provide, maintain, and improve our email management services</li>
            <li>Prioritize and organize your emails using AI-powered analysis</li>
            <li>Generate email summaries and draft replies</li>
            <li>Personalize your experience based on your usage patterns</li>
            <li>Send you service-related communications</li>
            <li>Detect and prevent fraud or abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            4. Data Security
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We implement industry-standard security measures to protect your data:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li><strong>Encryption:</strong> All sensitive data, including email content, is encrypted at rest using AES-256-GCM encryption</li>
            <li><strong>Secure Transmission:</strong> All data is transmitted over HTTPS/TLS</li>
            <li><strong>Access Controls:</strong> Strict access controls limit who can access your data</li>
            <li><strong>Regular Audits:</strong> We conduct regular security audits and assessments</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            5. Third-Party Services
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We integrate with the following third-party services:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li><strong>Google Gmail API:</strong> To access and manage your emails</li>
            <li><strong>Google Calendar API:</strong> For calendar booking functionality</li>
            <li><strong>OpenAI/Gemini:</strong> For AI-powered email analysis and summaries (you may use your own API keys)</li>
            <li><strong>PostHog:</strong> For analytics and product insights</li>
            <li><strong>RevenueCat:</strong> For subscription management</li>
          </ul>
          <p style={{ marginBottom: theme.spacing.md }}>
            These services have their own privacy policies. We encourage you to review them.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            6. Data Retention
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We retain your data for as long as your account is active or as needed to provide services. You can request deletion of your data at any time by contacting us or deleting your account.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            7. Your Rights
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            You have the right to:
          </p>
          <ul style={{ marginLeft: theme.spacing.xl, marginBottom: theme.spacing.md }}>
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Export your data</li>
            <li>Withdraw consent at any time</li>
            <li>Object to processing of your data</li>
          </ul>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            8. Children's Privacy
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            Our service is not intended for users under the age of 13. We do not knowingly collect information from children under 13.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            9. Changes to This Policy
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            We may update this Privacy Policy from time to time. We will notify you of any material changes by email or through our service. Your continued use after such notification constitutes acceptance of the updated policy.
          </p>
        </section>

        <section style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{
            fontSize: theme.typography.fontSize.xl,
            fontWeight: theme.typography.fontWeight.bold,
            marginBottom: theme.spacing.md,
            marginTop: theme.spacing.lg,
          }}>
            10. Contact Us
          </h2>
          <p style={{ marginBottom: theme.spacing.md }}>
            If you have questions about this Privacy Policy, please contact us at:
          </p>
          <p style={{ marginBottom: theme.spacing.md }}>
            Email: privacy@bearlymail.com<br />
            Made by Focus Bear
          </p>
        </section>
      </div>
    </div>
  );
};

export default PrivacyPolicy;


