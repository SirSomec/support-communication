import {
  BarChart3,
  Bot,
  ClipboardList,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  Zap,
  UsersRound
} from "lucide-react";

export const navItems = [
  { key: "dialogs", label: "Диалоги", icon: MessageCircle },
  { key: "panel", label: "Панель", icon: LayoutDashboard },
  { key: "clients", label: "Клиенты", icon: UsersRound },
  { key: "templates", label: "Шаблоны", icon: ClipboardList },
  { key: "visitors", label: "Визиты", icon: Zap },
  { key: "reports", label: "Отчеты", icon: BarChart3 },
  { key: "quality", label: "Качество", icon: ShieldCheck },
  { key: "automation", label: "Боты", icon: Bot },
  { key: "settings", label: "Настройки", icon: Settings }
];
