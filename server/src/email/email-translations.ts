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
    waitlistConfirmation: {
      subject: "You're on the BearlyMail waitlist",
      greeting: "Hi {{firstName}},",
      message:
        "Thanks for joining the BearlyMail waitlist — your spot is reserved! We're letting people in gradually so everyone gets a calm, focused experience.",
      nextSteps:
        "There's nothing else you need to do. We'll send you an email as soon as a spot opens up.",
      footer: "© {{year}} BearlyMail. All rights reserved.",
    },
    bookingConfirmation: {
      subject: "Booking confirmed: {{title}}",
      greeting: "Hi {{name}},",
      message:
        "Your meeting with {{hostName}} is confirmed. Here are the details:",
      footer: "© {{year}} BearlyMail. All rights reserved.",
    },
    bookingOwnerNotification: {
      subject: "New booking: {{guestName}} booked {{when}}",
      greeting: "Hi {{name}},",
      message:
        "{{guestName}} ({{guestEmail}}) just booked a meeting with you. Here are the details:",
      footer: "© {{year}} BearlyMail. All rights reserved.",
    },
    bookingDetails: {
      title: "Meeting",
      when: "When",
      duration: "Duration",
      durationMinutes: "{{minutes}} minutes",
      additionalGuests: "Additional guests",
      meetLink: "Video call link",
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
    waitlistConfirmation: {
      subject: "Estás en la lista de espera de BearlyMail",
      greeting: "Hola {{firstName}},",
      message:
        "¡Gracias por unirte a la lista de espera de BearlyMail — tu lugar está reservado! Estamos dando acceso gradualmente para que todos tengan una experiencia tranquila y enfocada.",
      nextSteps:
        "No necesitas hacer nada más. Te enviaremos un correo en cuanto se abra un lugar.",
      footer: "© {{year}} BearlyMail. Todos los derechos reservados.",
    },
    bookingConfirmation: {
      subject: "Reserva confirmada: {{title}}",
      greeting: "Hola {{name}},",
      message:
        "Tu reunión con {{hostName}} está confirmada. Aquí están los detalles:",
      footer: "© {{year}} BearlyMail. Todos los derechos reservados.",
    },
    bookingOwnerNotification: {
      subject: "Nueva reserva: {{guestName}} reservó {{when}}",
      greeting: "Hola {{name}},",
      message:
        "{{guestName}} ({{guestEmail}}) acaba de reservar una reunión contigo. Aquí están los detalles:",
      footer: "© {{year}} BearlyMail. Todos los derechos reservados.",
    },
    bookingDetails: {
      title: "Reunión",
      when: "Cuándo",
      duration: "Duración",
      durationMinutes: "{{minutes}} minutos",
      additionalGuests: "Invitados adicionales",
      meetLink: "Enlace de videollamada",
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
