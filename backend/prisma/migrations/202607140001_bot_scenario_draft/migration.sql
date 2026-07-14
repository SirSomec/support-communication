-- BAI-812: черновик изменений опубликованного сценария (next-revision draft).
-- Аддитивно: существующие строки получают NULL (черновика нет).
ALTER TABLE "bot_scenarios" ADD COLUMN "draft" JSONB;
