import { ClipboardList } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function TeamProcedures() {
  return (
    <PlaceholderView
      icon={<ClipboardList size={28} />}
      title="Team Procedures"
      description="Codify how your team works so agents can follow the same playbooks you do."
    />
  );
}
