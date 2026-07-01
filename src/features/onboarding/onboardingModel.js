import {
  Building2,
  CreditCard,
  Gauge,
  Send,
  UserPlus,
  Users
} from "lucide-react";

export const steps = [
  { id: "tenant", label: "Tenant", icon: Building2 },
  { id: "plan", label: "Тариф / trial", icon: CreditCard },
  { id: "admin", label: "Первый администратор", icon: UserPlus },
  { id: "limits", label: "Лимиты", icon: Gauge },
  { id: "employees", label: "Сотрудники", icon: Users },
  { id: "test", label: "Тестовое сообщение", icon: Send }
];

export const planOptions = [
  {
    id: "Start",
    price: "19 900 ₽",
    description: "Первый канал, базовые шаблоны, очередь и отчеты.",
    limits: "до 5 операторов"
  },
  {
    id: "Growth",
    price: "49 900 ₽",
    description: "Все каналы, SDK, AI-подсказки, SLA и смены.",
    limits: "до 25 операторов"
  },
  {
    id: "Enterprise",
    price: "по договору",
    description: "SSO, расширенный аудит, выделенные лимиты и SLA.",
    limits: "индивидуально"
  }
];

export const employeeRoles = ["Оператор", "Старший оператор", "Администратор", "Аудитор"];

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

export function getCompletion({
  admin,
  employees,
  limits,
  plan,
  tenant,
  test
}) {
  return {
    tenant: tenant.name.trim().length >= 2 && tenant.slug.trim().length >= 3,
    plan: Boolean(plan.id),
    admin: admin.name.trim().length >= 2
      && hasEmailShape(admin.email)
      && String(admin.password ?? "").length >= 8,
    limits: limits.operatorLimit > 0 && limits.concurrentDialogs > 0 && limits.dailyMessages >= 100,
    employees: employees.length > 0,
    test: test.status === "sent"
  };
}
