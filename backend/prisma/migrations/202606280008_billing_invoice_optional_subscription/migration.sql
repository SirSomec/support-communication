-- DropForeignKey
ALTER TABLE "billing_invoices" DROP CONSTRAINT "billing_invoices_subscription_id_fkey";

-- AlterTable
ALTER TABLE "billing_invoices" ALTER COLUMN "subscription_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
