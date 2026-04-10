import { HeartPulse } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';
import { ProjectStats } from './ProjectStats';

/**
 * Team Health currently reuses the ProjectStats overview. When a dedicated
 * team-health UI ships, the placeholder will be swapped in here.
 *
 * Set `SHOW_PLACEHOLDER` to true to preview the coming-soon card.
 */
const SHOW_PLACEHOLDER = false;

export function TeamHealth() {
  if (SHOW_PLACEHOLDER) {
    return (
      <PlaceholderView
        icon={<HeartPulse size={28} />}
        title="Team Health"
        description="Track the vital signs of your team's knowledge: decision velocity, agreement rate, and outcomes."
      />
    );
  }
  return <ProjectStats />;
}
