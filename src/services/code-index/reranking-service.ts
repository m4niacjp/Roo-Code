import { VectorStoreSearchResult } from "./interfaces"
import { IEmbedder } from "./interfaces/embedder"
import { TelemetryService } from "@roo-code/telemetry"
import { TelemetryEventName } from "@roo-code/types"

/**
 * Service responsible for reranking search results using embedding-based similarity.
 * This service improves search result relevance by computing fresh embeddings
 * for the query and re-scoring results based on semantic similarity.
 */
export class CodeIndexRerankingService {
	constructor(private readonly embedder: IEmbedder) {}

	/**
	 * Reranks search results using embedding-based similarity scoring.
	 * @param query The original search query
	 * @param results Initial search results from vector store
	 * @param topK Number of top results to return after reranking
	 * @returns Reranked and filtered results
	 */
	public async rerankResults(
		query: string,
		results: VectorStoreSearchResult[],
		topK?: number,
	): Promise<VectorStoreSearchResult[]> {
		if (!results || results.length === 0) {
			return results
		}

		try {
			// Get fresh embedding for the query
			const queryEmbeddingResponse = await this.embedder.createEmbeddings([query])
			const queryVector = queryEmbeddingResponse?.embeddings[0]

			if (!queryVector) {
				console.warn("[CodeIndexRerankingService] Failed to generate query embedding for reranking")
				return results
			}

			// Extract code snippets from results
			const codeSnippets = results
				.map((result) => result.payload?.codeChunk || "")
				.filter((snippet) => snippet.length > 0)

			if (codeSnippets.length === 0) {
				console.warn("[CodeIndexRerankingService] No valid code snippets found for reranking")
				return results
			}

			// Get embeddings for all code snippets
			const codeEmbeddingsResponse = await this.embedder.createEmbeddings(codeSnippets)
			const codeEmbeddings = codeEmbeddingsResponse?.embeddings

			if (!codeEmbeddings || codeEmbeddings.length !== codeSnippets.length) {
				console.warn("[CodeIndexRerankingService] Failed to generate code embeddings for reranking")
				return results
			}

			// Compute fresh similarity scores for each result
			const rerankedResults = results
				.map((result, index) => {
					if (!result.payload?.codeChunk || index >= codeEmbeddings.length) {
						return { ...result, score: 0 } // Keep original result but with low score
					}

					const codeVector = codeEmbeddings[index]
					const similarity = this.cosineSimilarity(queryVector, codeVector)

					return {
						...result,
						score: similarity,
					}
				})
				.sort((a, b) => b.score - a.score) // Sort by descending similarity

			// Return top-K results if specified, otherwise return all reranked results
			const finalResults = topK ? rerankedResults.slice(0, topK) : rerankedResults

			// TODO: Add telemetry event for successful reranking when available
			// TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_SEARCH, {
			//   searchType: "reranked",
			//   originalResultCount: results.length,
			//   rerankedResultCount: finalResults.length,
			//   topKLimit: topK || results.length,
			// })

			return finalResults
		} catch (error) {
			console.error("[CodeIndexRerankingService] Error during reranking:", error)

			// Capture telemetry for the error
			TelemetryService.instance.captureEvent(TelemetryEventName.CODE_INDEX_ERROR, {
				error: (error as Error).message,
				stack: (error as Error).stack,
				location: "rerankResults",
			})

			// Return original results if reranking fails
			return results
		}
	}

	/**
	 * Computes cosine similarity between two vectors.
	 * @param vectorA First vector
	 * @param vectorB Second vector
	 * @returns Cosine similarity score between 0 and 1
	 */
	private cosineSimilarity(vectorA: number[], vectorB: number[]): number {
		if (vectorA.length !== vectorB.length) {
			console.warn(
				`[CodeIndexRerankingService] Vector dimension mismatch: ${vectorA.length} vs ${vectorB.length}`,
			)
			return 0
		}

		let dotProduct = 0
		let magnitudeA = 0
		let magnitudeB = 0

		for (let i = 0; i < vectorA.length; i++) {
			dotProduct += vectorA[i] * vectorB[i]
			magnitudeA += vectorA[i] * vectorA[i]
			magnitudeB += vectorB[i] * vectorB[i]
		}

		magnitudeA = Math.sqrt(magnitudeA)
		magnitudeB = Math.sqrt(magnitudeB)

		if (magnitudeA === 0 || magnitudeB === 0) {
			return 0
		}

		return dotProduct / (magnitudeA * magnitudeB)
	}

	/**
	 * Validates if reranking should be performed based on result set characteristics.
	 * @param results Search results to validate
	 * @returns True if reranking should proceed
	 */
	public shouldRerank(results: VectorStoreSearchResult[]): boolean {
		// Don't rerank if we have fewer than 2 results
		if (!results || results.length < 2) {
			return false
		}

		// Don't rerank if results don't have code chunks
		const validResults = results.filter(
			(result) => result.payload?.codeChunk && result.payload.codeChunk.length > 0,
		)
		return validResults.length >= 2
	}
}
