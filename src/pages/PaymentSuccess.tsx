import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { CheckCircle2, PartyPopper, Timer, Check, Loader2, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";

const PaymentSuccess = () => {
    const { user, loading } = useAuth();
    const [activating, setActivating] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (loading) return;
        
        if (!user) {
            setActivating(false);
            return;
        }

        const activatePro = async () => {
            try {
                await updateDoc(doc(db, 'profiles', user.uid), {
                    plan_type: 'pro',
                    pro_activated_at: new Date().toISOString()
                });
                setActivating(false);
            } catch (err) {
                console.error("Error activating pro:", err);
                setError(true);
                setActivating(false);
            }
        };

        activatePro();
    }, [user, loading]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="flex justify-center">
                    <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center animate-bounce">
                        <PartyPopper className="w-10 h-10 text-success" />
                    </div>
                </div>

                <h1 className="text-3xl font-bold text-foreground">
                    {activating ? "Activating Pro..." : error ? "Activation Issue" : "Payment Successful!"}
                </h1>

                <div className="bg-card border border-border rounded-xl p-6 space-y-4 shadow-sm text-left">
                    {activating ? (
                        <div className="flex items-center gap-3">
                            <Loader2 className="w-5 h-5 text-primary flex-shrink-0 animate-spin" />
                            <span className="text-muted-foreground font-medium">Updating your account...</span>
                        </div>
                    ) : error ? (
                        <div className="flex items-center gap-3">
                            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
                            <span className="text-foreground font-medium">Something went wrong. Please contact support.</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
                                <span className="text-foreground font-medium">Welcome to EditFlow Pro</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <Check className="w-5 h-5 text-success flex-shrink-0" />
                                <span className="text-muted-foreground">Your account is fully activated.</span>
                            </div>
                        </>
                    )}
                </div>

                <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                    {activating 
                        ? "Please wait a moment while we unlock your premium features."
                        : error 
                            ? "Your payment was successful but we couldn't update your account automatically."
                            : "You now have access to AI Scheduling, Analytics, Invoices, Contracts, and more!"}
                </p>

                <div className="pt-4">
                    <Button asChild size="lg" className="w-full bg-primary text-primary-foreground hover:bg-primary/90 shadow-glow">
                        <Link to="/planner">Go to Planner</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccess;
