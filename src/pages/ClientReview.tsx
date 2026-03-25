import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { db } from '@/lib/firebase';
import { collection, query, where, getDocs, addDoc, serverTimestamp, doc, getDoc, updateDoc, increment } from 'firebase/firestore';
import { Job } from '@/hooks/usePlannerData';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Send, Sparkles, AlertCircle, Pencil, Clock, CheckCircle2, RefreshCw, FileVideo, Link as LinkIcon, ExternalLink, MessageSquare, ChevronRight } from 'lucide-react';
import ReviewCanvas, { ReviewCanvasHandle } from '@/components/ReviewCanvas';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const getEmbedUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('youtube.com/watch?v=')) return url.replace('watch?v=', 'embed/');
  if (url.includes('youtu.be/')) { const id = url.split('/').pop(); return `https://www.youtube.com/embed/${id}`; }
  if (url.includes('vimeo.com/') && !url.includes('player.vimeo.com')) { const id = url.split('/').pop(); return `https://player.vimeo.com/video/${id}`; }
  return url;
};

const statusConfig: Record<string, { label: string; color: string; desc: string }> = {
  'queued': { label: 'Queued', color: 'bg-slate-500/10 text-slate-400 border-slate-500/20', desc: 'Your project is in the queue and will start soon.' },
  'in-progress': { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', desc: 'Your editor is actively working on this project.' },
  'review': { label: 'Ready for Review', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', desc: 'Your project is complete and ready for your review.' },
  'revision': { label: 'In Revision', color: 'bg-purple-500/10 text-purple-400 border-purple-500/20', desc: 'Revisions are being made based on your feedback.' },
  'approved': { label: '✅ Approved', color: 'bg-green-500/10 text-green-400 border-green-500/20', desc: 'This project has been approved. Great work!' },
};

export default function ClientReview() {
  const { token } = useParams();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [approving, setApproving] = useState(false);
  const [requestingRevision, setRequestingRevision] = useState(false);
  const [isMarkupMode, setIsMarkupMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'status' | 'feedback'>('status');
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const canvasRef = useRef<ReviewCanvasHandle>(null);

  const fetchJob = async () => {
    if (!token) return;
    try {
      const docRef = doc(db, 'jobs', token);
      const snap = await getDoc(docRef);
      if (!snap.exists()) { setError(`No project found.`); return; }
      const data = snap.data();
      const jobData = {
        id: snap.id, title: data.title, clientName: data.client_name, status: data.status,
        priority: data.priority, previewUrl: data.preview_url, revisionCount: data.revision_count || 0,
        projectBrief: data.project_brief || '', footageUrl: data.footage_url || data.raw_footage_url || '',
        assetsUrl: data.assets_url || data.brand_assets_url || '', referenceLinks: data.reference_links || '',
        deadline: data.deadline, editorId: data.editor_id, estimatedHours: data.estimated_hours, order: data.order,
        scheduledDate: data.scheduled_date, weekStart: data.week_start,
      } as Job;
      setJob(jobData);
      setError(null);
    } catch (err: any) {
      setError(`Could not load project.`);
    } finally {
      setLoading(false);
    }
  };

  const fetchNotes = async (jobId: string) => {
    try {
      const q = query(collection(db, 'job_notes'), where('job_id', '==', jobId));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a: any, b: any) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
      setNotes(data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchJob(); }, [token]);
  useEffect(() => { if (job?.id) fetchNotes(job.id); }, [job?.id]);

  const handleApprove = async () => {
    if (!job) return;
    setApproving(true);
    try {
      await updateDoc(doc(db, 'jobs', job.id), { status: 'approved' });
      await addDoc(collection(db, 'job_status_history'), {
        job_id: job.id, old_status: job.status, new_status: 'approved',
        changed_by: 'CLIENT', changed_at: serverTimestamp()
      });
      await addDoc(collection(db, 'job_notes'), {
        job_id: job.id, content: '✅ CLIENT APPROVED this version.',
        created_by: 'CLIENT', created_at: serverTimestamp()
      });
      toast.success("Project Approved! 🎉");
      setJob(prev => prev ? { ...prev, status: 'approved' } : prev);
    } catch (err) {
      toast.error("Failed to approve. Please try again.");
    } finally {
      setApproving(false);
    }
  };

  const handleRequestRevision = async () => {
    if (!job || !comment.trim()) {
      toast.error("Please write your revision notes first.");
      setActiveTab('feedback');
      return;
    }
    setRequestingRevision(true);
    try {
      const drawingData = canvasRef.current?.getCanvasData();
      const newRevCount = (job.revisionCount || 0) + 1;
      await updateDoc(doc(db, 'jobs', job.id), { status: 'revision', revision_count: newRevCount });
      await addDoc(collection(db, 'job_status_history'), {
        job_id: job.id, old_status: job.status, new_status: 'revision',
        changed_by: 'CLIENT', changed_at: serverTimestamp()
      });
      await addDoc(collection(db, 'job_notes'), {
        job_id: job.id, content: `🔄 REVISION REQUEST (Round ${newRevCount}): ${comment.trim()}`,
        created_by: 'CLIENT', created_at: serverTimestamp(), drawing_data: drawingData || null
      });
      toast.success(`Revision #${newRevCount} requested!`);
      setComment('');
      canvasRef.current?.clear();
      setJob(prev => prev ? { ...prev, status: 'revision', revisionCount: newRevCount } : prev);
      await fetchNotes(job.id);
    } catch (err) {
      toast.error("Failed to send revision. Please try again.");
    } finally {
      setRequestingRevision(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (!job || !comment.trim()) return;
    setSubmitting(true);
    try {
      const drawingData = canvasRef.current?.getCanvasData();
      await addDoc(collection(db, 'job_notes'), {
        job_id: job.id, content: `CLIENT FEEDBACK: ${comment.trim()}`,
        created_by: 'CLIENT', created_at: serverTimestamp(), drawing_data: drawingData || null
      });
      toast.success("Feedback sent!");
      setComment('');
      canvasRef.current?.clear();
      await fetchNotes(job.id);
    } catch {
      toast.error("Failed to submit feedback.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="h-screen flex items-center justify-center bg-[#0a0c0e]"><Loader2 className="animate-spin text-primary w-8 h-8" /></div>;

  if (error || !job) {
    return (
      <div className="h-screen flex flex-col items-center justify-center p-4 text-center space-y-4 bg-[#0a0c0e]">
        <AlertCircle size={48} className="text-rose-500 opacity-70" />
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-foreground">Project Not Found</h2>
          <p className="text-muted-foreground text-sm max-w-sm">{error || "The link might be invalid. Please contact your editor."}</p>
        </div>
        <Button variant="outline" onClick={() => window.location.reload()}>Try Again</Button>
      </div>
    );
  }

  const sc = statusConfig[job.status] || statusConfig['queued'];
  const isReadyForDecision = job.status === 'review';
  const isApproved = job.status === 'approved';

  return (
    <div className="min-h-screen bg-[#0a0c0e] text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 bg-[#0f1113]/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="EditFlow" className="h-8 w-auto rounded-lg" />
            <div className="h-4 w-px bg-white/10" />
            <span className="text-sm text-muted-foreground font-medium">Client Portal</span>
          </div>
          <Badge variant="outline" className={`${sc.color} capitalize text-[10px] font-bold tracking-wider`}>
            {sc.label}
          </Badge>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 w-full flex-1 flex flex-col gap-8">

        {/* Project Hero */}
        <div className="rounded-2xl border border-white/5 bg-white/2 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div className="space-y-1">
              {(job.revisionCount || 0) > 0 && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Round {job.revisionCount} Revision
                </span>
              )}
              <h1 className="text-2xl font-bold text-white">{job.title}</h1>
              <p className="text-muted-foreground text-sm">For: <span className="text-white font-medium">{job.clientName}</span></p>
            </div>
            {job.deadline && (
              <div className="text-right">
                <p className="text-[10px] text-muted-foreground uppercase font-bold">Deadline</p>
                <p className="text-sm font-semibold text-white">{new Date(job.deadline).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            )}
          </div>
          <div className="p-3 rounded-lg bg-white/3 border border-white/5 text-sm text-muted-foreground">{sc.desc}</div>

          {/* Approval Actions */}
          {isReadyForDecision && (
            <div className="mt-4 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-3">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3 h-3" /> Action Required
              </p>
              <p className="text-sm text-foreground/80">Please review the project below and let us know your decision.</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  className="flex-1 gap-2 h-11 font-bold bg-green-600 hover:bg-green-500 text-white"
                  onClick={handleApprove}
                  disabled={approving}
                >
                  {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Approve This Version
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2 h-11 font-bold border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  onClick={handleRequestRevision}
                  disabled={requestingRevision}
                >
                  {requestingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Request Revision
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">💡 To request a revision, write your notes in the "Feedback" tab first.</p>
            </div>
          )}

          {isApproved && (
            <div className="mt-4 p-4 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-400 flex-shrink-0" />
              <div>
                <p className="font-bold text-green-400">Project Approved!</p>
                <p className="text-xs text-muted-foreground">Thank you for your feedback. We'll process the final delivery.</p>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/5 gap-1">
          {[
            { id: 'status', label: 'Project Status', icon: Sparkles },
            { id: 'feedback', label: `Feedback (${notes.filter(n => n.created_by === 'CLIENT').length})`, icon: MessageSquare }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all relative",
                activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
            </button>
          ))}
        </div>

        {/* Status Tab */}
        {activeTab === 'status' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Preview */}
            <div className="rounded-2xl border border-white/5 bg-white/2 overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <h2 className="text-sm font-bold text-white">Project Preview</h2>
              </div>
              {job.previewUrl ? (
                <div className="relative aspect-video bg-black">
                  <iframe
                    src={getEmbedUrl(job.previewUrl)}
                    className="w-full h-full border-none"
                    title="Project Preview"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                  {isMarkupMode && (
                    <div className="absolute inset-0 z-40">
                      <ReviewCanvas ref={canvasRef} jobId={job.id} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center text-muted-foreground">
                  <div className="text-center space-y-2">
                    <FileVideo className="w-10 h-10 opacity-20 mx-auto" />
                    <p className="text-xs">Preview will be added by your editor</p>
                  </div>
                </div>
              )}
              {job.previewUrl && (
                <div className="p-3 flex justify-between items-center border-t border-white/5">
                  <Button variant="ghost" size="sm" className={cn("gap-1.5 text-xs", isMarkupMode && "text-primary")} onClick={() => setIsMarkupMode(!isMarkupMode)}>
                    <Pencil className="w-3 h-3" />
                    {isMarkupMode ? "Exit Markup" : "Draw Feedback"}
                  </Button>
                  <a href={job.previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                    Open in new tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            {/* Assets & Info */}
            <div className="space-y-4">
              {job.projectBrief && (
                <div className="rounded-2xl border border-white/5 bg-white/2 p-5 space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Project Brief</h3>
                  <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap">{job.projectBrief}</p>
                </div>
              )}

              {(job.footageUrl || job.assetsUrl || job.referenceLinks) && (
                <div className="rounded-2xl border border-white/5 bg-white/2 p-5 space-y-3">
                  <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5"><LinkIcon className="w-3 h-3 text-primary" /> Project Links</h3>
                  <div className="space-y-2">
                    {job.footageUrl && (
                      <a href={job.footageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">Raw Footage</p>
                          <p className="text-xs text-foreground/80 truncate max-w-[200px]">{job.footageUrl}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </a>
                    )}
                    {job.assetsUrl && (
                      <a href={job.assetsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">Brand Assets</p>
                          <p className="text-xs text-foreground/80 truncate max-w-[200px]">{job.assetsUrl}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </a>
                    )}
                    {job.referenceLinks && (
                      <a href={job.referenceLinks} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/5 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                        <div>
                          <p className="text-[10px] font-bold text-muted-foreground uppercase">References</p>
                          <p className="text-xs text-foreground/80 truncate max-w-[200px]">{job.referenceLinks}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Feedback Tab */}
        {activeTab === 'feedback' && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Previous Feedback */}
            <div className="rounded-2xl border border-white/5 bg-white/2 p-5 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Feedback History</h3>
              {notes.filter(n => n.created_by === 'CLIENT').length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="w-8 h-8 opacity-20 mx-auto mb-2" />
                  <p className="text-xs">No feedback submitted yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notes.filter(n => n.created_by === 'CLIENT').map(note => (
                    <div key={note.id} className="bg-white/3 p-3 rounded-xl border border-white/5 space-y-2">
                      <p className="text-sm leading-relaxed">{note.content.replace('CLIENT FEEDBACK: ', '').replace(/^🔄 /, '')}</p>
                      {note.drawing_data && (
                        <img src={note.drawing_data} alt="Markup" className="w-full h-24 object-cover rounded-lg border border-white/10 cursor-zoom-in" onClick={() => setPreviewImageUrl(note.drawing_data)} />
                      )}
                      <p className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        {note.created_at?.toDate ? formatDistanceToNow(note.created_at.toDate()) + ' ago' : 'Just now'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Submit Feedback */}
            <div className="rounded-2xl border border-white/5 bg-white/2 p-5 space-y-4">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Submit Feedback</h3>
              <p className="text-xs text-muted-foreground">Describe what you'd like changed. You can also draw on the preview in the Status tab.</p>
              <Textarea
                placeholder="e.g., 'At 0:15, the color grading seems too warm. Please match it to the reference video...'"
                className="min-h-[160px] resize-none text-sm bg-white/3 border-white/10"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex flex-col gap-2">
                <Button
                  className="w-full gap-2 font-bold"
                  onClick={handleSubmitFeedback}
                  disabled={!comment.trim() || submitting}
                  variant="outline"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Send Feedback Only
                </Button>
                {isReadyForDecision && (
                  <Button
                    className="w-full gap-2 font-bold bg-purple-600 hover:bg-purple-500 text-white"
                    onClick={handleRequestRevision}
                    disabled={!comment.trim() || requestingRevision}
                  >
                    {requestingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    Send + Request Revision
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t border-white/5 py-4 px-4 text-center">
        <p className="text-[10px] text-muted-foreground">Powered by <span className="text-primary font-bold">EditFlow</span> · Professional Video Production Management</p>
      </footer>

      {/* Full Image Preview Modal */}
      {previewImageUrl && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setPreviewImageUrl(null)}>
          <img src={previewImageUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg border border-white/10 shadow-2xl" alt="Full Markup" />
        </div>
      )}
    </div>
  );
}
