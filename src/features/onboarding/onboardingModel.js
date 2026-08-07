import {
  Building2,
  CreditCard,
  FileCheck2,
  Gauge,
  UserPlus
} from "lucide-react";

export const LEGAL_DOCUMENT_VERSION = "draft-2026-08-07";

export const steps = [
  { id: "tenant", label: "Организация", icon: Building2 },
  { id: "plan", label: "Тариф", icon: CreditCard },
  { id: "admin", label: "Администратор", icon: UserPlus },
  { id: "limits", label: "Лимиты", icon: Gauge },
  { id: "legal", label: "Соглашения", icon: FileCheck2 }
];

const allowedOnboardingPlanIds = new Set(["free", "starter", "business", "scale"]);

const featureLabels = Object.freeze({
  "shared-inbox": "Все обращения в одном окне",
  "website-chat": "Чат поддержки на сайте",
  "email-support": "Поддержка по электронной почте",
  "basic-analytics": "Основные показатели работы",
  omnichannel: "Каналы в единой очереди",
  routing: "Маршрутизация обращений",
  sla: "Контроль времени ответа",
  exports: "Выгрузка данных",
  "advanced-automation": "Расширенная автоматизация",
  "quality-ai": "AI-проверка качества",
  "custom-integrations": "Пользовательские интеграции"
});

export const planOptions = Object.freeze([
  {
    id: "free",
    name: "Free",
    billingAvailability: "free",
    priceMonthly: 0,
    includedUsers: 1,
    ownerOnly: true,
    features: ["Один оператор-владелец", "Чат поддержки на сайте", "Базовые инструменты"]
  },
  {
    id: "starter",
    name: "Starter",
    billingAvailability: "paid",
    priceMonthly: 39000,
    includedUsers: 3,
    ownerOnly: false,
    features: ["До 3 сотрудников", "Все обращения в одном окне", "Основные показатели работы"]
  },
  {
    id: "business",
    name: "Business",
    billingAvailability: "paid",
    priceMonthly: 129000,
    includedUsers: 15,
    ownerOnly: false,
    features: ["До 15 сотрудников", "Маршрутизация и SLA", "Выгрузка данных"]
  },
  {
    id: "scale",
    name: "Scale",
    billingAvailability: "paid",
    priceMonthly: 380000,
    includedUsers: 35,
    ownerOnly: false,
    features: ["До 35 сотрудников", "Расширенная автоматизация", "AI-проверка качества"]
  }
]);

export const stepRequirements = {
  tenant: "Укажите название организации, slug и реальный домен сайта для SDK.",
  plan: "Выберите тариф.",
  admin: "Заполните имя, рабочий email и пароль от 8 символов.",
  limits: "Лимиты операторов и диалогов — больше нуля, сообщений в день — от 100.",
  legal: "Примите соглашение, ознакомьтесь с политикой и отдельно дайте согласие на обработку данных."
};

export function hasEmailShape(value) {
  return /\S+@\S+\.\S+/.test(value);
}

export function createSlug(value) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34);

  return slug || `tenant-${Date.now().toString(36).slice(-5)}`;
}

export function getCompletion({ admin, legal, limits, plan, tenant }) {
  return {
    tenant: tenant.name.trim().length >= 2
      && tenant.slug.trim().length >= 3
      && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(tenant.domain ?? "").trim()),
    plan: allowedOnboardingPlanIds.has(normalizePlanId(plan.id)),
    admin: admin.name.trim().length >= 2
      && hasEmailShape(admin.email)
      && String(admin.password ?? "").length >= 8,
    limits: limits.operatorLimit > 0 && limits.concurrentDialogs > 0 && limits.dailyMessages >= 100,
    legal: legal.termsAccepted === true
      && legal.privacyPolicyAcknowledged === true
      && legal.personalDataConsent === true
      && legal.documentVersion === LEGAL_DOCUMENT_VERSION
  };
}

export function createOnboardingPlanOptions(tariffs = []) {
  const normalized = tariffs.flatMap((tariff) => {
    const id = normalizePlanId(tariff?.id);
    if (!allowedOnboardingPlanIds.has(id)) return [];

    return [{
      id,
      name: String(tariff.name ?? id),
      billingAvailability: tariff.billingAvailability === "free" ? "free" : "paid",
      priceMonthly: Number(tariff.priceMonthly ?? 0),
      includedUsers: Math.max(1, Number(tariff.includedUsers ?? 1)),
      ownerOnly: Boolean(tariff.ownerOnly),
      features: (tariff.features ?? []).slice(0, 3).map((feature) => featureLabels[feature] ?? feature)
    }];
  });

  return normalized.length === planOptions.length ? normalized : [...planOptions];
}

export function normalizePlanId(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return allowedOnboardingPlanIds.has(normalized) ? normalized : "free";
}

export function readRequestedOnboardingPlan(hash = globalThis.location?.hash ?? "") {
  const [, route, requestedPlan] = String(hash).split("/");
  return route === "onboarding" ? normalizePlanId(requestedPlan) : "free";
}
