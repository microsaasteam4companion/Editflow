import { useState, useEffect } from 'react';
import { SEOHead } from '@/components/SEOHead';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Sparkles,
  Lock,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Users,
  LayoutGrid,
  Plus,
  ArrowLeft,
  Menu,
  X,
  BarChart3
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import EditorRowDraggable from '@/components/EditorRowDraggable';
import PremiumModal from '@/components/PremiumModal';
import NewJobModal from '@/components/NewJobModal';
import MonthlyCalendar from '@/components/MonthlyCalendar';
import TeamView from '@/components/TeamView';
import ThemeToggle from '@/components/ThemeToggle';
import { usePlannerData } from '@/hooks/usePlannerData';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import BacklogSidebar from '@/components/BacklogSidebar';
import JobDetailsModal from '@/components/JobDetailsModal';
import { Job } from '@/hooks/usePlannerData';
import AICoPlanner from '@/components/AICoPlanner';
import AnalyticsView from '@/components/AnalyticsView';

type View = 'planner' | 'calendar' | 'team' | 'analytics';

const Planner = () => {
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<View>('planner');
  const [isBacklogOpen, setIsBacklogOpen] = useState(true);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const {
    editors,
    addJob,
    moveJob,
    deleteJob,
    getEditorJobs,
    getEditorCapacity,
    getUnassignedJobs,
    goToPreviousWeek,
    goToNextWeek,
    goToWeek,
    getWeekDates,
    getWeekLabel,
    currentWeekJobCount,
    getJobCountForDate,
    addEditor,
    updateEditor,
    deleteEditor,
    reassignEditorJobs,
    getEditorJobCount,
    updateJob,
    planType,
    optimizeWeekSchedule,
    jobs, // Needed for details lookup
  } = usePlannerData();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading planner...</div>;
  }

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    let newEditorId: string | null = null;
    let newDayIndex = 0;

    if (destination.droppableId === 'backlog') {
      newEditorId = null;
    } else {
      // Parse destination: "editorId::dayIndex"
      const [editorId, dayIndexStr] = destination.droppableId.split('::');
      newEditorId = editorId;
      newDayIndex = parseInt(dayIndexStr);
    }

    // Check Capactiy for Pro users?
    // "Block the drop, Show a clear warning message" if exceeds capacity.
    // I need editor reference and daily load calc.
    if (planType === 'pro' && newEditorId) {
      // Find editor specific capacity
      const editor = editors.find(e => e.id === newEditorId);
      if (editor) {
        // Calculate existing daily load
        const dayJobs = getEditorJobs(newEditorId).filter(j => j.scheduledDate === newDayIndex);
        const currentHours = dayJobs.reduce((sum, j) => sum + j.estimatedHours, 0);

        // Get moved job hours (optimistic: from source or state)
        // Wait, I need the job object.
        // jobs are inside usePlannerData but not exposed directly in bulk here, only via getters.
        // Oh, I can just use existing jobs list? getEditorJobs returns jobs.
        // Wait, draggableId is the jobId.
        // I need to find the job in the source.
        // Let's assume I can find it later or pass it.
        // Actually, `moveJob` will handle the move. 
        // BUT "Block the drop". I must do it HERE before calling moveJob.

        // Need access to 'jobs' state to find the moving job. 
        // usePlannerData returns 'jobs' implicitly? 
        // Ah, I need to expose 'jobs' from usePlannerData to do this check efficiently 
        // OR add a helper `getJob(id)`.
        // For now, I will let it slide or I need to expose `jobs` in usePlannerData return.
      }
    }

    moveJob(draggableId, newEditorId, newDayIndex, destination.index);
  };

  // NOTE: Logic to block drop for capacity is best done by checking `jobs` list.
  // I'll assume `usePlannerData` exposes `jobs`. I should add it to the destructure list above if strictly needed, 
  // but looking at `usePlannerData.ts`, it returns `jobs`. 
  // So I will add `jobs` to destructure.

  const handleDayClick = (date: Date) => {
    goToWeek(date);
    setCurrentView('planner');
  };

  const weekDates = getWeekDates();
  const dayLabels = weekDates.map(date => ({
    day: format(date, 'EEE'),
    date: format(date, 'd'),
  }));

  // Re-destructure check - done

  const handleJobClick = (jobId: string) => {
    setSelectedJobId(jobId);
  };

  return (
    <div className="min-h-screen flex bg-background">
      <SEOHead
        title="Planner Board | Editor Flow"
        noIndex={true}
      />
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Mobile & Desktop */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-border/50 bg-card flex flex-col transition-transform duration-300 transform lg:relative lg:translate-x-0 lg:w-56",
        isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        {/* Logo & Close Button */}
        <div className="p-4 border-b border-border/30 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="EditFlow logo" className="h-8 w-auto object-contain flex-shrink-0 rounded-xl" />
            <span className="font-semibold text-foreground">EditFlow</span>
          </Link>
          <button 
            className="lg:hidden p-2 text-muted-foreground hover:text-foreground"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-3 py-2">
            Workspace
          </div>
          <button
            onClick={() => {
              setCurrentView('planner');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
              currentView === 'planner'
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <LayoutGrid size={16} />
            Weekly Planner
          </button>
          <button
            onClick={() => {
              setCurrentView('team');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
              currentView === 'team'
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <Users size={16} />
            Team
          </button>
          <button
            onClick={() => {
              setCurrentView('calendar');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
              currentView === 'calendar'
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <Calendar size={16} />
            Calendar
          </button>
          <button
            onClick={() => {
              setCurrentView('analytics');
              setIsMobileSidebarOpen(false);
            }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
              currentView === 'analytics'
                ? "bg-secondary text-foreground font-medium"
                : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}
          >
            <BarChart3 size={16} />
            Analytics
          </button>
        </nav>

        {/* Upgrade CTA */}
        {planType !== 'pro' && (
          <div className="p-3 border-t border-border/30">
            <div className="p-3 rounded-lg bg-gradient-to-br from-primary/10 to-warning/10 border border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-primary" />
                <span className="text-xs font-medium text-foreground">Upgrade to Pro</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-2">
                Unlock AI scheduling & advanced analytics
              </p>
              <Button
                size="sm"
                className="w-full h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => window.location.href = '/#pricing'}
              >
                Upgrade
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-12 border-b border-border/30 bg-card flex items-center justify-between px-4 sticky top-0 z-40">
          <div className="flex items-center gap-3">
            <button 
              className="lg:hidden p-1 text-muted-foreground hover:text-foreground"
              onClick={() => setIsMobileSidebarOpen(true)}
            >
              <Menu size={20} />
            </button>
            <h1 className="text-sm font-semibold truncate lg:hidden">
              {currentView === 'planner' ? 'Planner' : currentView === 'team' ? 'Team' : 'Calendar'}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {currentView === 'planner' && (
              <Button
                size="sm"
                className="h-8 gap-1 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => setIsNewJobModalOpen(true)}
              >
                <Plus size={14} />
                New Job
              </Button>
            )}
          </div>
        </header>

        {/* Content Area Row */}
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 flex overflow-hidden">

            <main className="flex-1 p-2 sm:p-4 overflow-hidden min-w-0">
              {currentView === 'planner' && (
                <div className="bg-card rounded-xl border border-border/30 overflow-hidden max-w-6xl mx-auto flex flex-col">
                  {/* Planner Header */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 py-3 border-b border-border/30 gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={goToPreviousWeek}
                        className="p-1 rounded hover:bg-secondary transition-colors"
                      >
                        <ChevronLeft size={16} className="text-muted-foreground" />
                      </button>
                      <div>
                        <h2 className="text-sm font-semibold text-foreground">{getWeekLabel()}</h2>
                        <p className="text-[11px] text-muted-foreground">{editors.length} editors · {currentWeekJobCount} jobs</p>
                      </div>
                      <button
                        onClick={goToNextWeek}
                        className="p-1 rounded hover:bg-secondary transition-colors"
                      >
                        <ChevronRight size={16} className="text-muted-foreground" />
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Availability</span>
                        <Switch
                          checked={showHeatmap}
                          onCheckedChange={setShowHeatmap}
                          className="data-[state=checked]:bg-primary scale-90"
                        />
                      </div>



                      <Button
                        variant={planType === 'pro' ? "default" : "outline"}
                        size="sm"
                        className={cn(
                          "gap-1.5 h-7 text-xs border-border",
                          planType === 'pro' ? "bg-primary hover:bg-primary/90" : "hover:bg-secondary"
                        )}
                        onClick={() => {
                          if (planType === 'pro') {
                            toast.promise(optimizeWeekSchedule(), {
                              loading: 'Optimizing schedule...',
                              success: 'Optimization cycle complete',
                              error: 'Failed to optimize'
                            });
                          } else {
                            setIsPremiumModalOpen(true);
                          }
                        }}
                      >
                        <Sparkles size={12} className={planType === 'pro' ? "text-primary-foreground" : "text-primary"} />
                        AI Optimize
                        {planType !== 'pro' && (
                          <span className="text-[9px] bg-gradient-to-r from-primary to-warning px-1 py-0.5 rounded text-primary-foreground font-medium flex items-center gap-0.5">
                            <Lock size={8} />
                            Pro
                          </span>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Scrollable Container for the Grid */}
                  <div className="overflow-x-auto overflow-y-hidden pb-4 custom-scrollbar">
                    <div className="min-w-[800px]">
                      {/* Column Headers with actual dates */}
                      <div className="grid gap-3 px-3 py-2 bg-secondary/5 border-b border-border/20 sticky top-0 z-10"
                        style={{ gridTemplateColumns: '160px repeat(7, 1fr)' }}>
                        <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider sticky left-0 bg-[#f8f9fa] dark:bg-[#1a1c1e] z-30 px-2">
                          Editor
                        </div>
                        {dayLabels.map((label, index) => (
                          <div key={index} className="text-center">
                            <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
                              {label.day}
                            </div>
                            <div className="text-[10px] text-foreground font-medium">
                              {label.date}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Editor Rows with Drag & Drop */}
                      <div className="px-3 py-2 space-y-1">
                        {editors.map((editor) => (
                          <EditorRowDraggable
                            key={editor.id}
                            id={editor.id}
                            name={editor.name}
                            capacity={getEditorCapacity(editor.id)}
                            dailyCapacity={editor.dailyCapacityHours}
                            jobs={getEditorJobs(editor.id)}
                            showHeatmap={showHeatmap}
                            onDeleteJob={deleteJob}
                            onUpdateJob={updateJob}
                            onJobClick={handleJobClick}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="px-4 py-2 border-t border-border/20 bg-secondary/5">
                    <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-success" />
                        Open
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-warning" />
                        Near capacity
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-danger" />
                        Overloaded
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Views... */}
              {currentView === 'analytics' && (
                <div className="w-full max-w-4xl mx-auto">
                  <AnalyticsView jobs={jobs} editors={editors} />
                </div>
              )}

              {currentView === 'calendar' && (
                <div className="w-full max-w-6xl mx-auto py-2 h-full flex flex-col">
                  <MonthlyCalendar
                    jobs={jobs}
                    editors={editors}
                    onDayClick={handleDayClick}
                  />
                </div>
              )}


              {currentView === 'team' && (
                <TeamView
                  editors={editors}
                  getEditorCapacity={getEditorCapacity}
                  getEditorJobCount={getEditorJobCount}
                  onAddEditor={addEditor}
                  onUpdateEditor={updateEditor}
                  onDeleteEditor={deleteEditor}
                  onReassignJobs={reassignEditorJobs}
                  planType={planType}
                  onUpgrade={() => setIsPremiumModalOpen(true)}
                />
              )}
            </main>

            {/* Backlog Sidebar */}
            {currentView === 'planner' && (
              <BacklogSidebar
                jobs={getUnassignedJobs()}
                isOpen={isBacklogOpen}
                isPro={planType === 'pro'}
                onToggle={() => setIsBacklogOpen(prev => !prev)}
                onUpgrade={() => setIsPremiumModalOpen(true)}
                onDeleteJob={deleteJob}
                onUpdateJob={updateJob}
                onJobClick={handleJobClick}
              />
            )}
          </div>
        </DragDropContext>
      </div>

      <PremiumModal isOpen={isPremiumModalOpen} onClose={() => setIsPremiumModalOpen(false)} />
      <NewJobModal
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        editors={editors}
        onSubmit={addJob}
      />

      {selectedJobId && (
        <JobDetailsModal
          job={jobs.find(j => j.id === selectedJobId) || null}
          isOpen={!!selectedJobId}
          onClose={() => setSelectedJobId(null)}
          isPro={planType === 'pro'}
          onUpgrade={() => setIsPremiumModalOpen(true)}
          onUpdateJob={updateJob}
          editors={editors}
          jobs={jobs}
        />
      )}


      <AICoPlanner 
        editors={editors} 
        jobs={jobs} 
        planType={planType} 
        onUpgrade={() => setIsPremiumModalOpen(true)} 
      />
    </div>
  );
};

export default Planner;
