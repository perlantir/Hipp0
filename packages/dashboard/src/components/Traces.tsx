import { Waypoints } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function Traces() {
  return (
    <PlaceholderView
      icon={<Waypoints size={28} />}
      title="Traces"
      description="Replay the step-by-step reasoning behind every agent decision."
    />
  );
}
