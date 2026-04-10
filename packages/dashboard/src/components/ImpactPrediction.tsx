import { Gauge } from 'lucide-react';
import { PlaceholderView } from './PlaceholderView';

export function ImpactPrediction() {
  return (
    <PlaceholderView
      icon={<Gauge size={28} />}
      title="Impact Prediction"
      description="Forecast the downstream effects of a decision before you commit to it."
    />
  );
}
