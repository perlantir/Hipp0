import { useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { useApi } from '../hooks/useApi';
import { useProject } from '../App';

interface ComplianceData {
  active_policies: number;
  total_violations: number;
  open_violations: number;
  compliance_rate: number;
}

export function PolicyComplianceCard() {
  const { get } = useApi();
  const { projectId } = useProject();

  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    get<ComplianceData>(`/api/projects/${projectId}/compliance`)
      .then((d) => {
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [get, projectId]);

  if (loading) {
    return (
      <div className="card p-5 flex items-center justify-center h-32">
        <Loader2 size={20} className="animate-spin" style={{ color: 'var(--text-tertiary)' }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card p-5 text-center" style={{ color: 'var(--text-secondary)' }}>
        <p className="text-sm">Policy compliance data unavailable</p>
      </div>
    );
  }

  const rateColor = data.compliance_rate >= 90 ? '#059669' : data.compliance_rate >= 70 ? '#D97706' : '#DC2626';

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield size={18} style={{ color: '#D97706' }} />
        <h3 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
          Policy Compliance
        </h3>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: rateColor }}>
            {data.compliance_rate}%
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Compliance
          </p>
        </div>

        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: data.open_violations > 0 ? '#DC2626' : 'var(--text-primary)' }}>
            {data.open_violations}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Open Violations
          </p>
        </div>

        <div className="text-center">
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            {data.active_policies}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            Active Policies
          </p>
        </div>
      </div>

      {/* Compliance bar */}
      <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${data.compliance_rate}%`, background: rateColor }}
        />
      </div>

      {data.open_violations > 0 && (
        <div className="flex items-center gap-1.5 mt-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(220, 38, 38, 0.08)' }}>
          <AlertTriangle size={13} style={{ color: '#DC2626' }} />
          <span className="text-xs" style={{ color: '#DC2626' }}>
            {data.open_violations} unresolved violation{data.open_violations !== 1 ? 's' : ''} require attention
          </span>
        </div>
      )}

      {data.open_violations === 0 && data.active_policies > 0 && (
        <div className="flex items-center gap-1.5 mt-3 px-2 py-1.5 rounded-md" style={{ background: 'rgba(5, 150, 105, 0.08)' }}>
          <CheckCircle size={13} style={{ color: '#059669' }} />
          <span className="text-xs" style={{ color: '#059669' }}>
            All policies compliant
          </span>
        </div>
      )}
    </div>
  );
}
