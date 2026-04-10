import { TrendingUp } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function Trends() {
  return (
    <PlaceholderView
      icon={<TrendingUp size={28} />}
      title="Trends"
      description="See how decisions, outcomes, and contradictions evolve over time across every project."
    />
  );
}
