import { describe, it, expect, beforeEach, vi } from "vitest"
import { CodeIndexRerankingService } from "../reranking-service"
import { IEmbedder } from "../interfaces/embedder"
import { VectorStoreSearchResult } from "../interfaces"

// Mock the telemetry service
vi.mock("@roo-code/telemetry", () => ({
	TelemetryService: {
		instance: {
			captureEvent: vi.fn(),
		},
	},
}))

// Mock embedder
const mockEmbedder: IEmbedder = {
	createEmbeddings: vi.fn(),
	validateConfiguration: vi.fn(),
	embedderInfo: {
		name: "openai",
	},
}

describe("CodeIndexRerankingService", () => {
	let rerankingService: CodeIndexRerankingService

	beforeEach(() => {
		rerankingService = new CodeIndexRerankingService(mockEmbedder)
		vi.clearAllMocks()
	})

	describe("shouldRerank", () => {
		it("should return false for empty results", () => {
			expect(rerankingService.shouldRerank([])).toBe(false)
		})

		it("should return false for single result", () => {
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "function test() {}", filePath: "test.js", startLine: 1, endLine: 3 },
				},
			]
			expect(rerankingService.shouldRerank(results)).toBe(false)
		})

		it("should return true for multiple valid results", () => {
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "function test() {}", filePath: "test.js", startLine: 1, endLine: 3 },
				},
				{
					id: "2",
					score: 0.7,
					payload: { codeChunk: "function hello() {}", filePath: "hello.js", startLine: 1, endLine: 3 },
				},
			]
			expect(rerankingService.shouldRerank(results)).toBe(true)
		})

		it("should return false for results without valid code chunks", () => {
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "", filePath: "test.js", startLine: 1, endLine: 3 },
				},
				{
					id: "2",
					score: 0.7,
					payload: { codeChunk: "", filePath: "hello.js", startLine: 1, endLine: 3 },
				},
			]
			expect(rerankingService.shouldRerank(results)).toBe(false)
		})
	})

	describe("rerankResults", () => {
		it("should return original results if empty", async () => {
			const results: VectorStoreSearchResult[] = []
			const reranked = await rerankingService.rerankResults("query", results)
			expect(reranked).toEqual(results)
			expect(vi.mocked(mockEmbedder.createEmbeddings)).not.toHaveBeenCalled()
		})

		it("should rerank results successfully", async () => {
			const query = "test function"
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: {
						codeChunk: "function test() { return 'hello'; }",
						filePath: "test.js",
						startLine: 1,
						endLine: 3,
					},
				},
				{
					id: "2",
					score: 0.9,
					payload: {
						codeChunk: "function unrelated() { return 'world'; }",
						filePath: "other.js",
						startLine: 1,
						endLine: 3,
					},
				},
			]

			// Mock embeddings - query embedding
			const queryEmbedding = [0.5, 0.8, 0.3]
			// Code embeddings that will make first result more similar to query
			const codeEmbeddings = [
				[0.6, 0.7, 0.4], // More similar to query
				[0.1, 0.2, 0.9], // Less similar to query
			]

			vi.mocked(mockEmbedder.createEmbeddings)
				.mockResolvedValueOnce({ embeddings: [queryEmbedding] })
				.mockResolvedValueOnce({ embeddings: codeEmbeddings })

			const reranked = await rerankingService.rerankResults(query, results, 2)

			expect(vi.mocked(mockEmbedder.createEmbeddings)).toHaveBeenCalledTimes(2)
			expect(vi.mocked(mockEmbedder.createEmbeddings)).toHaveBeenNthCalledWith(1, [query])
			expect(vi.mocked(mockEmbedder.createEmbeddings)).toHaveBeenNthCalledWith(2, [
				"function test() { return 'hello'; }",
				"function unrelated() { return 'world'; }",
			])

			// Results should be reordered by similarity
			expect(reranked).toHaveLength(2)
			expect(reranked[0].id).toBe("1") // First result should be more similar
			expect(reranked[1].id).toBe("2")
			expect(reranked[0].score).toBeGreaterThan(reranked[1].score)
		})

		it("should limit results to topK", async () => {
			const query = "test"
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "code1", filePath: "test1.js", startLine: 1, endLine: 3 },
				},
				{
					id: "2",
					score: 0.7,
					payload: { codeChunk: "code2", filePath: "test2.js", startLine: 1, endLine: 3 },
				},
				{
					id: "3",
					score: 0.6,
					payload: { codeChunk: "code3", filePath: "test3.js", startLine: 1, endLine: 3 },
				},
			]

			vi.mocked(mockEmbedder.createEmbeddings)
				.mockResolvedValueOnce({ embeddings: [[1, 0, 0]] })
				.mockResolvedValueOnce({
					embeddings: [
						[1, 0, 0],
						[0, 1, 0],
						[0, 0, 1],
					],
				})

			const reranked = await rerankingService.rerankResults(query, results, 2)

			expect(reranked).toHaveLength(2)
		})

		it("should handle embedding failures gracefully", async () => {
			const query = "test"
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "code1", filePath: "test1.js", startLine: 1, endLine: 3 },
				},
			]

			vi.mocked(mockEmbedder.createEmbeddings).mockResolvedValueOnce({ embeddings: [] })

			const reranked = await rerankingService.rerankResults(query, results)

			expect(reranked).toEqual(results) // Should return original results
		})

		it("should handle errors gracefully", async () => {
			const query = "test"
			const results: VectorStoreSearchResult[] = [
				{
					id: "1",
					score: 0.8,
					payload: { codeChunk: "code1", filePath: "test1.js", startLine: 1, endLine: 3 },
				},
			]

			vi.mocked(mockEmbedder.createEmbeddings).mockRejectedValueOnce(new Error("Embedding failed"))

			const reranked = await rerankingService.rerankResults(query, results)

			expect(reranked).toEqual(results) // Should return original results
		})
	})
})
