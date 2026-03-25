import { useMemo } from 'react';
import { Job, Editor } from '@/hooks/usePlannerData';
import { TrendingUp, CheckCircle2, RefreshCw, Clock, Users, Star, BarChart3, AlertTriangle } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';

interface AnalyticsViewProps {
  jobs: Job[];
  editors: Editor[];
}

const AnalyticsView = ({ jobs, editors }: AnalyticsViewProps) => {
  const now = new Date();
  const currentMonthStart = startOfMonth(now);
  const currentMonthEnd = endOfMonth(now);

  const stats = useMemo(() => {
    const totalJobs = jobs.length;
    const approvedJobs = jobs.filter(j => j.status === 'approved').length;
    const inProgressJobs = jobs.filter(j => j.status === 'in-progress').length;
    const revisionJobs = jobs.filter(j => j.status === 'revision').length;

    const totalRevisions = jobs.reduce((sum, j) => sum + (j.revisionCount || 0), 0);
    const avgRevisions = totalJobs > 0 ? (totalRevisions / totalJobs).toFixed(1) : '0';

    // Jobs with deadlines overdue
    const overdueJobs = jobs.filter(j => {
      if (!j.deadline || j.status === 'approved') return false;
      return new Date(j.deadline) < now;
    }).length;

    // Client breakdown
    const clientMap: Record<string, { count: number; revisions: number }> = {};
    jobs.forEach(j => {
      if (!clientMap[j.clientName]) clientMap[j.clientName] = { count: 0, revisions: 0 };
      clientMap[j.clientName].count++;
      clientMap[j.clientName].revisions += j.revisionCount || 0;
    });

    const topClients = Object.entries(clientMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    // Editor workload
    const editorStats = editors.map(editor => {
      const editorJobs = jobs.filter(j => j.editorId === editor.id);
      const completed = editorJobs.filter(j => j.status === 'approved').length;
      const active = editorJobs.filter(j => ['in-progress', 'review', 'revision'].includes(j.status)).length;
      const revisions = editorJobs.reduce((sum, j) => sum + (j.revisionCount || 0), 0);
      const avgRevPerJob = editorJobs.length > 0 ? (revisions / editorJobs.length).toFixed(1) : '0';
      const totalHours = editorJobs.reduce((sum, j) => sum + j.estimatedHours, 0);
      return { editor, total: editorJobs.length, completed, active, avgRevPerJob, totalHours };
    }).sort((a, b) => b.total - a.total);

    return { totalJobs, approvedJobs, inProgressJobs, revisionJobs, avgRevisions, overdueJobs, topClients, editorStats };
  }, [jobs, editors]);

  const completionRate = stats.totalJobs > 0 ? Math.round((stats.approvedJobs / stats.totalJobs) * 100) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-y-auto h-full">
      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Projects', value: stats.totalJobs, icon: BarChart3, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Completed', value: stats.approvedJobs, icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10' },
          { label: 'In Revision', value: stats.revisionJobs, icon: RefreshCw, color: 'text-purple-400', bg: 'bg-purple-500/10' },
          { label: 'Overdue', value: stats.overdueJobs, icon: AlertTriangle, color: 'text-rose-400', bg: 'bg-rose-500/10' },
        ].map((kpi) => (
          <div key={kpi.label} className="p-4 rounded-xl bg-secondary/10 border border-border/50 space-y-2">
            <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className="text-2xl font-black">{kpi.value}</p>
            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl bg-secondary/10 border border-border/50 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase font-bold">Completion Rate</p>
          <p className="text-3xl font-black text-primary">{completionRate}%</p>
          <div className="w-full h-2 bg-secondary/30 rounded-full">
            <div className="h-2 bg-primary rounded-full transition-all" style={{ width: `${completionRate}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground">{stats.approvedJobs} of {stats.totalJobs} projects approved</p>
        </div>
        <div className="p-4 rounded-xl bg-secondary/10 border border-border/50 space-y-2">
          <p className="text-[10px] text-muted-foreground uppercase font-bold">Avg Revisions / Project</p>
          <p className="text-3xl font-black text-amber-400">{stats.avgRevisions}</p>
          <p className="text-[10px] text-muted-foreground">Higher value = more client changes needed</p>
          {parseFloat(stats.avgRevisions) > 2 && (
            <p className="text-[10px] text-rose-400 font-bold">⚠ Consider tightening briefs or revision limits.</p>
          )}
        </div>
      </div>

      {/* Editor Performance Table */}
      {stats.editorStats.length > 0 && (
        <div className="rounded-xl bg-secondary/10 border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/30">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" /> Editor Performance
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/20 text-muted-foreground">
                  <th className="text-left px-4 py-2">Editor</th>
                  <th className="text-center px-3 py-2">Total</th>
                  <th className="text-center px-3 py-2">Active</th>
                  <th className="text-center px-3 py-2">Completed</th>
                  <th className="text-center px-3 py-2">Avg Revisions</th>
                  <th className="text-center px-3 py-2">Hours Logged</th>
                </tr>
              </thead>
              <tbody>
                {stats.editorStats.map(({ editor, total, active, completed, avgRevPerJob, totalHours }) => (
                  <tr key={editor.id} className="border-b border-border/10 hover:bg-secondary/10 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                          {editor.name[0]}
                        </div>
                        <span className="font-medium">{editor.name}</span>
                      </div>
                    </td>
                    <td className="text-center px-3 py-3 font-bold">{total}</td>
                    <td className="text-center px-3 py-3 text-blue-400">{active}</td>
                    <td className="text-center px-3 py-3 text-green-400">{completed}</td>
                    <td className="text-center px-3 py-3">
                      <span className={`font-bold ${parseFloat(avgRevPerJob) > 2 ? 'text-rose-400' : 'text-muted-foreground'}`}>
                        {avgRevPerJob}
                      </span>
                    </td>
                    <td className="text-center px-3 py-3 text-muted-foreground">{totalHours}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Clients */}
      {stats.topClients.length > 0 && (
        <div className="rounded-xl bg-secondary/10 border border-border/50 overflow-hidden">
          <div className="p-4 border-b border-border/30">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Star className="w-3.5 h-3.5 text-primary" /> Top Clients
            </h3>
          </div>
          <div className="divide-y divide-border/20">
            {stats.topClients.map((client, i) => (
              <div key={client.name} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/10 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-black text-muted-foreground w-4">#{i + 1}</span>
                  <p className="text-sm font-medium">{client.name}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span><b className="text-foreground">{client.count}</b> projects</span>
                  <span className={client.revisions > 3 ? 'text-rose-400' : ''}>
                    <b className="text-foreground">{client.revisions}</b> revisions
                    {client.revisions > 3 && ' ⚠️'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.totalJobs === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <BarChart3 className="w-12 h-12 opacity-20 mx-auto mb-3" />
          <p className="text-sm">No data yet. Add some jobs to see analytics.</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsView;
