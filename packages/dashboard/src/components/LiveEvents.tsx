import { Radio } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function LiveEvents() {
  return (
    <PlaceholderView
      icon={<Radio size={28} />}
      title="Live Events"
      description="Stream every event flowing through Hipp0 in real time &mdash; decisions, captures, webhooks, and more."
    />
  );
}
