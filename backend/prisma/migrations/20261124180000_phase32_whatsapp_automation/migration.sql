-- Phase 32: WhatsApp automation (PHASE32_TODO.md §5, A1/A2).
-- PURELY ADDITIVE: new enums, nullable/defaulted columns on Customer, CustomerPhone
-- and Order, four new tables, indexes and foreign keys. No DROP / RENAME / TRUNCATE /
-- DELETE / type change; every existing row and column is preserved. Constant
-- defaults (whatsappConsent NO, isWhatsapp false, preferredLanguage EN) do not
-- rewrite the table on PostgreSQL 11+. Existing customers are moved to consent YES
-- by the separate, audited one-time backfill (A5), NOT by this migration.

-- CreateEnum
CREATE TYPE "MessageLanguage" AS ENUM ('EN', 'HI');

-- CreateEnum
CREATE TYPE "WhatsappConsent" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('STAFF', 'CUSTOMER_STOP_REPLY', 'BACKFILL');

-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('ORDER_CONFIRMATION', 'ORDER_DISPATCHED');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'PROCESSING', 'RETRY_WAIT', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'UNKNOWN', 'SKIPPED');

-- CreateEnum
CREATE TYPE "MessageErrorKind" AS ENUM ('TEMPORARY', 'PERMANENT', 'CONFIGURATION', 'AMBIGUOUS');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "preferredLanguage" "MessageLanguage" NOT NULL DEFAULT 'EN',
ADD COLUMN     "whatsappConsent" "WhatsappConsent" NOT NULL DEFAULT 'NO',
ADD COLUMN     "whatsappConsentAt" TIMESTAMP(3),
ADD COLUMN     "whatsappConsentById" INTEGER,
ADD COLUMN     "whatsappConsentSource" "ConsentSource";

-- AlterTable
ALTER TABLE "CustomerPhone" ADD COLUMN     "isWhatsapp" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "OutboundMessage" (
    "id" SERIAL NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL DEFAULT 'WHATSAPP',
    "type" "MessageType" NOT NULL,
    "orderId" INTEGER,
    "customerId" INTEGER NOT NULL,
    "resendOfId" INTEGER,
    "resendReason" TEXT,
    "requestKey" TEXT,
    "toPhone" TEXT,
    "toPhoneId" INTEGER,
    "language" "MessageLanguage" NOT NULL,
    "fallbackFromLanguage" "MessageLanguage",
    "templateName" TEXT,
    "params" JSONB,
    "snapshot" JSONB,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "skipReason" TEXT,
    "errorKind" "MessageErrorKind",
    "errorCode" TEXT,
    "lastError" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "claimToken" TEXT,
    "sendStartedAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "triggeredById" INTEGER,
    "resolvedById" INTEGER,
    "lateResponseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageStatusEvent" (
    "id" SERIAL NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerTimestamp" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "raw" JSONB NOT NULL,
    "messageId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingState" (
    "id" INTEGER NOT NULL,
    "pausedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "pausedBy" TEXT,
    "rateLimitedUntil" TIMESTAMP(3),
    "goLiveAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageTemplateStatus" (
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageTemplateStatus_pkey" PRIMARY KEY ("name","language")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_eventKey_key" ON "OutboundMessage"("eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_requestKey_key" ON "OutboundMessage"("requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundMessage_providerMessageId_key" ON "OutboundMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_nextAttemptAt_idx" ON "OutboundMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "OutboundMessage_status_lockedUntil_idx" ON "OutboundMessage"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "OutboundMessage_orderId_type_idx" ON "OutboundMessage"("orderId", "type");

-- CreateIndex
CREATE INDEX "OutboundMessage_customerId_idx" ON "OutboundMessage"("customerId");

-- CreateIndex
CREATE INDEX "OutboundMessage_resendOfId_idx" ON "OutboundMessage"("resendOfId");

-- CreateIndex
CREATE INDEX "OutboundMessage_triggeredById_idx" ON "OutboundMessage"("triggeredById");

-- CreateIndex
CREATE INDEX "OutboundMessage_resolvedById_idx" ON "OutboundMessage"("resolvedById");

-- CreateIndex
CREATE INDEX "MessageStatusEvent_messageId_idx" ON "MessageStatusEvent"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageStatusEvent_providerMessageId_status_key" ON "MessageStatusEvent"("providerMessageId", "status");

-- CreateIndex
CREATE INDEX "Customer_whatsappConsentById_idx" ON "Customer"("whatsappConsentById");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerPhone_one_whatsapp_per_customer" ON "CustomerPhone"("customerId") WHERE ("isWhatsapp" = true);

-- CreateIndex
CREATE UNIQUE INDEX "Order_idempotencyKey_key" ON "Order"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_whatsappConsentById_fkey" FOREIGN KEY ("whatsappConsentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_resendOfId_fkey" FOREIGN KEY ("resendOfId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundMessage" ADD CONSTRAINT "OutboundMessage_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageStatusEvent" ADD CONSTRAINT "MessageStatusEvent_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutboundMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

