/**
 * Pattern Extractor — stub implementation.
 */
export interface ExtractedPattern {
  pattern_type: string;
  description: string;
  confidence: number;
  decisions: string[];
}

export async function getProjectPatterns(projectId: string): Promise<ExtractedPattern[]> {
  void projectId;
  return [];
}

export async function extractPatterns(projectId?: string): Promise<ExtractedPattern[]> {
  if (projectId) return getProjectPatterns(projectId);
  return [];
}

export async function extractCrossTenantPatterns(): Promise<ExtractedPattern[]> {
  return [];
}
