# Hipp0 Decision Memory Benchmark Results

Run: 2026-04-08

## Retrieval Accuracy

| Metric | Hipp0 5-Signal | Naive RAG | Delta |
|--------|---------------|-----------|-------|
| Recall@5 | 52% | 32% | +20% |
| Recall@10 | 71% | 42% | +29% |
| Precision@5 | 54% | 32% | +21% |
| MRR | 0.80 | 0.76 | +0.04 |

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
| 5 | 335 | 80 | 4.2x |
| 10 | 649 | 155 | 4.2x |
| 15 | 973 | 233 | 4.2x |
| 20 | 1,284 | 310 | 4.1x |
| 25 | 1,605 | 388 | 4.1x |
| 30 | 1,910 | 459 | 4.2x |
| 40 | 2,548 | 615 | 4.1x |
| 50 | 3,169 | 766 | 4.1x |

Average: 4.1x | Median: 4.2x | Range: 4.1x – 4.2x

## Compile Latency

| Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision (ms) |
|-----------|----------|----------|----------|--------------------|
| 5 | 0.15 | 2.21 | 2.21 | 0.028 |
| 10 | 0.33 | 0.41 | 0.41 | 0.033 |
| 25 | 0.75 | 1.32 | 1.32 | 0.030 |
| 50 | 1.30 | 1.88 | 1.88 | 0.026 |
| 100 | 2.59 | 3.14 | 3.14 | 0.025 |
| 200 | 4.98 | 5.38 | 5.38 | 0.025 |
| 500 | 12.21 | 13.18 | 13.18 | 0.024 |

Overall: Avg 3.66ms | P95 17.71ms | Per-decision 0.027ms
