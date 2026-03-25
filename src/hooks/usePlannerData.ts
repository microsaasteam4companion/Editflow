
import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, addWeeks, format, addDays } from 'date-fns';
import { db } from '@/lib/firebase';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc, 
  orderBy,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type Priority = 'low' | 'medium' | 'high';
export type Status = 'queued' | 'in-progress' | 'review' | 'revision' | 'approved';

export interface Job {
  id: string; // UUID from DB
  title: string;
  clientName: string;
  editorId: string | null; // UUID, can be null for backlog
  scheduledDate: number; // dayIndex 0-6 (Mon-Sun)
  weekStart: string; // ISO date string for the week's start (Monday)
  estimatedHours: number;
  priority: Priority;
  status: Status;
  order: number;
  notes?: string;
  // Premium fields
  rawFootageUrl?: string;
  brandAssetsUrl?: string;
  previewUrl?: string;
  clientViewToken?: string;
  deadline?: string;
  // Phase 2 Fields
  startedAt?: string;
  completedAt?: string;
  actualHours?: number;
  revisionCount?: number;
  projectBrief?: string;
  footageUrl?: string;
  assetsUrl?: string;
  referenceLinks?: string;
}

export interface Editor {
  id: string; // UUID
  name: string;
  weeklyCapacity: number;
  dailyCapacityHours: number; // New field
}

export const usePlannerData = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    return startOfWeek(new Date(), { weekStartsOn: 1 });
  });

  const [editors, setEditors] = useState<Editor[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [planType, setPlanType] = useState<'free' | 'pro'>('free'); // Default to free
  const currentWeekStartStr = format(currentWeekStart, 'yyyy-MM-dd');

  // Fetch Data
  const fetchData = useCallback(async () => {
    if (!user) {
      setEditors([]);
      setJobs([]);
      setPlanType('free');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Fetch Profile Plan
      console.log('[usePlannerData] Fetching profile for UID:', user.uid);
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      
      if (profileSnap.exists()) {
        const rawType = profileSnap.data().plan_type;
        console.log('[usePlannerData] Profile found. DB plan_type:', rawType);
        const type = (rawType || 'free').toString().toLowerCase().trim();
        setPlanType(type === 'pro' ? 'pro' : 'free');
      } else {
        console.log('[usePlannerData] No profile found in "profiles" collection for UID:', user.uid);
      }

      // Fetch Editors
      const editorsQuery = query(
        collection(db, 'editors'), 
        where('user_id', '==', user.uid)
      );
      const editorsSnap = await getDocs(editorsQuery);
      
      const formattedEditors: Editor[] = editorsSnap.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          weeklyCapacity: data.weekly_capacity,
          dailyCapacityHours: data.daily_capacity_hours || 8,
        };
      });
      
      setEditors(formattedEditors);

      // Fetch Jobs
      const jobsQuery = query(
        collection(db, 'jobs'),
        where('user_id', '==', user.uid)
      );
      const jobsSnap = await getDocs(jobsQuery);

      // Fetch Notes
      const notesQuery = query(
        collection(db, 'job_notes'),
        where('user_id', '==', user.uid)
      );
      const notesSnap = await getDocs(notesQuery);
      let notesMap: Record<string, string> = {};
      notesSnap.forEach(doc => {
        notesMap[doc.data().job_id] = doc.data().content;
      });

      // Merge data
      const formattedJobs: Job[] = jobsSnap.docs.map(doc => {
        const j = doc.data();
        return {
          id: doc.id,
          title: j.title,
          clientName: j.client_name,
          editorId: j.editor_id,
          scheduledDate: j.scheduled_date,
          weekStart: j.week_start,
          estimatedHours: j.estimated_hours || 0,
          priority: j.priority,
          status: j.status,
          order: j.order,
          notes: notesMap[doc.id] || j.notes || '',
          rawFootageUrl: j.raw_footage_url,
          brandAssetsUrl: j.brand_assets_url,
          previewUrl: j.preview_url,
          clientViewToken: j.client_view_token,
          deadline: j.deadline,
          startedAt: j.started_at,
          completedAt: j.completed_at,
          actualHours: j.actual_hours,
          revisionCount: j.revision_count || 0,
          projectBrief: j.project_brief || '',
          footageUrl: j.footage_url || j.raw_footage_url || '',
          assetsUrl: j.assets_url || j.brand_assets_url || '',
          referenceLinks: j.reference_links || '',
        };
      });

      setJobs(formattedJobs);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load planner data');
    } finally {
      setLoading(false);
    }
  }, [user, currentWeekStartStr]);

  // AI Optimization Logic
  const optimizeWeekSchedule = useCallback(async () => {
    if (planType !== 'pro' || editors.length < 2) return;

    const updates: { id: string; editor_id: string }[] = [];
    const newJobs = [...jobs];
    let movesCount = 0;

    // Process each day of the week independently
    for (let day = 0; day < 7; day++) {
      // 1. Get jobs for this day
      const dayJobs = newJobs.filter(j => j.scheduledDate === day && j.weekStart === currentWeekStartStr);
      if (dayJobs.length === 0) continue;

      // 2. Calculate Load per Editor
      const editorLoads: Record<string, number> = {};
      editors.forEach(e => editorLoads[e.id] = 0);

      dayJobs.forEach(j => {
        if (editorLoads[j.editorId] !== undefined) {
          editorLoads[j.editorId] += j.estimatedHours;
        }
      });

      // 3. Determine imbalances
      const totalHours = Object.values(editorLoads).reduce((a, b) => a + b, 0);
      const avgHours = totalHours / editors.length;
      const threshold = 1.0; // Don't move if difference is small (1 hour)

      // 4. Greedy Balancing
      // Sort editors by load
      let sortedEditors = [...editors].sort((a, b) => editorLoads[b.id] - editorLoads[a.id]); // Descending

      let maxIter = 20; // Safety break
      while (maxIter-- > 0) {
        sortedEditors.sort((a, b) => editorLoads[b.id] - editorLoads[a.id]);
        const overloaded = sortedEditors[0];
        const underloaded = sortedEditors[sortedEditors.length - 1];

        if ((editorLoads[overloaded.id] - editorLoads[underloaded.id]) <= threshold) {
          break; // Balanced enough
        }

        // Find a suitable job to move
        // Logic: Find the smallest job from Overloaded that fits into Underloaded without making Underloaded > Average + Threshold
        // Or just simply move the smallest job if it helps convergence
        const candidates = dayJobs.filter(j => j.editorId === overloaded.id).sort((a, b) => a.estimatedHours - b.estimatedHours);

        let moved = false;
        for (const job of candidates) {
          // Check if moving this job flips the balance too aggressively?
          // Actually, as long as (NewUnderload < OldOverload) it is an improvement usually.
          // Simple heuristic: If (Underload + Job) < Overload, do it. 
          if ((editorLoads[underloaded.id] + job.estimatedHours) < editorLoads[overloaded.id]) {
            // Move Job
            job.editorId = underloaded.id;
            editorLoads[overloaded.id] -= job.estimatedHours;
            editorLoads[underloaded.id] += job.estimatedHours;

            updates.push({ id: job.id, editor_id: underloaded.id });
            movesCount++;
            moved = true;
            break; // Re-sort and re-evaluate
          }
        }

        if (!moved) break; // No valid moves found
      }
    }

    if (movesCount > 0) {
      // Optimistic Update
      setJobs(newJobs);
      toast.info(`AI Optimization: Rebalanced ${movesCount} tasks across the team.`);

      // Persist to DB
      for (const update of updates) {
        await updateDoc(doc(db, 'jobs', update.id), {
          editor_id: update.editor_id
        });
      }
    } else {
      toast.info("Schedule is already balanced!");
    }

  }, [jobs, editors, currentWeekStartStr, planType]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Week navigation
  const goToPreviousWeek = useCallback(() => {
    setCurrentWeekStart(prev => addWeeks(prev, -1));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentWeekStart(prev => addWeeks(prev, 1));
  }, []);

  const goToWeek = useCallback((date: Date) => {
    setCurrentWeekStart(startOfWeek(date, { weekStartsOn: 1 }));
  }, []);

  // Helper getters
  const getWeekDates = useCallback(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(currentWeekStart, i));
  }, [currentWeekStart]);

  const getWeekLabel = useCallback(() => {
    const endOfWeekDate = addDays(currentWeekStart, 6);
    const startMonth = format(currentWeekStart, 'MMM');
    const endMonth = format(endOfWeekDate, 'MMM');
    const startDay = format(currentWeekStart, 'd');
    const endDay = format(endOfWeekDate, 'd');
    const year = format(currentWeekStart, 'yyyy');

    if (startMonth === endMonth) {
      return `Week of ${startMonth} ${startDay}–${endDay}, ${year}`;
    }
    return `Week of ${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  }, [currentWeekStart]);  // Mutations
  const addJob = useCallback(async (job: Omit<Job, 'id' | 'order' | 'weekStart'>) => {
    if (!user) return;
    try {
      const newJobOrder = jobs.filter(j =>
        j.editorId === job.editorId &&
        j.scheduledDate === job.scheduledDate &&
        j.weekStart === currentWeekStartStr
      ).length;

      const dbJob = {
        user_id: user.uid,
        editor_id: job.editorId,
        title: job.title,
        client_name: job.clientName,
        scheduled_date: job.scheduledDate,
        week_start: currentWeekStartStr,
        estimated_hours: job.estimatedHours,
        priority: job.priority,
        status: job.status,
        order: newJobOrder,
        raw_footage_url: job.rawFootageUrl || null,
        brand_assets_url: job.brandAssetsUrl || null,
        preview_url: job.previewUrl || null,
        client_view_token: job.previewUrl ? (Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)) : null,
        deadline: job.deadline || null,
        revision_count: 0,
        project_brief: job.projectBrief || null,
        footage_url: job.footageUrl || null,
        assets_url: job.assetsUrl || null,
        reference_links: job.referenceLinks || null,
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'jobs'), dbJob);

      // Add note
      if (job.notes) {
        await addDoc(collection(db, 'job_notes'), {
          job_id: docRef.id,
          user_id: user.uid,
          content: job.notes,
          updated_at: serverTimestamp()
        });
      }

      const newJob: Job = {
        id: docRef.id,
        title: job.title,
        clientName: job.clientName,
        editorId: job.editorId,
        scheduledDate: job.scheduledDate,
        weekStart: currentWeekStartStr,
        estimatedHours: job.estimatedHours,
        priority: job.priority,
        status: job.status,
        order: newJobOrder,
        notes: job.notes || '',
        rawFootageUrl: job.rawFootageUrl,
        brandAssetsUrl: job.brandAssetsUrl,
        previewUrl: job.previewUrl,
        deadline: job.deadline,
        revisionCount: 0,
        projectBrief: job.projectBrief || '',
        footageUrl: job.footageUrl || '',
        assetsUrl: job.assetsUrl || '',
        referenceLinks: job.referenceLinks || '',
      };

      setJobs(prev => [...prev, newJob]);
      toast.success('Job created');
      return newJob;
    } catch (error: any) {
      console.error('Error adding job:', error);
      toast.error(`Failed to create job: ${error.message || 'Unknown error'}`);
    }
  }, [jobs, currentWeekStartStr, user]);

  const updateJob = useCallback(async (jobId: string, updates: Partial<Job>) => {
    try {
      // Optimistic update
      setJobs(prev => prev.map(job =>
        job.id === jobId ? { ...job, ...updates } : job
      ));

      const dbUpdates: any = {};
      if (updates.title) dbUpdates.title = updates.title;
      if (updates.clientName) dbUpdates.client_name = updates.clientName;
      if (updates.editorId !== undefined) dbUpdates.editor_id = updates.editorId;
      if (updates.scheduledDate !== undefined) dbUpdates.scheduled_date = updates.scheduledDate;
      if (updates.estimatedHours !== undefined) dbUpdates.estimated_hours = updates.estimatedHours;
      if (updates.priority) dbUpdates.priority = updates.priority;
      if (updates.status) dbUpdates.status = updates.status;
      if (updates.order !== undefined) dbUpdates.order = updates.order;
      if (updates.weekStart) dbUpdates.week_start = updates.weekStart;
      if (updates.rawFootageUrl !== undefined) dbUpdates.raw_footage_url = updates.rawFootageUrl;
      if (updates.brandAssetsUrl !== undefined) dbUpdates.brand_assets_url = updates.brandAssetsUrl;
      if (updates.previewUrl !== undefined) dbUpdates.preview_url = updates.previewUrl;
      if ((updates as any).clientViewToken) dbUpdates.client_view_token = (updates as any).clientViewToken;
      if (updates.deadline !== undefined) dbUpdates.deadline = updates.deadline;
      if (updates.revisionCount !== undefined) dbUpdates.revision_count = updates.revisionCount;
      if (updates.projectBrief !== undefined) dbUpdates.project_brief = updates.projectBrief;
      if (updates.footageUrl !== undefined) dbUpdates.footage_url = updates.footageUrl;
      if (updates.assetsUrl !== undefined) dbUpdates.assets_url = updates.assetsUrl;
      if (updates.referenceLinks !== undefined) dbUpdates.reference_links = updates.referenceLinks;

      // Phase 2: Time Tracking Logic
      if (updates.status) {
        const now = new Date().toISOString();
        const currentJob = jobs.find(j => j.id === jobId);

        if (updates.status === 'in-progress') {
          if (currentJob && !currentJob.startedAt) {
            dbUpdates.started_at = now;
          }
        }

        if ((updates.status === 'review' || updates.status === 'approved' || updates.status === 'revision') && currentJob) {
          dbUpdates.completed_at = now;
          const startT = currentJob.startedAt ? new Date(currentJob.startedAt).getTime() : 0;
          if (startT > 0) {
            const endT = new Date(now).getTime();
            const diffHours = Math.max(0, (endT - startT) / (1000 * 60 * 60));
            const actual = Math.round(diffHours * 10) / 10;
            dbUpdates.actual_hours = actual;
          }
        }

        // Phase 1: Revision Counter Logic
        if (updates.status === 'revision' && currentJob && currentJob.status !== 'revision') {
          const nextCount = (currentJob.revisionCount || 0) + 1;
          dbUpdates.revision_count = nextCount;
          // Also update the local state correctly
          (updates as any).revisionCount = nextCount;
        }
      }

      if (Object.keys(dbUpdates).length > 0) {
        await updateDoc(doc(db, 'jobs', jobId), dbUpdates);
      }

      // Status History
      if (updates.status) {
        const currentJob = jobs.find(j => j.id === jobId);
        await addDoc(collection(db, 'job_status_history'), {
          job_id: jobId,
          old_status: currentJob?.status,
          new_status: updates.status,
          changed_by: user?.uid,
          changed_at: serverTimestamp()
        });
      }

      // Handle Note Updates
      if (updates.notes !== undefined) {
        const notesQuery = query(
          collection(db, 'job_notes'),
          where('job_id', '==', jobId)
        );
        const notesSnap = await getDocs(notesQuery);

        if (!notesSnap.empty) {
          await updateDoc(doc(db, 'job_notes', notesSnap.docs[0].id), {
            content: updates.notes,
            updated_at: serverTimestamp()
          });
        } else {
          await addDoc(collection(db, 'job_notes'), {
            job_id: jobId,
            user_id: user?.uid,
            content: updates.notes,
            updated_at: serverTimestamp()
          });
        }
      }

    } catch (error: any) {
      console.error('Error updating job:', error);
      toast.error(`Failed to update job: ${error.message || 'Unknown error'}`);
      fetchData(); // Revert on error
    }
  }, [fetchData, user, jobs]);

  const deleteJob = useCallback(async (jobId: string) => {
    try {
      setJobs(prev => prev.filter(job => job.id !== jobId));
      await deleteDoc(doc(db, 'jobs', jobId));
      
      // Delete notes too
      const notesQuery = query(collection(db, 'job_notes'), where('job_id', '==', jobId));
      const notesSnap = await getDocs(notesQuery);
      for (const d of notesSnap.docs) {
        await deleteDoc(d.ref);
      }

      toast.success('Job deleted');
    } catch (error: any) {
      console.error('Error deleting job:', error);
      toast.error(`Failed to delete job: ${error.message || 'Unknown error'}`);
      fetchData();
    }
  }, [fetchData]);

  const moveJob = useCallback(async (jobId: string, newEditorId: string | null, newDayIndex: number, newOrder: number) => {
    // Optimistic update logic
    setJobs(prev => {
      const jobIndex = prev.findIndex(j => j.id === jobId);
      if (jobIndex === -1) return prev;

      const job = prev[jobIndex];
      const wasInSameCell = job.editorId === newEditorId && job.scheduledDate === newDayIndex;

      const updatedJobs = prev.map(j => {
        if (j.id === jobId) {
          return { ...j, editorId: newEditorId, scheduledDate: newDayIndex, order: newOrder };
        }
        if (j.editorId === newEditorId && j.scheduledDate === newDayIndex && j.weekStart === job.weekStart && j.id !== jobId) {
          if (wasInSameCell) {
            const oldOrder = job.order;
            if (newOrder > oldOrder && j.order > oldOrder && j.order <= newOrder) {
              return { ...j, order: j.order - 1 };
            }
            if (newOrder < oldOrder && j.order >= newOrder && j.order < oldOrder) {
              return { ...j, order: j.order + 1 };
            }
          } else {
            if (j.order >= newOrder) {
              return { ...j, order: j.order + 1 };
            }
          }
        }
        return j;
      });

      (async () => {
        try {
          await updateDoc(doc(db, 'jobs', jobId), {
            editor_id: newEditorId,
            scheduled_date: newDayIndex,
            order: newOrder
          });
        } catch (e) {
          console.error("Move job failed", e);
        }
      })();

      return updatedJobs;
    });
  }, []);

  // Editor CRUD & LIMITS
  const addEditor = useCallback(async (editor: Omit<Editor, 'id'>) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      let planType = 'free';
      if (profileSnap.exists()) {
        planType = profileSnap.data().plan_type;
      }

      const limit = planType === 'pro' ? 10 : 2;

      if (editors.length >= limit) {
        throw new Error('PLAN_LIMIT_REACHED');
      }

      const dbEditor = {
        user_id: user.uid,
        name: editor.name,
        weekly_capacity: editor.weeklyCapacity,
        daily_capacity_hours: editor.dailyCapacityHours || 8,
        created_at: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, 'editors'), dbEditor);

      const newEditor: Editor = {
        id: docRef.id,
        name: editor.name,
        weeklyCapacity: editor.weeklyCapacity,
        dailyCapacityHours: editor.dailyCapacityHours || 8
      };

      setEditors(prev => [...prev, newEditor]);
      toast.success('Editor added');
      return newEditor;
    } catch (error: any) {
      if (error.message === 'PLAN_LIMIT_REACHED') {
        throw error;
      }
      console.error('Error adding editor:', error);
      toast.error(error.message || 'Failed to add editor');
      throw error;
    }
  }, [editors, user]);

  const updateEditor = useCallback(async (editorId: string, updates: Partial<Editor>) => {
    setEditors(prev => prev.map(editor =>
      editor.id === editorId ? { ...editor, ...updates } : editor
    ));

    try {
      const dbUpdates: any = {};
      if (updates.name) dbUpdates.name = updates.name;
      if (updates.weeklyCapacity) dbUpdates.weekly_capacity = updates.weeklyCapacity;
      if (updates.dailyCapacityHours) dbUpdates.daily_capacity_hours = updates.dailyCapacityHours;

      await updateDoc(doc(db, 'editors', editorId), dbUpdates);
    } catch (e) {
      console.error("Update editor failed", e);
      fetchData();
    }
  }, [fetchData]);

  const deleteEditor = useCallback(async (editorId: string) => {
    setEditors(prev => prev.filter(editor => editor.id !== editorId));
    try {
      await deleteDoc(doc(db, 'editors', editorId));
      toast.success('Editor deleted');
    } catch (e) {
      console.error("Delete editor failed", e);
      fetchData();
    }
  }, [fetchData]);

  const reassignEditorJobs = useCallback(async (fromEditorId: string, toEditorId: string) => {
    setJobs(prev => prev.map(job =>
      job.editorId === fromEditorId ? { ...job, editorId: toEditorId } : job
    ));

    try {
      const jobsQuery = query(collection(db, 'jobs'), where('editor_id', '==', fromEditorId));
      const jobsSnap = await getDocs(jobsQuery);
      for (const d of jobsSnap.docs) {
        await updateDoc(d.ref, { editor_id: toEditorId });
      }
    } catch (e) {
      console.error("Reassign failed", e);
      fetchData();
    }
  }, [fetchData]);

  // Read-only helpers
  const getEditorJobCount = useCallback((editorId: string) => {
    return jobs.filter(job => job.editorId === editorId).length;
  }, [jobs]);

  const getEditorJobs = useCallback((editorId: string) => {
    return jobs
      .filter(job => job.editorId === editorId && job.weekStart === currentWeekStartStr)
      .sort((a, b) => a.order - b.order);
  }, [jobs, currentWeekStartStr]);

  const getUnassignedJobs = useCallback(() => {
    return jobs.filter(job => job.editorId === null);
  }, [jobs]);

  const getEditorCapacity = useCallback((editorId: string) => {
    const editorJobs = jobs.filter(job => job.editorId === editorId && job.weekStart === currentWeekStartStr);
    const totalHours = editorJobs.reduce((sum, job) => sum + job.estimatedHours, 0);
    const editor = editors.find(e => e.id === editorId);
    const weeklyCapacity = editor?.weeklyCapacity || 40;
    return Math.min(100, Math.round((totalHours / weeklyCapacity) * 100));
  }, [jobs, editors, currentWeekStartStr]);

  const getEditorDailyCapacity = useCallback((editorId: string, dateIndex: number) => {
    const editor = editors.find(e => e.id === editorId);
    if (!editor) return { used: 0, total: 8, remaining: 8 };

    const dailyJobs = jobs.filter(j =>
      j.editorId === editorId &&
      j.scheduledDate === dateIndex &&
      j.weekStart === currentWeekStartStr
    );

    const used = dailyJobs.reduce((acc, job) => acc + (job.estimatedHours || 0), 0);
    const total = editor.dailyCapacityHours || 8;

    return {
      used,
      total,
      remaining: Math.max(0, total - used),
      isOverCapacity: used > total
    };
  }, [jobs, editors, currentWeekStartStr]);

  const getJobsForMonth = useCallback((year: number, month: number) => {
    return jobs.filter(job => {
      const weekStart = new Date(job.weekStart);
      const jobDate = addDays(weekStart, job.scheduledDate);
      return jobDate.getFullYear() === year && jobDate.getMonth() === month;
    });
  }, [jobs]);

  const getJobCountForDate = useCallback((date: Date) => {
    const weekStart = startOfWeek(date, { weekStartsOn: 1 });
    const weekStartStr = format(weekStart, 'yyyy-MM-dd');
    const dayIndex = (date.getDay() + 6) % 7;
    return jobs.filter(job => job.weekStart === weekStartStr && job.scheduledDate === dayIndex).length;
  }, [jobs]);

  const currentWeekJobCount = jobs.filter(job => job.weekStart === currentWeekStartStr).length;

  return {
    editors,
    jobs,
    currentWeekStart,
    currentWeekStartStr,
    currentWeekJobCount,
    loading,
    goToPreviousWeek,
    goToNextWeek,
    goToWeek,
    getWeekDates,
    getWeekLabel,
    addJob,
    updateJob,
    moveJob,
    deleteJob,
    addEditor,
    updateEditor,
    deleteEditor,
    reassignEditorJobs,
    getEditorJobCount,
    getEditorJobs,
    getEditorCapacity,
    getEditorDailyCapacity,
    getUnassignedJobs,
    getJobsForMonth,
    getJobCountForDate,
    planType,
    optimizeWeekSchedule,
  };
};
