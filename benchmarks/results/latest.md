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
| 5 | 0.28 | 1.47 | 1.47 | 0.055 |
| 10 | 0.64 | 1.25 | 1.25 | 0.064 |
| 25 | 1.10 | 1.50 | 1.50 | 0.044 |
| 50 | 1.91 | 2.12 | 2.12 | 0.038 |
| 100 | 3.80 | 4.30 | 4.30 | 0.038 |
| 200 | 10.14 | 11.23 | 11.23 | 0.051 |
| 500 | 18.81 | 22.05 | 22.05 | 0.037 |

Overall: Avg 5.85ms | P95 25.06ms | Per-decision 0.045ms
