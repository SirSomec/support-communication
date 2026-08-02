import type { BillingService } from "../billing/billing.service.js";
import type { FileUploadQuotaChecker } from "./workspace.service.js";
export declare function createBillingFileUploadQuotaChecker(billingService: Pick<BillingService, "checkQuota">): FileUploadQuotaChecker;
