import { Lightbulb } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function KnowledgeInsights() {
  return (
    <PlaceholderView
      icon={<Lightbulb size={28} />}
      title="Knowledge Insights"
      description="Surface patterns, gaps, and opportunities hidden in your team's collective decision history."
    />
  );
}
