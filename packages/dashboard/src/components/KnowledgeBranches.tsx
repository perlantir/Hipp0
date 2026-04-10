import { GitBranch } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function KnowledgeBranches() {
  return (
    <PlaceholderView
      icon={<GitBranch size={28} />}
      title="Knowledge Branches"
      description="Fork your decision graph, explore an alternative path, and merge back the changes that pay off."
    />
  );
}
