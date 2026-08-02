export function resolveBillingProviderMode(source = process.env) {
    const mode = String(source.BILLING_PROVIDER_MODE ?? "sandbox").trim().toLowerCase();
    return mode === "production" ? "production" : "sandbox";
}
//# sourceMappingURL=billing-provider.port.js.map