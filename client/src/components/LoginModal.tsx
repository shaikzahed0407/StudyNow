import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  GraduationCap,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  Shield,
  Sparkles,
  User,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

interface LoginModalProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  isEmbedded?: boolean;
  showBackButton?: boolean;
}

export function LoginModal({
  open = false,
  onOpenChange,
  isEmbedded = false,
  showBackButton = true,
}: LoginModalProps) {
  const utils = trpc.useUtils();

  // Active main tab: "account" (Supabase Auth) vs "demo" (1-Click Local Demo)
  const [activeTab, setActiveTab] = useState<"account" | "demo">("account");

  // Email auth mode: "signin" vs "signup"
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [emailAuthLoading, setEmailAuthLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authRole, setAuthRole] = useState<"student" | "teacher">("student");

  // Google OAuth loading state
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // 1-Click Demo state
  const [demoRole, setDemoRole] = useState<"student" | "teacher" | "admin">("student");
  const [demoName, setDemoName] = useState("");
  const [demoEmail, setDemoEmail] = useState("");

  const exchangeSupabaseMutation = trpc.auth.exchangeSupabase.useMutation();

  const demoLoginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.token) {
        try {
          sessionStorage.setItem("studynow-token", data.token);
        } catch {}
      }
      utils.auth.me.setData(undefined, data.user as any);
      await utils.auth.me.invalidate();
      await utils.auth.listAccounts.invalidate();
      toast.success(`Welcome to StudyNow, ${data.user?.name || "Student"}!`);
      onOpenChange?.(false);
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sign in");
    },
  });

  const handleDemoSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const defaultName =
      demoRole === "teacher"
        ? "Professor Smith"
        : demoRole === "admin"
          ? "System Administrator"
          : "Demo Student";

    demoLoginMutation.mutate({
      name: demoName.trim() || defaultName,
      email: demoEmail.trim() || undefined,
      role: demoRole,
    });
  };

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      toast.error("Supabase is not configured. Check your .env file.");
      return;
    }

    if (!email.trim() || !password) {
      toast.error("Please enter both email and password.");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    setEmailAuthLoading(true);

    try {
      if (authMode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        if (data.session?.access_token) {
          try {
            const res = await exchangeSupabaseMutation.mutateAsync({
              supabaseToken: data.session.access_token,
            });
            if (res?.token) {
              sessionStorage.setItem("studynow-token", res.token);
              utils.auth.me.setData(undefined, res.user as any);
            }
          } catch {
            sessionStorage.setItem("studynow-token", data.session.access_token);
          }
          await utils.auth.me.invalidate();
          await utils.auth.listAccounts.invalidate();
          toast.success("Signed in successfully!");
          onOpenChange?.(false);
          window.location.href = "/dashboard";
        }
      } else {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name: fullName.trim() || "Student",
              role: authRole,
            },
          },
        });

        if (error) {
          toast.error(error.message);
          return;
        }

        if (data.session?.access_token) {
          try {
            const res = await exchangeSupabaseMutation.mutateAsync({
              supabaseToken: data.session.access_token,
            });
            if (res?.token) {
              sessionStorage.setItem("studynow-token", res.token);
              utils.auth.me.setData(undefined, res.user as any);
            }
          } catch {
            sessionStorage.setItem("studynow-token", data.session.access_token);
          }
          await utils.auth.me.invalidate();
          await utils.auth.listAccounts.invalidate();
          toast.success("Account created successfully! Welcome to StudyNow.");
          onOpenChange?.(false);
          window.location.href = "/dashboard";
        } else if (data.user) {
          // Confirmation email sent
          toast.success(
            "Account registered! Please check your email to confirm your account (or disable email confirmation in Supabase Dashboard -> Authentication -> Email).",
            { duration: 8000 }
          );
          setAuthMode("signin");
        }
      }
    } catch (err: any) {
      toast.error(err?.message || "Authentication failed");
    } finally {
      setEmailAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      toast.info(
        "Google Sign-In uses Supabase Auth. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env to enable Google OAuth. Use the 1-Click Demo roles below to test immediately!",
        { duration: 6000 }
      );
      return;
    }

    try {
      setIsGoogleLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });

      if (error) {
        toast.error(`Google login failed: ${error.message}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to initialize Google login");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const formContent = (
    <>
      <div className="text-left mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lift">
            <BookOpen className="size-6" />
          </div>
          {showBackButton && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                window.location.href = "/";
              }}
              className="h-8 px-2.5 rounded-xl text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-xs font-semibold border border-border/60 hover:bg-muted transition-colors"
              title="Back to introduction page"
            >
              <ArrowLeft className="size-3.5" />
              <span>Back</span>
            </Button>
          )}
        </div>
        <h2 className="font-display text-2xl font-black tracking-tight text-foreground">
          Enter StudyNow
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Sign in with your email account, Google, or use an instant demo role.
        </p>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "account" | "demo")}
        className="mt-3 w-full"
      >
          <TabsList className="grid w-full grid-cols-2 rounded-xl h-10 p-1 bg-muted/60">
            <TabsTrigger
              value="account"
              className="rounded-lg font-bold text-xs flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Mail className="size-3.5" /> Email & Supabase
            </TabsTrigger>
            <TabsTrigger
              value="demo"
              className="rounded-lg font-bold text-xs flex items-center gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-sm"
            >
              <Sparkles className="size-3.5 text-coral" /> 1-Click Demo
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Supabase Email & Password Auth */}
          <TabsContent value="account" className="mt-4 space-y-4">
            {/* Google Sign-in button */}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleLogin}
                disabled={isGoogleLoading || emailAuthLoading}
                className="w-full h-10 rounded-xl font-semibold border-border/80 bg-white hover:bg-muted/40 text-foreground flex items-center justify-center gap-2 shadow-sm"
              >
                {isGoogleLoading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <svg className="size-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                Continue with Google
              </Button>
            </div>

            <div className="relative my-2 flex items-center justify-center">
              <div className="w-full border-t border-border/60" />
              <span className="absolute bg-background px-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Or with email
              </span>
            </div>

            {/* Switch between Sign in and Sign up */}
            <div className="flex rounded-lg bg-muted/40 p-1 text-xs">
              <button
                type="button"
                onClick={() => setAuthMode("signin")}
                className={`flex-1 py-1.5 rounded-md font-bold transition-all ${
                  authMode === "signin"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`flex-1 py-1.5 rounded-md font-bold transition-all ${
                  authMode === "signup"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create Account
              </button>
            </div>

            <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
              {authMode === "signup" && (
                <>
                  <div>
                    <Label htmlFor="full-name" className="text-xs font-semibold">
                      Full Name
                    </Label>
                    <div className="relative mt-1">
                      <User className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                      <Input
                        id="full-name"
                        type="text"
                        placeholder="e.g. Alex Rivera"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="pl-9 h-9 rounded-xl"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">I am joining as</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setAuthRole("student")}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                          authRole === "student"
                            ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                            : "border-border/80 bg-white hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <GraduationCap className="size-4 text-teal" />
                        Student
                      </button>
                      <button
                        type="button"
                        onClick={() => setAuthRole("teacher")}
                        className={`flex items-center justify-center gap-1.5 rounded-xl border p-2 text-center text-xs font-bold transition-all ${
                          authRole === "teacher"
                            ? "border-primary bg-primary/10 text-primary ring-2 ring-primary/20"
                            : "border-border/80 bg-white hover:bg-muted/30 text-muted-foreground"
                        }`}
                      >
                        <UserCheck className="size-4 text-coral" />
                        Teacher
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="auth-email" className="text-xs font-semibold">
                  Email Address
                </Label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="auth-email"
                    type="email"
                    placeholder="student@university.edu"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 h-9 rounded-xl"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="auth-password" className="text-xs font-semibold">
                  Password
                </Label>
                <div className="relative mt-1">
                  <Lock className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
                  <Input
                    id="auth-password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 h-9 rounded-xl"
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="mt-2 h-10 w-full rounded-xl font-bold shadow-lift"
                disabled={emailAuthLoading || isGoogleLoading}
              >
                {emailAuthLoading ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {authMode === "signin" ? "Signing In..." : "Creating Account..."}
                  </>
                ) : (
                  <>
                    {authMode === "signin" ? "Sign In to StudyNow" : "Create My Account"}
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </form>
          </TabsContent>

          {/* Tab 2: 1-Click Instant Demo */}
          <TabsContent value="demo" className="mt-4 space-y-4">
            <form onSubmit={handleDemoSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Select Demo Role
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDemoRole("student")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      demoRole === "student"
                        ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                        : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <GraduationCap className="size-5 text-teal" />
                    <span className="text-xs font-bold text-foreground">Student</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoRole("teacher")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      demoRole === "teacher"
                        ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                        : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <UserCheck className="size-5 text-coral" />
                    <span className="text-xs font-bold text-foreground">Teacher</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDemoRole("admin")}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-all ${
                      demoRole === "admin"
                        ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                        : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                    }`}
                  >
                    <Shield className="size-5 text-blue-600" />
                    <span className="text-xs font-bold text-foreground">Admin</span>
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <Label htmlFor="custom-name" className="text-xs font-semibold">
                    Display Name (Optional)
                  </Label>
                  <Input
                    id="custom-name"
                    placeholder={
                      demoRole === "teacher"
                        ? "Professor Smith"
                        : demoRole === "admin"
                          ? "System Administrator"
                          : "Demo Student"
                    }
                    value={demoName}
                    onChange={(e) => setDemoName(e.target.value)}
                    className="mt-1 h-9 rounded-xl"
                  />
                </div>
                <div>
                  <Label htmlFor="custom-email" className="text-xs font-semibold">
                    Email (Optional)
                  </Label>
                  <Input
                    id="custom-email"
                    type="email"
                    placeholder="you@college.edu"
                    value={demoEmail}
                    onChange={(e) => setDemoEmail(e.target.value)}
                    className="mt-1 h-9 rounded-xl"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="mt-2 h-10 w-full rounded-xl font-bold shadow-lift"
                disabled={demoLoginMutation.isPending || isGoogleLoading}
              >
                {demoLoginMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Entering Workspace...
                  </>
                ) : (
                  <>
                    Enter as {demoRole.charAt(0).toUpperCase() + demoRole.slice(1)}
                    <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
    </>
  );

  if (isEmbedded) {
    return (
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card p-6 sm:p-8 shadow-soft">
        {formContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Enter StudyNow</DialogTitle>
        <DialogDescription className="sr-only">
          Sign in with your email account, Google, or use an instant demo role.
        </DialogDescription>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
