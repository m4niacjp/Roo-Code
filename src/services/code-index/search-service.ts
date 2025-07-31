import * as path from "path"
import { VectorStoreSearchResult } from "./interfaces"
import { IEmbedder } from "./interfaces/embedder"
import { IVectorStore } from "./interfaces/vector-store"
import { CodeIndexConfigManager } from "./config-manager"
import { CodeIndexStateManager } from "./state-manager"
import { CodeIndexRerankingService } from "./reranking-service"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

/**
 * Service responsible for searching the code index.
 */
export class CodeIndexSearchService {
	private readonly rerankingService: CodeIndexRerankingService

	constructor(
		private readonly configManager: CodeIndexConfigManager,
		private readonly stateManager: CodeIndexStateManager,
		private readonly embedder: IEmbedder,
		private readonly vectorStore: IVectorStore,
	) {
		this.rerankingService = new CodeIndexRerankingService(this.embedder)
	}

	/**
	 * Searches the code index for relevant content.
	 * @param query The search query
	 * @param limit Maximum number of results to return
	 * @param directoryPrefix Optional directory path to filter results by
	 * @returns Array of search results
	 * @throws Error if the service is not properly configured or ready
	 */
	public async searchIndex(query: string, directoryPrefix?: string): Promise<VectorStoreSearchResult[]> {
		if (!this.configManager.isFeatureEnabled || !this.configManager.isFeatureConfigured) {
			throw new Error("Code index feature is disabled or not configured.")
		}

		const minScore = this.configManager.currentSearchMinScore
		const maxResults = this.configManager.currentSearchMaxResults
		const rerankingEnabled = this.configManager.currentRerankingEnabled
		const rerankingTopK = this.configManager.currentRerankingTopK
		const rerankingInitialResults = this.configManager.currentRerankingInitialResults

		const currentState = this.stateManager.getCurrentStatus().systemStatus
		if (currentState !== "Indexed" && currentState !== "Indexing") {
			// Allow search during Indexing too
			throw new Error(`Code index is not ready for search. Current state: ${currentState}`)
		}

		try {
			// Generate embedding for query
			const embeddingResponse = await this.embedder.createEmbeddings([query])
			const vector = embeddingResponse?.embeddings[0]
			if (!vector) {
				throw new Error("Failed to generate embedding for query.")
			}

			// Handle directory prefix
			let normalizedPrefix: string | undefined = undefined
			if (directoryPrefix) {
				normalizedPrefix = path.normalize(directoryPrefix)
			}

			// Determine how many initial results to retrieve
			const initialResultLimit = rerankingEnabled ? Math.max(rerankingInitialResults, rerankingTopK) : maxResults

			// Perform initial search
			const initialResults = await this.vectorStore.search(vector, normalizedPrefix, minScore, initialResultLimit)

			// Apply reranking if enabled and conditions are met
			if (rerankingEnabled && this.rerankingService.shouldRerank(initialResults)) {
				console.log(`[CodeIndexSearchService] Applying reranking to ${initialResults.length} results`)
				const rerankedResults = await this.rerankingService.rerankResults(query, initialResults, rerankingTopK)
				return rerankedResults
			}

			// Return original results (potentially limited to maxResults for consistency)
			return initialResults.slice(0, maxResults)
		} catch (error) {
			console.error("[CodeIndexSearchService] Error during search:", error)
			this.stateManager.setSystemState("Error", `Search failed: ${(error as Error).message}`)

			// Capture telemetry for the error
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: (error as Error).message,
				stack: (error as Error).stack,
				location: "searchIndex",
			})

			throw error // Re-throw the error after setting state
		}
	}
}
