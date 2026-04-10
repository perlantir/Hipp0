import { FlaskConical } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function Experiments() {
  return (
    <PlaceholderView
      icon={<FlaskConical size={28} />}
      title="A/B Experiments"
      description="Run controlled experiments on prompts, policies, and agent configurations to measure what actually works."
    />
  );
}
