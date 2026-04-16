import { useEffect, useState, useMemo } from 'react';
import { getGanttData } from '../lib/api';

type GanttTask = {
  id: string;
  title: string;
  status: string;
  assigned_to_name?: string;
  startDate: string;
  endDate: string;
};

type Props = {
  projectId: string;
};

export default function GanttChart({ projectId }: Props) {
  const [data, setData] = useState<GanttTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGanttData(projectId).then(res => {
      setData(res || []);
      setLoading(false);
    }).catch(console.error);
  }, [projectId]);

  const { minDate, totalDays } = useMemo(() => {
    if (data.length === 0) return { minDate: new Date(), totalDays: 30 };
    
    // Default project start to today if no task has a startDate
    let starts = data.filter(t => t.startDate).map(t => new Date(t.startDate).getTime());
    let ends = data.filter(t => t.endDate).map(t => new Date(t.endDate).getTime());
    
    if (starts.length === 0) starts = [Date.now()];
    if (ends.length === 0) ends = [Date.now() + 86400000];

    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    
    // Add some padding
    min.setDate(min.getDate() - 2);
    max.setDate(max.getDate() + 2);
    
    const msPerDay = 1000 * 60 * 60 * 24;
    const days = Math.ceil((max.getTime() - min.getTime()) / msPerDay);
    
    return { minDate: min, totalDays: Math.max(days, 7) }; // At least a week
  }, [data]);

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading Timeline...</div>;
  if (data.length === 0) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>Not enough data for timeline. Add tasks first.</div>;

  const msPerDay = 1000 * 60 * 60 * 24;

  const getStatusColor = (status: string) => {
    if (status === 'done') return 'var(--success)';
    if (status === 'in_progress') return 'var(--warning)';
    return 'var(--text-muted)';
  };

  return (
    <div style={{ overflowX: 'auto', background: 'var(--surface)', padding: 20, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
      <div style={{ minWidth: 800 }}>
        
        {/* Header - Timeline */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', paddingBottom: 8, marginBottom: 16 }}>
           <div style={{ width: 250, flexShrink: 0, fontWeight: 700 }}>Task</div>
           <div style={{ flex: 1, position: 'relative', height: 20 }}>
             <div style={{ position: 'absolute', left: 0, fontSize: 11, color: 'var(--text-muted)' }}>{minDate.toLocaleDateString()}</div>
             <div style={{ position: 'absolute', right: 0, fontSize: 11, color: 'var(--text-muted)' }}> +{totalDays} Days</div>
           </div>
        </div>

        {/* Tasks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {data.map(task => {
            const startStr = task.startDate || new Date().toISOString();
            const endStr = task.endDate || new Date().toISOString();
            
            const startOffsetDays = (new Date(startStr).getTime() - minDate.getTime()) / msPerDay;
            const durationDays = (new Date(endStr).getTime() - new Date(startStr).getTime()) / msPerDay;
            
            const leftPct = Math.max(0, (startOffsetDays / totalDays) * 100);
            const widthPct = Math.max(2, (durationDays / totalDays) * 100);

            return (
              <div key={task.id} style={{ display: 'flex', alignItems: 'center' }}>
                <div style={{ width: 250, flexShrink: 0, paddingRight: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {task.assigned_to_name || 'Unassigned'}
                  </div>
                </div>
                
                <div style={{ flex: 1, position: 'relative', height: 24, background: 'rgba(255,255,255,0.02)', borderRadius: 4 }}>
                  <div 
                    style={{
                      position: 'absolute',
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      height: '100%',
                      background: getStatusColor(task.status),
                      borderRadius: 4,
                      opacity: 0.8,
                      boxShadow: `0 0 10px ${getStatusColor(task.status)}33`
                    }}
                    title={`${new Date(startStr).toLocaleDateString()} to ${new Date(endStr).toLocaleDateString()}`}
                  />
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
