import React, { useState, useRef, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { 
    Sparkles, 
    X, 
    Send, 
    MessageCircle, 
    Loader2, 
    User, 
    Bot, 
    TrendingUp, 
    AlertCircle, 
    Clock,
    UserCheck,
    ChevronRight,
    Lock
} from 'lucide-react';
import { Job, Editor } from '@/hooks/usePlannerData';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface AICoPlannerProps {
    editors: Editor[];
    jobs: Job[];
    planType: 'free' | 'pro';
    onUpgrade: () => void;
}

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    type?: 'analysis' | 'suggestion' | 'text';
}

const AICoPlanner = ({ editors, jobs, planType, onUpgrade }: AICoPlannerProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'init',
            role: 'assistant',
            content: "Hello! I'm your AI Co-Planner. Ask me anything about editor workloads, project priorities, or who's available for a new task.",
            timestamp: new Date()
        }
    ]);
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isTyping]);

    const generateAIResponse = async (userQuery: string) => {
        setIsTyping(true);
        
        // Smarter Data-Aware Logic
        setTimeout(() => {
            let response = "";
            const query = userQuery.toLowerCase();
            
            // 1. Identification: Who is the user talking about?
            const mentionedEditor = editors.find(e => query.includes(e.name.toLowerCase()));
            const mentionedJob = jobs.find(j => query.includes(j.title.toLowerCase()) || query.includes(j.clientName.toLowerCase()));

            // 2. Intent Analysis & Response Generation
            if (mentionedEditor && (query.includes('work') || query.includes('task') || query.includes('assign') || query.includes('monday') || query.includes('doing'))) {
                const editorJobs = jobs.filter(j => j.editorId === mentionedEditor.id);
                
                // Day filtering
                const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
                const mentionedDayIndex = days.findIndex(d => query.includes(d));

                let filteredJobs = editorJobs;
                if (mentionedDayIndex !== -1) {
                    filteredJobs = editorJobs.filter(j => j.scheduledDate === mentionedDayIndex);
                }

                if (filteredJobs.length > 0) {
                    const dayText = mentionedDayIndex !== -1 ? ` on ${days[mentionedDayIndex]}` : "";
                    response = `I found **${filteredJobs.length} tasks** for **${mentionedEditor.name}**${dayText}:\n\n` + 
                    filteredJobs.map(j => `• **${j.title}** (${j.clientName}) - Status: ${j.status.toUpperCase()} ${j.priority === 'high' ? '🔥' : ''}`).join('\n');
                    
                    const load = (editorJobs.length / (mentionedEditor.weeklyCapacity || 5)) * 100;
                    response += `\n\n**Workload Analysis**: ${mentionedEditor.name} is currently at **${Math.round(load)}%** of their weekly capacity.`;
                } else {
                    response = `Currently, **${mentionedEditor.name}** has no tasks assigned${mentionedDayIndex !== -1 ? ` for ${days[mentionedDayIndex]}` : ""}. They are available for new assignments!`;
                }
            } 
            else if (query.includes('available') || query.includes('free') || query.match(/who.*(take|new|assign)/)) {
                const recommendations = editors.map(editor => {
                    const activeJobsCount = jobs.filter(j => 
                        j.editorId === editor.id && (['in-progress', 'review', 'revision'].includes(j.status))
                    ).length;
                    const load = editor.weeklyCapacity > 0 ? (activeJobsCount / editor.weeklyCapacity) * 100 : 0;
                    return { editor, count: activeJobsCount, load };
                }).sort((a, b) => a.load - b.load);

                const best = recommendations[0];
                response = `My recommendation for the next task is **${best.editor.name}**. \n\n**Reasoning**: \n- Current Load: **${Math.round(best.load)}%**\n- Active Projects: **${best.count}**\n- ${best.editor.name} has the most bandwidth available this week compared to others like ${recommendations.slice(1, 3).map(r => r.editor.name).join(', ')}.`;
            }
            else if (query.includes('priority') || query.includes('urgent') || query.includes('deadline')) {
                const urgent = jobs.filter(j => j.priority === 'high' && j.status !== 'approved');
                if (urgent.length > 0) {
                    response = `🚨 **Attention Needed**: There are ${urgent.length} high-priority projects:\n\n` + 
                    urgent.map(j => {
                        const ed = editors.find(e => e.id === j.editorId);
                        return `• **${j.title}** (${j.clientName}) -> Assigned to: **${ed ? ed.name : 'Unassigned'}** (Status: ${j.status})`;
                    }).join('\n');
                } else {
                    response = "No high-priority projects are currently pending. The team seems to be on track!";
                }
            }
            else if (query.includes('summary') || query.includes('total') || query.includes('stat')) {
                const stats = {
                    total: jobs.length,
                    active: jobs.filter(j => ['in-progress', 'review', 'revision'].includes(j.status)).length,
                    completed: jobs.filter(j => j.status === 'approved').length,
                    backlog: jobs.filter(j => !j.editorId).length
                };
                response = `**Team Productivity Summary**:\n\n` +
                `• Active Tasks: **${stats.active}**\n` +
                `• Unassigned / Backlog: **${stats.backlog}**\n` +
                `• Approved this week: **${stats.completed}**\n\n` +
                `Average team utilization is at **${Math.round((stats.active / (editors.length * 5)) * 100)}%**. Ready for more work?`;
            }
            else {
                response = "I'm your Planner AI. You can ask me detail questions like:\n- 'What is Komal doing on Monday?'\n- 'Who has the least workload?'\n- 'Show me all urgent projects.'\n- 'How busy is the team right now?'";
            }

            setMessages(prev => [...prev, {
                id: Date.now().toString(),
                role: 'assistant',
                content: response,
                timestamp: new Date()
            }]);
            setIsTyping(false);
        }, 1200);
    };

    const handleSend = () => {
        if (!input.trim() || isTyping) return;
        
        if (planType !== 'pro') {
            toast.error("AI Co-Planner is a Pro feature");
            onUpgrade();
            return;
        }

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        generateAIResponse(userMsg.content);
    };

    return (
        <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
            {/* Chat Window */}
            {isOpen && (
                <div className="w-[350px] sm:w-[400px] h-[500px] bg-[#0F1113] border border-border/50 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
                    {/* Header */}
                    <div className="p-4 bg-gradient-to-r from-primary/20 to-primary/5 border-b border-border/30 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-primary/20 flex items-center justify-center">
                                <Sparkles size={16} className="text-primary" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold">AI Co-Planner</h3>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Live Analysis</span>
                                </div>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5" onClick={() => setIsOpen(false)}>
                            <X size={16} />
                        </Button>
                    </div>

                    {/* Messages */}
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-secondary/5">
                        {messages.map((msg) => (
                            <div key={msg.id} className={cn(
                                "flex gap-2 max-w-[85%]",
                                msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                            )}>
                                <div className={cn(
                                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-1 overflow-hidden",
                                    msg.role === 'user' ? "bg-primary/10" : "bg-card border border-border/50"
                                )}>
                                    {msg.role === 'user' ? (
                                        <User size={12} className="text-primary" />
                                    ) : (
                                        <img src="/logo.png" alt="Bot" className="w-4 h-4 object-contain" />
                                    )}
                                </div>
                                <div className={cn(
                                    "p-3 rounded-2xl text-xs space-y-1.5 shadow-sm leading-relaxed",
                                    msg.role === 'user' ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-card border border-border/50 text-foreground/90 rounded-tl-none"
                                )}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    <span className="text-[8px] opacity-40 block">
                                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex gap-2 max-w-[80%] items-center">
                                <div className="w-6 h-6 rounded-lg bg-card border border-border/50 flex items-center justify-center">
                                    <Loader2 size={12} className="text-primary animate-spin" />
                                </div>
                                <div className="bg-card border border-border/50 p-3 rounded-2xl rounded-tl-none">
                                    <div className="flex gap-1">
                                        <div className="w-1 h-1 bg-primary/40 rounded-full animate-bounce" />
                                        <div className="w-1 h-1 bg-primary/40 rounded-full animate-bounce [animation-delay:0.2s]" />
                                        <div className="w-1 h-1 bg-primary/40 rounded-full animate-bounce [animation-delay:0.4s]" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer Input */}
                    <div className="p-4 border-t border-border/30 bg-[#0F1113]">
                        {planType === 'pro' ? (
                            <div className="flex gap-2">
                                <Input 
                                    className="bg-secondary/10 border-border/50 text-xs h-10 rounded-xl"
                                    placeholder="Ask about team workload..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                />
                                <Button size="icon" className="shrink-0 h-10 w-10 rounded-xl" onClick={handleSend}>
                                    <Send size={16} />
                                </Button>
                            </div>
                        ) : (
                            <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                    <Lock size={12} className="text-primary" />
                                    <span className="text-[10px] font-bold text-primary uppercase">Upgrade to Pro</span>
                                </div>
                                <Button size="sm" className="h-7 text-[9px] font-bold" onClick={onUpgrade}>Unlock AI</Button>
                            </div>
                        )}
                        <p className="text-[9px] text-muted-foreground text-center mt-2 opacity-50 italic">
                            Powered by EditFlow IQ Analysis
                        </p>
                    </div>
                </div>
            )}

            {/* Toggle Button */}
            <Button 
                size="icon" 
                className={cn(
                    "w-14 h-14 rounded-2xl shadow-2xl transition-all duration-300 relative group overflow-hidden",
                    isOpen ? "rotate-90 bg-card border-border hover:bg-secondary" : "bg-primary hover:bg-primary/90"
                )}
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? <X size={24} className="text-foreground" /> : (
                    <>
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                        <img src="/logo.png" alt="EditFlow AI" className="w-8 h-8 object-contain animate-pulse" />
                    </>
                )}
            </Button>
        </div>
    );
};

export default AICoPlanner;
