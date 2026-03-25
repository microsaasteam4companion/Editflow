import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Job, Status, Priority, Editor } from "@/hooks/usePlannerData";
import { format, formatDistanceToNow } from "date-fns";
import { 
    Clock, 
    MessageSquare, 
    X, 
    ExternalLink, 
    History, 
    Send, 
    Link as LinkIcon, 
    Pencil, 
    CheckCircle2, 
    Layout, 
    AlertCircle,
    Sparkles,
    UserCheck,
    ChevronRight,
    User,
    FileText,
    Loader2,
    Receipt,
    Printer,
    Copy,
    Share2,
    ScrollText,
    MessagesSquare,
    Plus,
    Trash2,
    Lock
} from 'lucide-react';
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, addDoc, serverTimestamp, doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

interface JobDetailsModalProps {
    job: Job | null;
    isOpen: boolean;
    onClose: () => void;
    isPro: boolean;
    onUpgrade: () => void;
    onUpdateJob?: (jobId: string, updates: Partial<Job>) => Promise<void>;
    editors: Editor[];
    jobs: Job[];
}

interface StatusEvent {
    id: string;
    from_status: string;
    to_status: string;
    created_at: any;
}

interface JobNote {
    id: string;
    content: string;
    created_at: any;
    created_by: string;
    drawing_data?: string;
}

const JobDetailsModal = ({ job, isOpen, onClose, isPro, onUpgrade, onUpdateJob, editors, jobs }: JobDetailsModalProps) => {
    const { user } = useAuth();
    const [history, setHistory] = useState<StatusEvent[]>([]);
    const [notes, setNotes] = useState<JobNote[]>([]);
    const [newNote, setNewNote] = useState("");
    const [activeTab, setActiveTab] = useState<"details" | "notes" | "history" | "brief" | "invoice" | "contract" | "chat">("details");

    // Invoice state
    const [basePrice, setBasePrice] = useState('5000');
    const [perRevisionCharge, setPerRevisionCharge] = useState('500');
    const [taxPercent, setTaxPercent] = useState('18');
    const [editorName, setEditorName] = useState('');
    const [extraInvoiceItems, setExtraInvoiceItems] = useState<{ id: string, desc: string, amount: string }[]>([]);

    // Contract state
    const [revisionsIncluded, setRevisionsIncluded] = useState('2');
    const [paymentTerms, setPaymentTerms] = useState('50% advance, 50% on delivery');
    const [turnaroundDays, setTurnaroundDays] = useState('5');
    const [contractRules, setContractRules] = useState<{ id: string, text: string }[]>([
        { id: '1', text: 'Scope Creep: New scenes, reshoots, or format changes will be quoted separately.' },
        { id: '2', text: 'Ownership: All rights transferred to Client upon full payment.' }
    ]);
    const [contractAccepted, setContractAccepted] = useState(false);

    // Chat state
    const [chatMessages, setChatMessages] = useState<any[]>([]);
    const [newChatMsg, setNewChatMsg] = useState('');
    const [sendingChat, setSendingChat] = useState(false);
    const [linkEditMode, setLinkEditMode] = useState(false);
    const [linkEditValue, setLinkEditValue] = useState("");
    
    // Phase 1 Fields
    const [projectBrief, setProjectBrief] = useState("");
    const [footageUrl, setFootageUrl] = useState("");
    const [assetsUrl, setAssetsUrl] = useState("");
    const [referenceLinks, setReferenceLinks] = useState("");
    const [isSavingBrief, setIsSavingBrief] = useState(false);
    
    // Header Edit State
    const [titleEditMode, setTitleEditMode] = useState(false);
    const [editedTitle, setEditedTitle] = useState("");

    useEffect(() => {
        if (!job || !isOpen) return;

        setEditedTitle(job.title || "");
        setLinkEditValue(job.previewUrl || "");
        setProjectBrief(job.projectBrief || "");
        setFootageUrl(job.footageUrl || "");
        setAssetsUrl(job.assetsUrl || "");
        setReferenceLinks(job.referenceLinks || "");
        setEditorName(editors.find(e => e.id === job.editorId)?.name || 'EditFlow Studio');
        
        const fetchHistory = async () => {
            try {
                const q = query(
                    collection(db, "job_status_history"),
                    where("job_id", "==", job.id)
                );
                const snap = await getDocs(q);
                const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as StatusEvent[];
                events.sort((a, b) => b.created_at?.seconds - a.created_at?.seconds);
                setHistory(events);
            } catch (err) {
                console.error("Error fetching history:", err);
            }
        };

        const fetchNotes = async () => {
            try {
                const q = query(
                    collection(db, "job_notes"),
                    where("job_id", "==", job.id)
                );
                const snap = await getDocs(q);
                const fetchedNotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as JobNote[];
                fetchedNotes.sort((a, b) => b.created_at?.seconds - a.created_at?.seconds);
                setNotes(fetchedNotes);
            } catch (err) {
                console.error("Error fetching notes:", err);
            }
        };

        fetchHistory();
        fetchNotes();

        // Fetch chat messages
        const fetchChat = async () => {
            try {
                const q = query(collection(db, 'job_chat'), where('job_id', '==', job.id));
                const snap = await getDocs(q);
                const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                msgs.sort((a: any, b: any) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
                setChatMessages(msgs);
                // Check contract acceptance
                const contractQ = query(collection(db, 'job_contracts'), where('job_id', '==', job.id));
                const contractSnap = await getDocs(contractQ);
                setContractAccepted(!contractSnap.empty);
            } catch (err) { console.error(err); }
        };
        fetchChat();
    }, [job, isOpen]);

    if (!job) return null;

    const handleAddNote = async () => {
        if (!newNote.trim() || !user) return;
        try {
            await addDoc(collection(db, "job_notes"), {
                job_id: job.id,
                content: newNote,
                created_at: serverTimestamp(),
                created_by: 'EDITOR'
            });
            setNewNote("");
            // Refresh notes
            const q = query(
                collection(db, "job_notes"),
                where("job_id", "==", job.id)
            );
            const snap = await getDocs(q);
            const fetchedNotes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as JobNote[];
            fetchedNotes.sort((a, b) => b.created_at?.seconds - a.created_at?.seconds);
            setNotes(fetchedNotes);
        } catch (err) {
            toast.error("Failed to add note");
        }
    };

    const handleSaveLink = async () => {
        if (!onUpdateJob) return;
        try {
            await onUpdateJob(job.id, { previewUrl: linkEditValue.trim() || "" });
            setLinkEditMode(false);
            toast.success("Link updated");
        } catch (err) {
            toast.error("Failed to update link");
        }
    };

    const handleSaveBrief = async () => {
        if (!onUpdateJob) return;
        setIsSavingBrief(true);
        try {
            await onUpdateJob(job.id, {
                projectBrief: projectBrief.trim(),
                footageUrl: footageUrl.trim(),
                assetsUrl: assetsUrl.trim(),
                referenceLinks: referenceLinks.trim()
            });
            toast.success("Project information saved");
        } catch (err) {
            toast.error("Failed to save project information");
        } finally {
            setIsSavingBrief(false);
        }
    };

    const statusColors = {
        'queued': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
        'in-progress': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'review': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        'revision': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'approved': 'bg-green-500/10 text-green-400 border-green-500/20'
    };

    const priorityColors = {
        'low': 'text-slate-400',
        'medium': 'text-amber-400',
        'high': 'text-rose-400'
    };

    const formatDate = (ts: any) => {
        if (!ts) return new Date();
        if (ts.toDate) return ts.toDate();
        return new Date(ts);
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl bg-[#0F1113] border-border/50 p-0 overflow-hidden outline-none">
                <DialogHeader className="sr-only">
                    <DialogTitle>{job.title}</DialogTitle>
                    <DialogDescription>
                        Comprehensive details, history and client feedback for job: {job.title}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col h-[85vh] md:h-[70vh]">
                    {/* Header */}
                    <div className="p-6 border-b border-border/50 bg-gradient-to-br from-primary/5 to-transparent">
                        <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={`${statusColors[job.status]} capitalize px-2 py-0 text-[10px] font-bold tracking-wider`}>
                                        {job.status.replace('-', ' ')}
                                    </Badge>
                                    {(job.revisionCount || 0) > 0 && (
                                        <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20 text-[10px] font-bold">
                                            ROUND {job.revisionCount}
                                        </Badge>
                                    )}
                                    <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                                        <Clock className="w-3 h-3" />
                                        {job.estimatedHours}h est.
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 group">
                                    {titleEditMode ? (
                                        <>
                                            <Input className="h-8 text-xl font-bold bg-secondary/20 border-border/50 max-w-md" value={editedTitle} onChange={(e) => setEditedTitle(e.target.value)} />
                                            <Button size="sm" className="h-8" onClick={async () => { if(onUpdateJob) { await onUpdateJob(job.id, { title: editedTitle.trim() }); setTitleEditMode(false); toast.success("Project title updated"); } }}>Save</Button>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => { setTitleEditMode(false); setEditedTitle(job.title); }}><X className="w-4 h-4"/></Button>
                                        </>
                                    ) : (
                                        <>
                                            <h2 className="text-xl font-bold text-foreground leading-tight">{job.title}</h2>
                                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setTitleEditMode(true)}>
                                                <Pencil className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                                            </Button>
                                        </>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                                    <span className="font-semibold text-primary">{job.clientName}</span>
                                    <span className="opacity-30">•</span>
                                    <span>Added {format(formatDate(job.scheduledDate), 'MMM d, yyyy')}</span>
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex items-center px-6 border-b border-border/30 bg-[#0F1113] overflow-x-auto no-scrollbar">
                        {[
                            { id: 'details', label: 'Overview', icon: Layout },
                            { id: 'brief', label: 'Brief', icon: FileText, proRequired: true },
                            { id: 'invoice', label: 'Invoice', icon: Receipt, proRequired: true },
                            { id: 'contract', label: 'Contract', icon: ScrollText, proRequired: true },
                            { id: 'chat', label: 'Team Chat', icon: MessagesSquare, count: chatMessages.length, proRequired: true },
                            { id: 'notes', label: 'Feedback', icon: MessageSquare, count: notes.length },
                            { id: 'history', label: 'History', icon: History }
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    if (tab.proRequired && !isPro) {
                                        onUpgrade();
                                        return;
                                    }
                                    setActiveTab(tab.id as any);
                                }}
                                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold transition-all relative ${
                                    activeTab === tab.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.proRequired && !isPro ? <Lock className="w-3.5 h-3.5 text-amber-500" /> : <tab.icon className="w-3.5 h-3.5" />}
                                {tab.label}
                                {tab.count !== undefined && tab.count > 0 && (
                                    <span className="bg-primary/20 text-primary text-[9px] px-1.5 py-0.5 rounded-full ml-1">
                                        {tab.count}
                                    </span>
                                )}
                                {activeTab === tab.id && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Content Scroll Area */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {activeTab === 'details' && (
                            <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-4 rounded-xl bg-secondary/10 border border-border/50">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                            <User className="w-3 h-3 text-primary" /> Editor Assigned
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">
                                                {job.editorId ? editors.find(e => e.id === job.editorId)?.name[0] : "?"}
                                            </div>
                                            <span className="text-sm font-semibold">
                                                {job.editorId ? editors.find(e => e.id === job.editorId)?.name : "Unassigned"}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="p-4 rounded-xl bg-secondary/10 border border-border/50">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 flex items-center gap-1.5">
                                            <AlertCircle className="w-3 h-3 text-primary" /> Priority Level
                                        </p>
                                        <span className={`text-sm font-bold capitalize ${priorityColors[job.priority]}`}>
                                            {job.priority} Priority
                                        </span>
                                    </div>
                                </div>

                                {/* AI Smart Allocation */}
                                {!job.editorId && editors.length > 0 && isPro && (
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                                <Sparkles className="w-3 h-3" /> AI Smart Allocation
                                            </p>
                                            <Badge variant="outline" className="text-[8px] h-4 bg-primary/10 border-primary/20 text-primary">PRO</Badge>
                                        </div>
                                        {(() => {
                                            const recommendations = editors.map(editor => {
                                                const activeJobsCount = jobs.filter(j => 
                                                    j.editorId === editor.id && (j.status === 'in-progress' || j.status === 'review')
                                                ).length;
                                                const loadPercent = editor.weeklyCapacity > 0 ? (activeJobsCount / editor.weeklyCapacity) * 100 : 100;
                                                return { editor, activeJobsCount, loadPercent };
                                            }).sort((a, b) => a.loadPercent - b.loadPercent);

                                            const best = recommendations[0];
                                            const isAvailable = best.loadPercent < 80;

                                            return (
                                                <div className="flex items-center justify-between gap-3">
                                                    <div className="space-y-0.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm font-bold">{best.editor.name}</span>
                                                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase border ${
                                                                isAvailable ? 'bg-green-500/10 text-green-600 border-green-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                                                            }`}>
                                                                {isAvailable ? "Available" : "Busy"}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground">
                                                            Recommended based on current workload: <b>{best.activeJobsCount}</b> active jobs.
                                                        </p>
                                                    </div>
                                                    <Button 
                                                        size="sm" 
                                                        className="h-8 gap-1.5 text-xs font-bold" 
                                                        onClick={() => onUpdateJob && onUpdateJob(job.id, { editorId: best.editor.id })}
                                                    >
                                                        <UserCheck className="w-3.5 h-3.5" /> Assign
                                                    </Button>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                {/* Links Section */}
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <ExternalLink className="w-3.5 h-3.5 text-primary" /> Live Review System
                                        </h3>
                                        <Button 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-6 text-[10px] gap-1"
                                            onClick={() => setLinkEditMode(!linkEditMode)}
                                        >
                                            {linkEditMode ? "Cancel" : <><Pencil className="w-3 h-3" /> Edit Link</>}
                                        </Button>
                                    </div>

                                    {linkEditMode ? (
                                        <div className="flex gap-2">
                                            <Input 
                                                className="h-9 text-xs bg-secondary/20 border-border/50" 
                                                placeholder="Paste preview URL..." 
                                                value={linkEditValue}
                                                onChange={(e) => setLinkEditValue(e.target.value)}
                                            />
                                            <Button size="sm" className="h-9" onClick={handleSaveLink}>Save</Button>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="p-3 bg-secondary/10 border border-border/50 rounded-lg flex items-center justify-between">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] text-muted-foreground uppercase font-bold mb-0.5">Project URL</p>
                                                    <p className="text-xs truncate font-medium">{job.previewUrl || "No link added yet"}</p>
                                                    {job.clientViewToken && (
                                                        <p className="text-[9px] text-muted-foreground mt-1 opacity-50">Token: {job.clientViewToken}</p>
                                                    )}
                                                </div>
                                                {job.previewUrl && (
                                                    <Button variant="outline" size="sm" className="ml-4 h-7 text-xs gap-1.5" asChild>
                                                        <a href={job.previewUrl} target="_blank" rel="noopener noreferrer">
                                                            <ExternalLink className="w-3 h-3" /> Visit
                                                        </a>
                                                    </Button>
                                                )}
                                            </div>

                                            {job.previewUrl ? (
                                                <Button className="w-full gap-2 h-11 text-sm font-bold shadow-lg bg-primary hover:bg-primary/90" asChild>
                                                    <a href={`/review/${job.id}`} target="_blank" rel="noopener noreferrer">
                                                        <Pencil className="w-4 h-4" />
                                                        OPEN INTERACTIVE REVIEW (SCRIBBLE)
                                                    </a>
                                                </Button>
                                            ) : (
                                                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-center">
                                                    <p className="text-[10px] text-amber-600 font-medium italic">Add a project link above to enable client scribbling.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'brief' && (
                            <div className="p-6 space-y-6">
                                <section className="space-y-3">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <FileText className="w-3.5 h-3.5 text-primary" /> Project Brief & Instructions
                                    </h3>
                                    <Textarea 
                                        placeholder="Add detailed instructions, reference styles, and what to avoid..." 
                                        className="min-h-[150px] text-sm bg-secondary/10 border-border/50 resize-none"
                                        value={projectBrief}
                                        onChange={(e) => setProjectBrief(e.target.value)}
                                    />
                                </section>

                                <section className="space-y-4">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <LinkIcon className="w-3.5 h-3.5 text-primary" /> Delivery & Source Links
                                    </h3>
                                    <div className="grid gap-4">
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Raw Footage URL</p>
                                            <Input 
                                                className="bg-secondary/10 border-border/50 text-xs h-9" 
                                                placeholder="Google Drive / WeTransfer link..." 
                                                value={footageUrl}
                                                onChange={(e) => setFootageUrl(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Brand Assets / GFX</p>
                                            <Input 
                                                className="bg-secondary/10 border-border/50 text-xs h-9" 
                                                placeholder="Logos, overlays, etc..." 
                                                value={assetsUrl}
                                                onChange={(e) => setAssetsUrl(e.target.value)}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Reference Links</p>
                                            <Input 
                                                className="bg-secondary/10 border-border/50 text-xs h-9" 
                                                placeholder="YouTube / Vimeo references..." 
                                                value={referenceLinks}
                                                onChange={(e) => setReferenceLinks(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <div className="pt-4 border-t border-border/30 flex justify-end">
                                    <Button 
                                        className="gap-2 font-bold" 
                                        onClick={handleSaveBrief}
                                        disabled={isSavingBrief}
                                    >
                                        {isSavingBrief ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                                        Save Information
                                    </Button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'invoice' && (() => {
                            const base = parseFloat(basePrice) || 0;
                            const revCharge = parseFloat(perRevisionCharge) || 0;
                            const tax = parseFloat(taxPercent) || 0;
                            const revisions = job.revisionCount || 0;
                            const extraAmount = extraInvoiceItems.reduce((acc, item) => acc + (parseFloat(item.amount) || 0), 0);
                            const subtotal = base + (revCharge * revisions) + extraAmount;
                            const taxAmount = (subtotal * tax) / 100;
                            const total = subtotal + taxAmount;
                            const portalUrl = `https://editflow.entrext.in/review/${job.id}`;

                            return (
                                <div className="p-6 space-y-6">
                                    {/* Share Portal Link */}
                                    <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-3">
                                        <p className="text-[10px] font-bold text-primary uppercase tracking-widest flex items-center gap-1.5">
                                            <Share2 className="w-3 h-3" /> Client Portal Link
                                        </p>
                                        <div className="flex gap-2">
                                            <Input readOnly value={portalUrl} className="text-xs h-9 bg-secondary/10 border-border/50 font-mono" />
                                            <Button size="sm" className="h-9 gap-1.5 flex-shrink-0" variant="outline" onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success('Link copied!'); }}>
                                                <Copy className="w-3.5 h-3.5" /> Copy
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">Share this link with your client. They can view progress, approve, and request revisions.</p>
                                    </div>

                                    {/* Invoice Calculator */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                            <Receipt className="w-3.5 h-3.5 text-primary" /> Invoice Generator
                                        </h3>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Base Price (₹)</p>
                                                <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Per Revision (₹)</p>
                                                <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={perRevisionCharge} onChange={(e) => setPerRevisionCharge(e.target.value)} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">GST %</p>
                                                <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={taxPercent} onChange={(e) => setTaxPercent(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="space-y-3 pt-4 border-t border-border/20">
                                            {extraInvoiceItems.map((item, idx) => (
                                                <div key={item.id} className="flex gap-2 items-end">
                                                    <div className="flex-1 space-y-1.5">
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Item Description</p>
                                                        <Input className="bg-secondary/10 border-border/50 text-xs h-9" placeholder="E.g. Express Delivery" value={item.desc} onChange={(e) => { const newItems = [...extraInvoiceItems]; newItems[idx].desc = e.target.value; setExtraInvoiceItems(newItems); }} />
                                                    </div>
                                                    <div className="w-1/3 space-y-1.5">
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Amount (₹)</p>
                                                        <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={item.amount} onChange={(e) => { const newItems = [...extraInvoiceItems]; newItems[idx].amount = e.target.value; setExtraInvoiceItems(newItems); }} />
                                                    </div>
                                                    <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 flex-shrink-0" onClick={() => { setExtraInvoiceItems(extraInvoiceItems.filter(i => i.id !== item.id)); }}>
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button variant="outline" size="sm" className="w-full text-xs border-dashed gap-1.5" onClick={() => setExtraInvoiceItems([...extraInvoiceItems, { id: Date.now().toString(), desc: '', amount: '0' }])}>
                                                <Plus className="w-3.5 h-3.5" /> Add Custom Item
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Invoice Preview */}
                                    <div id="invoice-preview" className="rounded-xl border border-border/50 bg-white text-black p-6 space-y-4 text-sm">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <p className="text-xl font-black text-gray-900">INVOICE</p>
                                                <p className="text-xs text-gray-500">Date: {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-bold text-gray-900">{editorName}</p>
                                                <p className="text-xs text-gray-500">Video Editor</p>
                                            </div>
                                        </div>
                                        <div className="h-px bg-gray-200" />
                                        <div className="flex justify-between">
                                            <div>
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Billed To</p>
                                                <p className="font-semibold text-gray-900">{job.clientName}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-400 uppercase font-bold">Project</p>
                                                <p className="font-semibold text-gray-900">{job.title}</p>
                                            </div>
                                        </div>
                                        <div className="h-px bg-gray-200" />
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-gray-500 uppercase text-[10px]">
                                                    <th className="text-left pb-2">Description</th>
                                                    <th className="text-right pb-2">Qty</th>
                                                    <th className="text-right pb-2">Amount</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                <tr>
                                                    <td className="py-2 font-medium">Base Editing Fee</td>
                                                    <td className="py-2 text-right">1</td>
                                                    <td className="py-2 text-right font-semibold">₹{base.toLocaleString('en-IN')}</td>
                                                </tr>
                                                {revisions > 0 && (
                                                    <tr>
                                                        <td className="py-2 font-medium">Revision Rounds</td>
                                                        <td className="py-2 text-right">{revisions}</td>
                                                        <td className="py-2 text-right font-semibold">₹{(revCharge * revisions).toLocaleString('en-IN')}</td>
                                                    </tr>
                                                )}
                                                {extraInvoiceItems.map((item, idx) => {
                                                    const amt = parseFloat(item.amount) || 0;
                                                    if (!item.desc && amt === 0) return null;
                                                    return (
                                                        <tr key={item.id}>
                                                            <td className="py-2 font-medium">{item.desc || 'Custom Item'}</td>
                                                            <td className="py-2 text-right">1</td>
                                                            <td className="py-2 text-right font-semibold">₹{amt.toLocaleString('en-IN')}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        <div className="h-px bg-gray-200" />
                                        <div className="space-y-1 text-xs">
                                            <div className="flex justify-between text-gray-600">
                                                <span>Subtotal</span><span>₹{subtotal.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex justify-between text-gray-600">
                                                <span>GST ({tax}%)</span><span>₹{taxAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                            <div className="flex justify-between font-black text-base text-gray-900 pt-1 border-t border-gray-200">
                                                <span>TOTAL</span><span>₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-end">
                                        <Button className="gap-2 font-bold" onClick={() => { window.print(); }}>
                                            <Printer className="w-4 h-4" /> Print / Save as PDF
                                        </Button>
                                    </div>
                                </div>
                            );
                        })()}

                        {activeTab === 'contract' && (
                            <div className="p-6 space-y-5">
                                {contractAccepted && (
                                    <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center gap-3">
                                        <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-xs font-bold text-green-400">Contract Accepted</p>
                                            <p className="text-[10px] text-muted-foreground">Client has digitally accepted these terms.</p>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Revisions Included</p>
                                        <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={revisionsIncluded} onChange={(e) => setRevisionsIncluded(e.target.value)} />
                                    </div>
                                    <div className="space-y-1.5">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Turnaround (days)</p>
                                        <Input type="number" className="bg-secondary/10 border-border/50 text-xs h-9" value={turnaroundDays} onChange={(e) => setTurnaroundDays(e.target.value)} />
                                    </div>
                                    <div className="col-span-3 space-y-1.5">
                                        <p className="text-[10px] font-bold text-muted-foreground uppercase px-1">Payment Terms</p>
                                        <Input className="bg-secondary/10 border-border/50 text-xs h-9" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} />
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <p className="text-[10px] font-bold text-muted-foreground uppercase px-1 flex items-center justify-between">
                                        Custom Agreement Rules
                                        <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-1 px-2" onClick={() => setContractRules([...contractRules, { id: Date.now().toString(), text: '' }])}>
                                            <Plus className="w-3 h-3" /> Add Rule
                                        </Button>
                                    </p>
                                    {contractRules.map((rule, idx) => (
                                        <div key={rule.id} className="flex gap-2">
                                            <Input className="bg-secondary/10 border-border/50 text-xs h-9" value={rule.text} onChange={(e) => { const newRules = [...contractRules]; newRules[idx].text = e.target.value; setContractRules(newRules); }} placeholder="Enter rule description..." />
                                            <Button variant="ghost" size="icon" className="h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 flex-shrink-0" onClick={() => { setContractRules(contractRules.filter(r => r.id !== rule.id)); }}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                                <div className="rounded-xl border border-border/50 bg-white text-black p-6 space-y-4 text-sm">
                                    <div className="text-center space-y-1 border-b border-gray-200 pb-4">
                                        <p className="text-lg font-black text-gray-900">PROJECT AGREEMENT</p>
                                        <p className="text-xs text-gray-500">EditFlow · Professional Video Editing</p>
                                    </div>
                                    <p className="text-sm text-gray-800">This agreement is between <b>{editorName || 'the Editor'}</b> and <b>{job.clientName}</b> for the project:</p>
                                    <div className="p-3 bg-gray-50 rounded border border-gray-200">
                                        <p className="font-bold text-gray-900">{job.title}</p>
                                        <p className="text-xs text-gray-500 mt-0.5">Estimated {job.estimatedHours}h of editing</p>
                                    </div>
                                    <div className="space-y-2 text-xs text-gray-700">
                                        <p><b>1. Revisions:</b> Includes <b>{revisionsIncluded} free revision round(s)</b>. Additional revisions are charged separately.</p>
                                        <p><b>2. Turnaround:</b> Delivery within <b>{turnaroundDays} working days</b> of receiving raw footage.</p>
                                        <p><b>3. Payment:</b> {paymentTerms}. Work begins after advance payment.</p>
                                        {contractRules.map((rule, idx) => (
                                            <p key={rule.id}><b>{4 + idx}.</b> {rule.text}</p>
                                        ))}
                                    </div>
                                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 text-xs text-gray-500">
                                        <div><p className="font-bold text-gray-900">{editorName || 'Editor'}</p><p>Service Provider</p><div className="mt-6 h-px bg-gray-300 w-32" /><p className="mt-1">Signature</p></div>
                                        <div><p className="font-bold text-gray-900">{job.clientName}</p><p>Client</p><div className="mt-6 h-px bg-gray-300 w-32" /><p className="mt-1">Signature / Date</p></div>
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <Button className="gap-2 font-bold" onClick={() => window.print()}>
                                        <Printer className="w-4 h-4" /> Print Contract
                                    </Button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'chat' && (
                            <div className="flex flex-col" style={{ minHeight: '380px' }}>
                                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ minHeight: '260px' }}>
                                    {chatMessages.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground pt-12">
                                            <MessagesSquare className="w-10 h-10 opacity-20 mb-2" />
                                            <p className="text-xs">No messages yet. Start the team discussion.</p>
                                        </div>
                                    ) : (
                                        chatMessages.map((msg: any) => (
                                            <div key={msg.id} className="flex gap-3">
                                                <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0">
                                                    {(msg.sender_name || 'U')[0]}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-2 mb-0.5">
                                                        <span className="text-[10px] font-bold">{msg.sender_name || 'Editor'}</span>
                                                        <span className="text-[9px] text-muted-foreground">{msg.created_at?.toDate ? msg.created_at.toDate().toLocaleTimeString() : 'now'}</span>
                                                    </div>
                                                    <p className="text-xs bg-secondary/20 px-3 py-2 rounded-xl rounded-tl-none border border-border/30 leading-relaxed">{msg.content}</p>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="p-4 border-t border-border/30 flex gap-2">
                                    <Textarea
                                        placeholder="Message the team... (Enter to send, Shift+Enter for new line)"
                                        className="text-xs resize-none bg-secondary/10 border-border/50"
                                        style={{ minHeight: '56px' }}
                                        value={newChatMsg}
                                        onChange={(e) => setNewChatMsg(e.target.value)}
                                        onKeyDown={async (e) => {
                                            if (e.key === 'Enter' && !e.shiftKey && newChatMsg.trim()) {
                                                e.preventDefault();
                                                setSendingChat(true);
                                                try {
                                                    const sn = editors.find(ed => ed.id === job.editorId)?.name || 'Editor';
                                                    await addDoc(collection(db, 'job_chat'), { job_id: job.id, content: newChatMsg.trim(), sender_name: sn, created_at: serverTimestamp() });
                                                    setNewChatMsg('');
                                                    const q = query(collection(db, 'job_chat'), where('job_id', '==', job.id));
                                                    const snap = await getDocs(q);
                                                    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                                                    msgs.sort((a: any, b: any) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
                                                    setChatMessages(msgs);
                                                } catch (err: any) { console.error('Chat error:', err); toast.error('Failed: ' + err.message); } finally { setSendingChat(false); }
                                            }
                                        }}
                                    />
                                    <Button size="icon" className="self-end h-9 w-9" disabled={!newChatMsg.trim() || sendingChat}
                                        onClick={async () => {
                                            if (!newChatMsg.trim()) return;
                                            setSendingChat(true);
                                            try {
                                                const sn = editors.find(ed => ed.id === job.editorId)?.name || 'Editor';
                                                await addDoc(collection(db, 'job_chat'), { job_id: job.id, content: newChatMsg.trim(), sender_name: sn, created_at: serverTimestamp() });
                                                setNewChatMsg('');
                                                const q = query(collection(db, 'job_chat'), where('job_id', '==', job.id));
                                                const snap = await getDocs(q);
                                                const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                                                msgs.sort((a: any, b: any) => (a.created_at?.seconds || 0) - (b.created_at?.seconds || 0));
                                                setChatMessages(msgs);
                                            } catch (err: any) { console.error('Chat error:', err); toast.error('Failed: ' + err.message); } finally { setSendingChat(false); }
                                        }}>
                                        {sendingChat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    </Button>
                                </div>
                            </div>
                        )}

                        {activeTab === 'notes' && (
                            <div className="p-6 space-y-6 flex flex-col h-full">
                                <div className="space-y-4 flex-1 overflow-y-auto min-h-[300px]">
                                    {notes.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                                            <MessageSquare className="w-8 h-8 opacity-20 mb-2" />
                                            <p className="text-xs">No feedback notes yet.</p>
                                        </div>
                                    ) : (
                                        notes.map((note) => (
                                            <div key={note.id} className="bg-secondary/10 p-4 rounded-xl border border-border/50 space-y-3">
                                                <p className="text-sm leading-relaxed">{note.content}</p>
                                                {note.drawing_data && (
                                                    <div 
                                                        className="relative group cursor-zoom-in mt-2" 
                                                        onClick={() => window.open(note.drawing_data, '_blank')}
                                                    >
                                                        <img 
                                                            src={note.drawing_data} 
                                                            alt="Scribble screenshot" 
                                                            className="w-full max-h-40 object-cover rounded-lg bg-black/40 border border-white/10" 
                                                        />
                                                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                                                            <span className="text-[10px] text-white font-bold bg-primary px-3 py-1.5 rounded-full">View Full Snapshot</span>
                                                        </div>
                                                    </div>
                                                )}
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-2 border-t border-border/20">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {formatDistanceToNow(formatDate(note.created_at))} ago
                                                    </span>
                                                    {note.created_by === 'CLIENT' && (
                                                        <span className="bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                                                            Client Feedback
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                                <div className="space-y-2 pt-4 border-t border-border/50">
                                    <Textarea 
                                        placeholder="Add a progress update or note..." 
                                        className="text-xs resize-none bg-secondary/10 border-border/50"
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                    />
                                    <div className="flex justify-end">
                                        <Button size="sm" className="h-8 gap-1.5" onClick={handleAddNote}>
                                            <Send size={12} /> Post Note
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'history' && (
                            <div className="p-6">
                                <div className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border/50">
                                    {history.length === 0 ? (
                                        <p className="text-xs text-muted-foreground text-center">No history recorded yet.</p>
                                    ) : (
                                        history.map((event) => (
                                            <div key={event.id} className="relative pl-8 space-y-1">
                                                <div className="absolute left-0 top-1.5 w-[23px] h-[23px] rounded-full bg-[#0F1113] border border-border/50 flex items-center justify-center z-10">
                                                    <div className="w-2 h-2 rounded-full bg-primary" />
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className={`${statusColors[event.from_status as Status]} text-[8px] px-1 py-0`}>
                                                        {event.from_status}
                                                    </Badge>
                                                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                                    <Badge variant="outline" className={`${statusColors[event.to_status as Status]} text-[8px] px-1 py-0`}>
                                                        {event.to_status}
                                                    </Badge>
                                                </div>
                                                <p className="text-[10px] text-muted-foreground">
                                                    {format(formatDate(event.created_at), 'MMM d, HH:mm')} • {formatDistanceToNow(formatDate(event.created_at))} ago
                                                </p>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default JobDetailsModal;
