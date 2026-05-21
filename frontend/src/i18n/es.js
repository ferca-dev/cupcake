// Spanish string bundle. Keep this catalogue aligned key-for-key with `en.js`.
// Spanish is the project's primary additional locale; missing keys fall back
// to the English bundle via the helper in `src/i18n/index.js`.

export default {
  app: {
    tagline: 'Plataforma de encuestas y formularios para equipos modernos',
    poweredBy: 'Tecnología de',
  },
  common: {
    loading: 'Cargando…',
    save: 'Guardar',
    cancel: 'Cancelar',
    confirm: 'Confirmar',
    close: 'Cerrar',
    submit: 'Enviar',
    back: 'Atrás',
    next: 'Siguiente',
    required: 'Obligatorio',
    optional: 'Opcional',
    yes: 'Sí',
    no: 'No',
    search: 'Buscar',
    actions: 'Acciones',
    empty: 'No hay datos todavía.',
    error: 'Algo salió mal.',
  },
  auth: {
    login: {
      title: 'Inicia sesión en {appName}',
      subtitle: 'Bienvenido de nuevo. Ingresa tus credenciales para continuar.',
      emailLabel: 'Correo electrónico',
      passwordLabel: 'Contraseña',
      submit: 'Iniciar sesión',
      noAccount: '¿Necesitas una cuenta?',
      registerCta: 'Créala aquí',
      forgotCta: '¿Olvidaste tu contraseña?',
    },
    register: {
      title: 'Crea tu espacio en {appName}',
      subtitle: 'Regístrate para empezar a recolectar respuestas en minutos.',
      nameLabel: 'Tu nombre',
      tenantNameLabel: 'Nombre del espacio',
      emailLabel: 'Correo electrónico',
      passwordLabel: 'Contraseña',
      submit: 'Crear cuenta',
      hasAccount: '¿Ya tienes una cuenta?',
      loginCta: 'Inicia sesión',
      passwordHint: 'Usa al menos 8 caracteres.',
    },
    forgot: {
      title: 'Recupera tu cuenta',
      subtitle: 'Ingresa tu correo y te enviaremos instrucciones para restablecer tu contraseña.',
      emailLabel: 'Correo electrónico',
      submit: 'Enviar instrucciones',
      backToLogin: 'Volver al inicio de sesión',
      successHint:
        'Si existe una cuenta con ese correo, recibirás un mensaje con los próximos pasos.',
    },
    errors: {
      generic: 'No pudimos completar la solicitud. Intenta de nuevo.',
      invalidCredentials: 'Correo o contraseña inválidos.',
      networkError: 'No pudimos contactar al servidor. Verifica tu conexión.',
      sessionExpired: 'Tu sesión expiró. Inicia sesión nuevamente.',
    },
  },
  dashboard: {
    welcome: 'Hola, {name}',
    summary: 'Has iniciado sesión como {role} en {tenant}.',
    placeholder:
      'Este es el panel base. Los módulos (encuestas, contactos, campañas, analíticas) se integrarán en fases posteriores.',
    logout: 'Cerrar sesión',
  },
  layout: {
    skipToContent: 'Saltar al contenido principal',
  },
  notFound: {
    title: 'Página no encontrada',
    subtitle: 'La página que buscas no existe o fue movida.',
    backHome: 'Ir al inicio',
  },
  validation: {
    required: 'Este campo es obligatorio.',
    email: 'Ingresa un correo electrónico válido.',
    minLength: 'Debe tener al menos {min} caracteres.',
    maxLength: 'Debe tener máximo {max} caracteres.',
    slug: 'Solo se permiten letras minúsculas, números y guiones.',
  },
};
