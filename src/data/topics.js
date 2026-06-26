export const topicDirectorySeed = [
  {
    id: "delivery",
    name: "Доставка",
    owner: "Операции",
    description: "Вопросы статуса заказа, адреса и взаимодействия с курьером.",
    branches: [
      {
        id: "delivery-order",
        name: "Заказ",
        children: [
          {
            id: "delivery-status",
            name: "Статус заказа",
            channels: ["SDK", "Telegram"],
            required: true,
            archived: false,
            routing: "1-я линия",
            access: "Редактирует администратор"
          },
          {
            id: "delivery-address",
            name: "Адрес доставки",
            channels: ["SDK", "MAX"],
            required: true,
            archived: false,
            routing: "Операции",
            access: "Редактирует администратор"
          }
        ]
      },
      {
        id: "delivery-courier",
        name: "Курьер",
        children: [
          {
            id: "delivery-courier-contact",
            name: "Связь с курьером",
            channels: ["Telegram", "VK"],
            required: false,
            archived: false,
            routing: "Старший сотрудник",
            access: "Просмотр старшему сотруднику"
          }
        ]
      }
    ]
  },
  {
    id: "payment",
    name: "Оплата",
    owner: "Финансы",
    description: "Возвраты, списания, промокоды и сверка платежей.",
    branches: [
      {
        id: "payment-refunds",
        name: "Возвраты",
        children: [
          {
            id: "payment-refund-status",
            name: "Возврат",
            channels: ["SDK", "VK"],
            required: true,
            archived: false,
            routing: "Финансовая очередь",
            access: "Редактирует администратор"
          },
          {
            id: "payment-card-change",
            name: "Смена карты",
            channels: ["SDK"],
            required: false,
            archived: true,
            routing: "Финансовая очередь",
            access: "Архив виден только в настройках"
          }
        ]
      }
    ]
  },
  {
    id: "account",
    name: "Авторизация",
    owner: "Антифрод",
    description: "Коды входа, восстановление доступа и проверка личности.",
    branches: [
      {
        id: "account-login",
        name: "Вход",
        children: [
          {
            id: "account-code",
            name: "Код",
            channels: ["MAX", "VK"],
            required: true,
            archived: false,
            routing: "Антифрод",
            access: "Редактирует администратор"
          },
          {
            id: "account-identity",
            name: "Проверка личности",
            channels: ["SDK", "Telegram", "MAX"],
            required: true,
            archived: false,
            routing: "Старший сотрудник",
            access: "Просмотр старшему сотруднику"
          }
        ]
      }
    ]
  },
  {
    id: "product",
    name: "Товар",
    owner: "Каталог",
    description: "Несоответствие описанию, комплектация и качество товара.",
    branches: [
      {
        id: "product-quality",
        name: "Качество",
        children: [
          {
            id: "product-mismatch",
            name: "Несоответствие",
            channels: ["Telegram", "VK"],
            required: true,
            archived: false,
            routing: "Каталог",
            access: "Редактирует администратор"
          }
        ]
      }
    ]
  }
];

export const topicOptions = topicDirectorySeed.flatMap((group) =>
  group.branches.flatMap((branch) =>
    branch.children.filter((topic) => !topic.archived).map((topic) => `${group.name} / ${topic.name}`)
  )
);
