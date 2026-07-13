import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  FileClock,
  LayoutDashboard,
  MessageCircle,
  Settings,
  ShieldCheck,
  UsersRound,
  Zap
} from "lucide-react";

export const navigationItems = [
  { key: "dialogs", label: "Диалоги", icon: MessageCircle },
  { key: "panel", label: "Панель", icon: LayoutDashboard },
  { key: "clients", label: "Клиенты", icon: UsersRound },
  { key: "templates", label: "Шаблоны", icon: ClipboardList },
  { key: "visitors", label: "Визиты", icon: Zap },
  { key: "reports", label: "Отчеты", icon: BarChart3 },
  { key: "quality", label: "Качество", icon: ShieldCheck },
  { key: "knowledge", label: "Знания", icon: BookOpen },
  { key: "automation", label: "Боты", icon: Bot },
  { key: "audit", label: "Аудит", icon: FileClock },
  { key: "settings", label: "Настройки", icon: Settings }
];
