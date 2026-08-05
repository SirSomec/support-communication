export interface YooKassaCheckoutRequest {
  amountKopeks: number;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface YooKassaCheckoutResult {
  paymentId: string;
  redirectUrl: string;
}

export interface YooKassaPayment {
  amountKopeks: number;
  createdAt: string;
  currency: string;
  metadata: Record<string, string>;
  paymentId: string;
  paymentMethodId: string | null;
  paymentMethodSaved: boolean;
  status: "canceled" | "pending" | "succeeded" | "waiting_for_capture";
}

export interface YooKassaPaymentProvider {
  chargeSavedMethod(request: YooKassaRecurringChargeRequest): Promise<{ paymentId: string }>;
  createCheckout(request: YooKassaCheckoutRequest): Promise<YooKassaCheckoutResult>;
  fetchPayment(paymentId: string): Promise<YooKassaPayment>;
  isEnabled(): boolean;
}

export interface YooKassaRecurringChargeRequest {
  amountKopeks: number;
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
  paymentMethodId: string;
}

export class YooKassaCheckoutUnavailableError extends Error {
  constructor(message = "YooKassa checkout is not configured.") {
    super(message);
    this.name = "YooKassaCheckoutUnavailableError";
  }
}

interface YooKassaProviderOptions {
  fetcher?: typeof fetch;
  mode?: string;
  returnUrl?: string;
  secretKey?: string;
  shopId?: string;
}

interface YooKassaApiPayment {
  amount?: { currency?: string; value?: string };
  confirmation?: {
    confirmation_url?: string;
    type?: string;
  };
  created_at?: string;
  id?: string;
  metadata?: Record<string, unknown>;
  payment_method?: { id?: string; saved?: boolean };
  status?: string;
}

const YOOKASSA_PAYMENTS_URL = "https://api.yookassa.ru/v3/payments";

export function createYooKassaPaymentProvider(options: YooKassaProviderOptions = {}): YooKassaPaymentProvider {
  const mode = options.mode ?? process.env.BILLING_CHECKOUT_PROVIDER_MODE;
  const shopId = options.shopId ?? process.env.YOOKASSA_SHOP_ID;
  const secretKey = options.secretKey ?? process.env.YOOKASSA_SECRET_KEY;
  const returnUrl = options.returnUrl ?? process.env.YOOKASSA_RETURN_URL;
  const fetcher = options.fetcher ?? fetch;
  const enabled = mode === "yookassa" && Boolean(shopId && secretKey && returnUrl);

  return {
    isEnabled: () => enabled,
    async createCheckout(request) {
      if (!enabled || !shopId || !secretKey || !returnUrl) {
        throw new YooKassaCheckoutUnavailableError();
      }
      if (!Number.isSafeInteger(request.amountKopeks) || request.amountKopeks <= 0) {
        throw new Error("YooKassa checkout amount must be a positive integer in kopeks.");
      }
      if (!request.idempotencyKey.trim()) {
        throw new Error("YooKassa checkout requires an idempotency key.");
      }

      const response = await fetcher(YOOKASSA_PAYMENTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`,
          "Content-Type": "application/json",
          "Idempotence-Key": request.idempotencyKey
        },
        body: JSON.stringify({
          amount: { currency: "RUB", value: (request.amountKopeks / 100).toFixed(2) },
          capture: true,
          confirmation: { return_url: returnUrl, type: "redirect" },
          description: request.description,
          metadata: request.metadata,
          save_payment_method: true
        })
      });
      const payment = await readPaymentResponse(response);
      if (!response.ok) {
        throw new Error(`YooKassa payment creation failed with status ${response.status}.`);
      }
      const paymentId = String(payment.id ?? "").trim();
      const redirectUrl = String(payment.confirmation?.confirmation_url ?? "").trim();
      if (!paymentId || payment.confirmation?.type !== "redirect" || !isHttpsUrl(redirectUrl)) {
        throw new Error("YooKassa returned an invalid checkout confirmation.");
      }
      return { paymentId, redirectUrl };
    },
    async chargeSavedMethod(request) {
      if (!enabled || !shopId || !secretKey) throw new YooKassaCheckoutUnavailableError();
      if (!Number.isSafeInteger(request.amountKopeks) || request.amountKopeks <= 0 || !request.paymentMethodId.trim() || !request.idempotencyKey.trim()) throw new Error("Invalid YooKassa recurring payment request.");
      const response = await fetcher(YOOKASSA_PAYMENTS_URL, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}`, "Content-Type": "application/json", "Idempotence-Key": request.idempotencyKey },
        body: JSON.stringify({ amount: { currency: "RUB", value: (request.amountKopeks / 100).toFixed(2) }, capture: true, description: request.description, metadata: request.metadata, payment_method_id: request.paymentMethodId })
      });
      const payment = await readPaymentResponse(response);
      if (!response.ok || !String(payment.id ?? "").trim()) throw new Error(`YooKassa recurring payment creation failed with status ${response.status}.`);
      return { paymentId: String(payment.id).trim() };
    },
    async fetchPayment(paymentId) {
      if (!enabled || !shopId || !secretKey) {
        throw new YooKassaCheckoutUnavailableError();
      }
      const normalizedPaymentId = paymentId.trim();
      if (!normalizedPaymentId) {
        throw new Error("YooKassa payment id is required.");
      }
      const response = await fetcher(`${YOOKASSA_PAYMENTS_URL}/${encodeURIComponent(normalizedPaymentId)}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${shopId}:${secretKey}`).toString("base64")}` }
      });
      const payment = await readPaymentResponse(response);
      if (!response.ok) {
        throw new Error(`YooKassa payment lookup failed with status ${response.status}.`);
      }
      const amountKopeks = rubToKopeks(payment.amount?.value);
      const status = normalizePaymentStatus(payment.status);
      const returnedPaymentId = String(payment.id ?? "").trim();
      const createdAt = normalizeIsoDate(payment.created_at);
      if (!returnedPaymentId || amountKopeks === undefined || !status || !createdAt) {
        throw new Error("YooKassa returned an invalid payment.");
      }
      return {
        amountKopeks,
        createdAt,
        currency: String(payment.amount?.currency ?? "").trim().toUpperCase(),
        metadata: Object.fromEntries(Object.entries(payment.metadata ?? {}).filter(([, value]) => typeof value === "string")) as Record<string, string>,
        paymentId: returnedPaymentId,
        paymentMethodId: String(payment.payment_method?.id ?? "").trim() || null,
        paymentMethodSaved: payment.payment_method?.saved === true,
        status
      };
    }
  };
}

async function readPaymentResponse(response: Response): Promise<YooKassaApiPayment> {
  try {
    return await response.json() as YooKassaApiPayment;
  } catch {
    return {};
  }
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function rubToKopeks(value: string | undefined): number | undefined {
  if (!value || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined;
  const [rub, fraction = ""] = value.split(".");
  const kopeks = Number(rub) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(kopeks) ? kopeks : undefined;
}

function normalizePaymentStatus(value: string | undefined): YooKassaPayment["status"] | undefined {
  return value === "canceled" || value === "pending" || value === "succeeded" || value === "waiting_for_capture" ? value : undefined;
}

function normalizeIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}
