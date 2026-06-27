export const authModes = {
  login: {
    title: "Вход в рабочее пространство",
    description: "Email, пароль и дальнейшая проверка 2FA или выбор организации."
  },
  sso: {
    title: "SSO вход",
    description: "Выберите провайдера и домен организации для SAML/OIDC входа."
  },
  twoFactor: {
    title: "Двухфакторная проверка",
    description: "Введите 6-значный код из приложения или резервного канала."
  },
  recovery: {
    title: "Восстановление доступа",
    description: "Отправим ссылку для сброса пароля и отметим событие в audit."
  },
  invite: {
    title: "Активация приглашения",
    description: "Подтвердите invite code и email, чтобы войти в организацию."
  },
  organizationSelect: {
    title: "Выбор организации",
    description: "Для multi-tenant аккаунта нужно выбрать tenant перед входом."
  },
  blocked: {
    title: "Аккаунт заблокирован",
    description: "Доступ остановлен политикой безопасности или администратором."
  },
  expired: {
    title: "Приглашение истекло",
    description: "Invite token больше не действует. Можно запросить новый или начать onboarding."
  },
  maintenance: {
    title: "Плановое обслуживание",
    description: "Вход временно ограничен, чтобы не открыть рабочий контур в нестабильном состоянии."
  }
};

export const organizationOptions = [
  {
    id: "north-retail",
    name: "North Retail",
    role: "Администратор",
    tariff: "Growth",
    lastLogin: "сегодня, 10:24",
    status: "SLA 99.9%"
  },
  {
    id: "city-care",
    name: "City Care",
    role: "Старший оператор",
    tariff: "Start",
    lastLogin: "вчера, 18:05",
    status: "trial 5 дней"
  },
  {
    id: "internal-support",
    name: "Internal Support",
    role: "Аудитор",
    tariff: "Enterprise",
    lastLogin: "21 июня, 09:10",
    status: "SSO required"
  }
];

export const ssoProviders = ["Google Workspace", "Microsoft Entra ID", "Okta", "SAML"];
export const validModes = new Set(Object.keys(authModes));

export function getInitialMode(mode) {
  return validModes.has(mode) ? mode : "login";
}

export function hasEmailShape(value) {
  return /\S+@\S+\.\S+/.test(value);
}

export function normalizeCode(value) {
  return value.replace(/\D/g, "").slice(0, 6);
}
