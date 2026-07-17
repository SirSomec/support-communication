// These suites intentionally live next to their implementations. Import them
// from the canonical tests directory so the repository-wide test command
// discovers and executes them as part of every backend run.
import "../apps/api-gateway/src/ai-connections/openai-compatible-chat.provider.test.ts";
import "../apps/api-gateway/src/knowledge-sources/url-source-config.test.ts";
