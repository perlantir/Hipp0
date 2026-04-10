# Hipp0 Decision Memory Benchmark Results

Run: 2026-04-10

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

| Decisions | Markdown | H0C | Ratio |
|-----------|-----------|-----|-------|
| 5 | 1,131 | 200 | 5.7x |
| 10 | 2,154 | 304 | 7.0x |
| 15 | 3,128 | 405 | 7.7x |
| 20 | 4,078 | 486 | 8.4x |
| 25 | 5,057 | 571 | 8.8x |
| 30 | 6,003 | 655 | 9.2x |
| 40 | 7,947 | 816 | 9.8x |
| 50 | 9,870 | 980 | 10.1x |

Average: 8.4x | Median: 8.6x | Range: 5.7x – 10.1x

## Compile Latency

| Decisions | P50 (ms) | P95 (ms) | P99 (ms) | Per-Decision (ms) |
|-----------|----------|----------|----------|--------------------|
| 5 | 0.33 | 0.48 | 0.48 | 0.065 |
| 10 | 0.67 | 1.92 | 1.92 | 0.067 |
| 25 | 1.30 | 2.07 | 2.07 | 0.052 |
| 50 | 1.87 | 2.25 | 2.25 | 0.037 |
| 100 | 3.49 | 3.79 | 3.79 | 0.035 |
| 200 | 6.83 | 7.47 | 7.47 | 0.034 |
| 500 | 17.06 | 19.32 | 19.32 | 0.034 |

Overall: Avg 5.18ms | P95 22.85ms | Per-decision 0.045ms
