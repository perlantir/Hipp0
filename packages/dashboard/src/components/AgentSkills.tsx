import { Sparkles } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function AgentSkills() {
  return (
    <PlaceholderView
      icon={<Sparkles size={28} />}
      title="Agent Skills"
      description="Teach your agents new capabilities and track which skills are most effective across your projects."
    />
  );
}
