// Email translations for server-side email rendering
export const emailTranslations = {
  en: {
    waitlistApproval: {
      subject: "Welcome to BearlyMail - Set Up Your Account",
      greeting: "Welcome to BearlyMail, {{firstName}}!",
      message:
        "Great news! Your waitlist application has been approved. You're now ready to set up your BearlyMail account.",
      cta: "Click the button below to create your password and get started:",
      button: "Set Up Your Account",
      linkText: "Or copy and paste this link into your browser:",
      expiry:
        "This link will expire in 7 days. If you didn't request this, please ignore this email.",
      footer: "© {{year}} BearlyMail. All rights reserved.",
    },
    passwordReset: {
      subject: "Reset Your BearlyMail Password",
      greeting: "Hi {{firstName}},",
      message:
        "We received a request to reset the password for your BearlyMail account. Click the button below to choose a new password.",
      cta: "This link will expire in 10 minutes.",
      button: "Reset Password",
      linkText: "Or copy and paste this link into your browser:",
      expiry:
        "If you didn't request a password reset, you can safely ignore this email. Your password will not change.",
      footer: "© {{year}} BearlyMail. All rights reserved.",
    },
  },
  es: {
    waitlistApproval: {
      subject: "Bienvenido a BearlyMail - Configura tu cuenta",
      greeting: "¡Bienvenido a BearlyMail, {{firstName}}!",
      message:
        "¡Buenas noticias! Tu solicitud en la lista de espera ha sido aprobada. Ya estás listo para configurar tu cuenta de BearlyMail.",
      cta: "Haz clic en el botón de abajo para crear tu contraseña y comenzar:",
      button: "Configurar tu cuenta",
      linkText: "O copia y pega este enlace en tu navegador:",
      expiry:
        "Este enlace expirará en 7 días. Si no solicitaste esto, por favor ignora este correo electrónico.",
      footer: "© {{year}} BearlyMail. Todos los derechos reservados.",
    },
    passwordReset: {
      subject: "Restablecer tu contraseña de BearlyMail",
      greeting: "Hola {{firstName}},",
      message:
        "Recibimos una solicitud para restablecer la contraseña de tu cuenta de BearlyMail. Haz clic en el botón de abajo para elegir una nueva contraseña.",
      cta: "Este enlace expirará en 10 minutos.",
      button: "Restablecer contraseña",
      linkText: "O copia y pega este enlace en tu navegador:",
      expiry:
        "Si no solicitaste un restablecimiento de contraseña, puedes ignorar este correo electrónico con seguridad. Tu contraseña no cambiará.",
      footer: "© {{year}} BearlyMail. Todos los derechos reservados.",
    },
  },
};

export function translateEmail(
  key: string,
  lang: string = "en",
  params: Record<string, string> = {},
): string {
  const keys = key.split(".");
  let translation: Record<string, unknown> | string =
    emailTranslations[lang as keyof typeof emailTranslations] ||
    emailTranslations.en;

  for (const key of keys) {
    // nosemgrep
    translation = translation?.[key];
    if (!translation) {
      // Fallback to English
      translation = emailTranslations.en;
      for (const k2 of keys) {
        // nosemgrep
        translation = translation?.[k2];
      }
      break;
    }
  }

  if (typeof translation !== "string") {
    return key;
  }

  // Replace placeholders
  return translation.replace(
    /\{\{(\w+)\}\}/g,
    (match, paramKey) => params[paramKey] || match,
  );
}
