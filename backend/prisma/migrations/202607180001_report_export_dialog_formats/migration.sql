-- Выгрузка диалогов с перепиской добавляет форматы HTML, JSON и TXT к заданиям
-- экспорта отчётов; расширяем check-констрейнт допустимых форматов.
ALTER TABLE "report_export_jobs" DROP CONSTRAINT "report_export_jobs_format_check";
ALTER TABLE "report_export_jobs"
  ADD CONSTRAINT "report_export_jobs_format_check"
  CHECK ("format" IN ('CSV', 'HTML', 'JSON', 'PDF', 'TXT', 'XLSX'));
