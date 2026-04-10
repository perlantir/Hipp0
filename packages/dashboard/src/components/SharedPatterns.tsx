import { Share2 } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function SharedPatterns() {
  return (
    <PlaceholderView
      icon={<Share2 size={28} />}
      title="Shared Patterns"
      description="Patterns discovered across tenants that your team can opt into for faster, better decisions."
    />
  );
}
