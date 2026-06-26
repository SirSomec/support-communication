export const operators = [
  { name: "Иван П.", status: "online", chats: 7, limit: 12, avg: "01:18", sla: 96, channels: ["SDK", "Telegram"] },
  { name: "Анна Р.", status: "online", chats: 10, limit: 12, avg: "01:42", sla: 91, channels: ["MAX", "VK"] },
  { name: "Кирилл М.", status: "break", chats: 3, limit: 8, avg: "02:11", sla: 88, channels: ["Telegram"] },
  { name: "Елена С.", status: "online", chats: 5, limit: 10, avg: "01:05", sla: 98, channels: ["SDK"] },
  { name: "Олег Н.", status: "offline", chats: 0, limit: 8, avg: "03:20", sla: 82, channels: ["VK"] }
];

export const queues = [
  { name: "SDK", active: 42, waiting: 8, overdue: 2, limit: 12, health: 82 },
  { name: "Telegram", active: 35, waiting: 11, overdue: 3, limit: 8, health: 74 },
  { name: "MAX", active: 24, waiting: 5, overdue: 1, limit: 8, health: 89 },
  { name: "VK", active: 25, waiting: 9, overdue: 4, limit: 8, health: 68 }
];
