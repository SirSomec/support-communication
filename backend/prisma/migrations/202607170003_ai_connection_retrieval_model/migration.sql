-- BAI-870: dedicated (expensive) retrieval model per AI connection.  Additive:
-- existing connections keep NULL and continue to use lexical retrieval only.
ALTER TABLE "ai_connections" ADD COLUMN "retrieval_model" TEXT;
