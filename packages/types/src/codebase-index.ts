import { z } from "zod"

/**
 * Codebase Index Constants
 */
export const CODEBASE_INDEX_DEFAULTS = {
	MIN_SEARCH_RESULTS: 10,
	MAX_SEARCH_RESULTS: 200,
	DEFAULT_SEARCH_RESULTS: 50,
	SEARCH_RESULTS_STEP: 10,
	MIN_SEARCH_SCORE: 0,
	MAX_SEARCH_SCORE: 1,
	DEFAULT_SEARCH_MIN_SCORE: 0.4,
	SEARCH_SCORE_STEP: 0.05,
	// Reranking defaults
	DEFAULT_RERANKING_ENABLED: false,
	DEFAULT_RERANKING_TOP_K: 10,
	DEFAULT_RERANKING_INITIAL_RESULTS: 50,
	MIN_RERANKING_TOP_K: 5,
	MAX_RERANKING_TOP_K: 100,
	MIN_RERANKING_INITIAL_RESULTS: 20,
	MAX_RERANKING_INITIAL_RESULTS: 200,
} as const

/**
 * CodebaseIndexConfig
 */

export const codebaseIndexConfigSchema = z.object({
	codebaseIndexEnabled: z.boolean().optional(),
	codebaseIndexQdrantUrl: z.string().optional(),
	codebaseIndexEmbedderProvider: z.enum(["openai", "ollama", "openai-compatible", "gemini", "mistral"]).optional(),
	codebaseIndexEmbedderBaseUrl: z.string().optional(),
	codebaseIndexEmbedderModelId: z.string().optional(),
	codebaseIndexEmbedderModelDimension: z.number().optional(),
	codebaseIndexSearchMinScore: z.number().min(0).max(1).optional(),
	codebaseIndexSearchMaxResults: z
		.number()
		.min(CODEBASE_INDEX_DEFAULTS.MIN_SEARCH_RESULTS)
		.max(CODEBASE_INDEX_DEFAULTS.MAX_SEARCH_RESULTS)
		.optional(),
	// Reranking configuration
	codebaseIndexRerankingEnabled: z.boolean().optional(),
	codebaseIndexRerankingTopK: z
		.number()
		.min(CODEBASE_INDEX_DEFAULTS.MIN_RERANKING_TOP_K)
		.max(CODEBASE_INDEX_DEFAULTS.MAX_RERANKING_TOP_K)
		.optional(),
	codebaseIndexRerankingInitialResults: z
		.number()
		.min(CODEBASE_INDEX_DEFAULTS.MIN_RERANKING_INITIAL_RESULTS)
		.max(CODEBASE_INDEX_DEFAULTS.MAX_RERANKING_INITIAL_RESULTS)
		.optional(),
	// OpenAI Compatible specific fields
	codebaseIndexOpenAiCompatibleBaseUrl: z.string().optional(),
	codebaseIndexOpenAiCompatibleModelDimension: z.number().optional(),
})

export type CodebaseIndexConfig = z.infer<typeof codebaseIndexConfigSchema>

/**
 * CodebaseIndexModels
 */

export const codebaseIndexModelsSchema = z.object({
	openai: z.record(z.string(), z.object({ dimension: z.number() })).optional(),
	ollama: z.record(z.string(), z.object({ dimension: z.number() })).optional(),
	"openai-compatible": z.record(z.string(), z.object({ dimension: z.number() })).optional(),
	gemini: z.record(z.string(), z.object({ dimension: z.number() })).optional(),
	mistral: z.record(z.string(), z.object({ dimension: z.number() })).optional(),
})

export type CodebaseIndexModels = z.infer<typeof codebaseIndexModelsSchema>

/**
 * CdebaseIndexProvider
 */

export const codebaseIndexProviderSchema = z.object({
	codeIndexOpenAiKey: z.string().optional(),
	codeIndexQdrantApiKey: z.string().optional(),
	codebaseIndexOpenAiCompatibleBaseUrl: z.string().optional(),
	codebaseIndexOpenAiCompatibleApiKey: z.string().optional(),
	codebaseIndexOpenAiCompatibleModelDimension: z.number().optional(),
	codebaseIndexGeminiApiKey: z.string().optional(),
	codebaseIndexMistralApiKey: z.string().optional(),
})

export type CodebaseIndexProvider = z.infer<typeof codebaseIndexProviderSchema>
