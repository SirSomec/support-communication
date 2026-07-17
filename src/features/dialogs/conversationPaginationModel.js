export const CONVERSATION_PAGE_SIZE = 50;

export function normalizeConversationPagination(pagination, {
  fallbackPage = 1,
  fallbackPageSize = CONVERSATION_PAGE_SIZE,
  loaded = 0
} = {}) {
  const pageSize = positiveInteger(pagination?.pageSize, fallbackPageSize);
  const total = Math.max(0, integer(pagination?.total, loaded));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(positiveInteger(pagination?.page, fallbackPage), pageCount);
  return {
    canNext: page < pageCount,
    canPrevious: page > 1,
    page,
    pageCount,
    pageSize,
    total
  };
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = integer(value, fallback);
  return parsed > 0 ? parsed : fallback;
}
