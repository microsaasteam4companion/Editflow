import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';
import { Button } from './ui/button';
import { Pencil, Eraser, Trash2, Undo, Type } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ReviewCanvasProps {
  onSave?: (dataUrl: string) => void;
  jobId?: string;
}

export interface ReviewCanvasHandle {
  getCanvasData: () => string;
  clear: () => void;
}

const ReviewCanvas = forwardRef<ReviewCanvasHandle, ReviewCanvasProps>(({ onSave, jobId }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#facc15'); // default yellow
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState<'pencil' | 'eraser' | 'text'>('pencil');
  const [history, setHistory] = useState<ImageData[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [textPos, setTextPos] = useState({ x: 0, y: 0 });
  const [inputText, setInputText] = useState('');

  useImperativeHandle(ref, () => ({
    getCanvasData: () => {
      return canvasRef.current?.toDataURL('image/png') || '';
    },
    clear: () => {
      clear();
    }
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        const currentData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
        ctx.putImageData(currentData, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Load from local storage
    if (jobId) {
      const saved = localStorage.getItem(`review_draft_${jobId}`);
      if (saved) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0);
        img.src = saved;
      }
    }

    return () => window.removeEventListener('resize', resizeCanvas);
  }, [jobId]);

  // Save to local storage on every draw/change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !jobId) return;

    const saveToLocal = () => {
      localStorage.setItem(`review_draft_${jobId}`, canvas.toDataURL());
    };

    // Debounced save
    const timeout = setTimeout(saveToLocal, 1000);
    return () => clearTimeout(timeout);
  }, [history, isTyping, jobId]);

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if (tool === 'text') {
      const pos = getPos(e);
      // Adjust for possible scroll or offset
      setTextPos(pos);
      setIsTyping(true);
      setInputText(''); // Reset on new click
      return;
    }
    startDrawing(e);
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setHistory(prev => [...prev.slice(-10), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    setIsDrawing(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || tool === 'text') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pos = getPos(e);
    ctx.strokeStyle = tool === 'eraser' ? 'rgba(0,0,0,1)' : color; 
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 4 : lineWidth;
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const handlePlaceText = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && inputText.trim()) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      setHistory(prev => [...prev.slice(-10), ctx.getImageData(0, 0, canvas.width, canvas.height)]);
      
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = color;
      ctx.font = 'bold 20px Inter, sans-serif';
      ctx.fillText(inputText, textPos.x, textPos.y);
      
      setInputText('');
      setIsTyping(false);
    } else if (e.key === 'Escape') {
      setIsTyping(false);
      setInputText('');
    }
  };

  const getPos = (e: any) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHistory([]);
    if (jobId) {
      localStorage.removeItem(`review_draft_${jobId}`);
    }
  };

  const undo = () => {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const last = history[history.length - 1];
    ctx.putImageData(last, 0, 0);
    setHistory(prev => prev.slice(0, -1));
  };

  return (
    <div className="relative w-full h-full flex flex-col group">
      {/* Tool Hint */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none z-40">
        <div className="bg-black/60 backdrop-blur-sm text-white/70 text-[9px] px-3 py-1 rounded-full border border-white/5 flex items-center gap-2">
           {tool === 'pencil' && "Scribble on the design"}
           {tool === 'text' && "Click anywhere to type"}
           {tool === 'eraser' && "Rub to erase scribbles"}
        </div>
      </div>

      {/* Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 p-2 bg-background/90 backdrop-blur-md border border-border/50 rounded-full shadow-xl transition-opacity z-50">
        <Button 
          variant={tool === 'pencil' ? 'default' : 'ghost'} 
          size="sm" 
          className={cn("rounded-full w-8 h-8 p-0", tool === 'pencil' && "shadow-lg shadow-primary/20")}
          onClick={() => setTool('pencil')}
        >
          <Pencil size={14} />
        </Button>
        <Button 
          variant={tool === 'text' ? 'default' : 'ghost'} 
          size="sm" 
          className={cn("rounded-full w-8 h-8 p-0", tool === 'text' && "shadow-lg shadow-primary/20")}
          onClick={() => { setTool('text'); setIsTyping(false); }}
        >
          <Type size={14} />
        </Button>
        <Button 
          variant={tool === 'eraser' ? 'default' : 'ghost'} 
          size="sm" 
          className={cn("rounded-full w-8 h-8 p-0", tool === 'eraser' && "shadow-lg shadow-primary/20")}
          onClick={() => setTool('eraser')}
        >
          <Eraser size={14} />
        </Button>
        <div className="w-px h-4 bg-border mx-1" />
        <div className="flex gap-1">
          {['#facc15', '#ef4444', '#3b82f6', '#22c55e', '#ffffff'].map(c => (
            <button 
              key={c}
              className={`w-4 h-4 rounded-full border border-white/20 ${color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => { setColor(c); if(tool === 'eraser') setTool('pencil'); }}
            />
          ))}
        </div>
        <div className="w-px h-4 bg-border mx-1" />
        <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0" onClick={undo} disabled={history.length === 0}>
          <Undo size={14} />
        </Button>
        <Button variant="ghost" size="sm" className="rounded-full w-8 h-8 p-0 text-destructive hover:text-destructive" onClick={clear}>
          <Trash2 size={14} />
        </Button>
      </div>

      {isTyping && (
        <>
          {/* Animated Cursor */}
          <div 
            className="absolute z-[60] w-px h-6 bg-primary animate-pulse pointer-events-none"
            style={{ left: textPos.x, top: textPos.y - 12 }}
          />
          <div 
            className="absolute z-50 bg-background/95 backdrop-blur-sm border border-primary/50 p-2 rounded-lg shadow-2xl flex flex-col gap-1 min-w-[200px]"
            style={{ left: textPos.x, top: textPos.y - 60 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter">Adding Text</span>
              <span className="text-[8px] bg-primary/20 text-primary px-1.5 py-0.5 rounded">Enter to Save</span>
            </div>
            <input 
              autoFocus
              className="bg-secondary/20 border-none outline-none text-sm text-foreground w-full p-2 rounded border-border"
              placeholder="What's your feedback?"
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={handlePlaceText}
              onBlur={() => { if(!inputText.trim()) setIsTyping(false); }}
            />
          </div>
        </>
      )}

      <canvas
        ref={canvasRef}
        className={cn(
          "flex-1 touch-none",
          tool === 'text' ? 'cursor-text' : 'cursor-crosshair'
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={handleMouseDown}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
      />
    </div>
  );
});

ReviewCanvas.displayName = 'ReviewCanvas';

export default ReviewCanvas;
