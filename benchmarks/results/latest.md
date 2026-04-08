# Hipp0 Decision Memory Benchmark Results

Run: 2026-04-08

## Retrieval Accuracy

| Metric | Hipp0 5-Signal | Naive RAG | Delta |
|--------|---------------|-----------|-------|
| Recall@5 | 69% | 34% | +35% |
| Recall@10 | 93% | 46% | +47% |
| Precision@5 | 71% | 35% | +36% |
| MRR | 0.95 | 0.78 | +0.17 |

## Contradiction Detection

| Metric | Score |
|--------|-------|
| Precision | 1.00 |
| Recall | 0.85 |
| F1 | 0.92 |

## Role Differentiation

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Differentiation Score | 93% | 0% | +93% |
| Avg Overlap@5 | 2.4 | 5.0 | -2.6 |

## Token Efficiency

| Decisions | Full JSON | H0C | Ratio |
|-----------|-----------|-----|-------|
| 5 | 590 | 46 | 12.8x |
| 10 | 1,172 | 90 | 13.0x |
| 15 | 1,749 | 133 | 13.2x |
| 20 | 2,313 | 174 | 13.3x |
| 25 | 2,903 | 217 | 13.4x |
| 30 | 3,477 | 260 | 13.4x |
| 40 | 4,617 | 339 | 13.6x |
| 50 | 5,757 | 426 | 13.5x |

Average: 13.3x | Median: 13.4x | Range: 12.8x – 13.6x

## Compile Latency

| Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision (ms) |
|-----------|----------|----------|----------|--------------------|
| 5 | 0.22 | 1.79 | 1.79 | 0.044 |
| 10 | 0.56 | 1.38 | 1.38 | 0.056 |
| 25 | 1.03 | 2.50 | 2.50 | 0.041 |
| 50 | 1.64 | 1.98 | 1.98 | 0.033 |
| 100 | 3.30 | 3.79 | 3.79 | 0.033 |
| 200 | 6.59 | 8.92 | 8.92 | 0.033 |
| 500 | 21.68 | 34.12 | 34.12 | 0.043 |

Overall: Avg 5.94ms | P95 30.44ms | Per-decision 0.04ms
