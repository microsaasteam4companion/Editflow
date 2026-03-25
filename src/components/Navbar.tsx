import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Menu, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import ThemeToggle from './ThemeToggle';
import { cn } from '@/lib/utils';

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        isScrolled || isMobileMenuOpen ? "glass-nav shadow-soft" : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="EditFlow logo" className="h-8 w-auto object-contain flex-shrink-0 rounded-xl" />
            <span className="font-semibold text-lg text-foreground">EditFlow</span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            <a href="/#features" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              Features
            </a>
            <a href="/#pricing" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              Pricing
            </a>
            <Link to="/blog" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              Blog
            </Link>
            <Link to="/auth" className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium">
              Login
            </Link>
            <ThemeToggle />
            <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow">
              <Link to="/planner">Start Free Trial</Link>
            </Button>
          </div>

          {/* Mobile Menu Button */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <button
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-6 border-t border-border/50 animate-fade-in bg-card/95 backdrop-blur-md min-h-[calc(100vh-4rem)]">
            <div className="flex flex-col gap-6 px-2">
              <a 
                href="/#features" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors py-2 border-b border-border/10"
              >
                Features
              </a>
              <a 
                href="/#pricing" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors py-2 border-b border-border/10"
              >
                Pricing
              </a>
              <Link 
                to="/blog" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors py-2 border-b border-border/10"
              >
                Blog
              </Link>
              <Link 
                to="/auth" 
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-semibold text-foreground hover:text-primary transition-colors py-2 border-b border-border/10"
              >
                Login
              </Link>
              <div className="pt-4">
                <Button asChild size="lg" className="bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow w-full h-12 text-base font-bold">
                  <Link to="/planner" onClick={() => setIsMobileMenuOpen(false)}>Start Free Trial</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
