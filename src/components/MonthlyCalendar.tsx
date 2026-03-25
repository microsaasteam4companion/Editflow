import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  format,
  isSameMonth,
  isToday,
  addMonths,
  subMonths
} from 'date-fns';
import { cn } from '@/lib/utils';
import { Job, Editor } from '@/hooks/usePlannerData';

interface MonthlyCalendarProps {
  jobs: Job[];
  editors: Editor[];
  onDayClick: (date: Date) => void;
}

const MonthlyCalendar = ({ jobs, editors, onDayClick }: MonthlyCalendarProps) => {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days: Date[] = [];
    let day = startDate;
    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  const goToPreviousMonth = () => setCurrentMonth(prev => subMonths(prev, 1));
  const goToNextMonth = () => setCurrentMonth(prev => addMonths(prev, 1));
  const goToToday = () => setCurrentMonth(new Date());

  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const getDayJobs = (date: Date) => {
    const weekStartStr = format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd');
    const dayIndex = (date.getDay() + 6) % 7;
    return jobs.filter(job => job.weekStart === weekStartStr && job.scheduledDate === dayIndex);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'in-progress': return 'bg-blue-500/15 text-blue-600 border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400';
      case 'review': return 'bg-amber-500/15 text-amber-600 border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-400';
      case 'revision': return 'bg-rose-500/15 text-rose-600 border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-400';
      case 'approved': return 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400';
      default: return 'bg-slate-500/10 text-slate-600 border-slate-500/20 dark:bg-slate-500/20 dark:text-slate-400';
    }
  };

  return (
    <div className="bg-card/70 backdrop-blur-xl rounded-2xl border border-border/40 shadow-strong overflow-hidden flex flex-col h-full w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-b border-border/30 bg-gradient-to-r from-primary/5 via-secondary/10 to-transparent relative overflow-hidden shrink-0">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
        
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-warning flex items-center justify-center shadow-lg shadow-primary/20">
            <CalendarIcon className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center gap-2">
              {format(currentMonth, 'MMMM yyyy')}
            </h2>
            <p className="text-xs text-muted-foreground font-medium mt-0.5">Project Agenda View</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 sm:mt-0 relative z-10">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-secondary/50 hover:bg-secondary text-foreground transition-all duration-200"
          >
            Today
          </button>
          <div className="h-4 w-px bg-border mx-1" />
          <button
            onClick={goToPreviousMonth}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 border border-transparent hover:border-border/50"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goToNextMonth}
            className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-all duration-200 border border-transparent hover:border-border/50"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Week Headers */}
      <div className="grid grid-cols-7 bg-secondary/20 border-b border-border/30 shrink-0">
        {weekDays.map((day) => (
          <div key={day} className="px-3 py-2 text-center sm:text-left">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              {day}
            </span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 flex-1 bg-border/20 gap-[1px]">
        {calendarDays.map((day, index) => {
          const dayJobs = getDayJobs(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isCurrentDay = isToday(day);

          return (
            <button
              key={index}
              onClick={() => onDayClick(day)}
              className={cn(
                'min-h-[120px] p-2 sm:p-3 transition-all duration-300 group relative bg-card flex flex-col justify-start text-left items-start overflow-hidden',
                !isCurrentMonth ? 'opacity-40 bg-secondary/10' : 'hover:bg-primary/[0.02]',
                isCurrentDay && 'bg-primary/[0.03]'
              )}
            >
              {/* Active Day Highlight Bar */}
              {isCurrentDay && (
                <div className="absolute top-0 left-0 w-full h-1 bg-primary shadow-glow-sm" />
              )}
              
              {/* Background gradient on hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />

              <div className="w-full flex items-center justify-between z-10 mb-2">
                <span className={cn(
                  'text-xs font-bold w-7 h-7 flex items-center justify-center rounded-full transition-all duration-300',
                  isCurrentDay 
                    ? 'bg-primary text-primary-foreground shadow-glow' 
                    : 'text-muted-foreground group-hover:text-primary group-hover:bg-primary/10'
                )}>
                  {format(day, 'd')}
                </span>
                {dayJobs.length > 0 && (
                   <span className="text-[9px] font-bold text-muted-foreground bg-secondary px-1.5 py-0.5 rounded uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                      {dayJobs.length} Jobs
                   </span>
                )}
              </div>

              {/* Event Chips */}
              <div className="flex-1 w-full flex flex-col gap-1.5 z-10 overflow-hidden">
                {dayJobs.slice(0, 3).map((job) => (
                  <div 
                    key={job.id} 
                    className={cn(
                      "text-[10px] font-semibold px-2 py-1 rounded-md truncate w-full border border-l-2 transition-all hover:brightness-110",
                      getStatusColor(job.status)
                    )}
                    title={job.title}
                  >
                    {job.title}
                  </div>
                ))}
                
                {dayJobs.length > 3 && (
                  <div className="text-[10px] font-bold text-muted-foreground px-2 py-0.5 hover:text-primary transition-colors">
                    +{dayJobs.length - 3} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default MonthlyCalendar;
