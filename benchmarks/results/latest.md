# Hipp0 Decision Memory Benchmark Results

Run: 2026-04-08

## Retrieval Accuracy

| Metric | Hipp0 5-Signal | Naive RAG | Delta |
|--------|---------------|-----------|-------|
| Recall@5 | 78% | 39% | +39% |
| Recall@10 | 99% | 50% | +49% |
| Precision@5 | 70% | 34% | +37% |
| MRR | 0.94 | 0.79 | +0.16 |

## Contradiction Detection

| Metric | Score |
|--------|-------|
| Precision | 1.00 |
| Recall | 0.85 |
| F1 | 0.92 |

## Role Differentiation

| Metric | Hipp0 | Naive RAG | Delta |
|--------|-------|-----------|-------|
| Differentiation Score | 100% | 0% | +100% |
| Avg Overlap@5 | 2.6 | 5.0 | -2.4 |

## Token Efficiency

| Decisions | Full JSON | H0C | Ratio |
|-----------|-----------|-----|-------|
| 5 | 590 | 165 | 3.6x |
| 10 | 1,172 | 336 | 3.5x |
| 15 | 1,749 | 509 | 3.4x |
| 20 | 2,313 | 678 | 3.4x |
| 25 | 2,903 | 851 | 3.4x |
| 30 | 3,477 | 1014 | 3.4x |
| 40 | 4,617 | 1344 | 3.4x |
| 50 | 5,757 | 1672 | 3.4x |

Average: 3.4x | Median: 3.4x | Range: 3.4x – 3.6x

## Compile Latency

| Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision (ms) |
|-----------|----------|----------|----------|--------------------|
| 5 | 0.39 | 1.62 | 1.62 | 0.076 |
| 10 | 1.25 | 3.78 | 3.78 | 0.124 |
| 25 | 2.15 | 4.93 | 4.93 | 0.086 |
| 50 | 2.38 | 2.92 | 2.92 | 0.048 |
| 100 | 4.04 | 5.27 | 5.27 | 0.041 |
| 200 | 8.30 | 9.77 | 9.77 | 0.041 |
| 500 | 19.86 | 24.40 | 24.40 | 0.040 |

Overall: Avg 6.28ms | P95 27.04ms | Per-decision 0.063ms
