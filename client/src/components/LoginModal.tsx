import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { COOKIE_NAME } from "@shared/const";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, BookOpen, GraduationCap, Loader2, Shield, UserCheck } from "lucide-react";
import { toast } from "sonner";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  const [selectedRole, setSelectedRole] = useState<"student" | "teacher" | "admin">("student");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async (data) => {
      if (data.token) {
        try {
          sessionStorage.setItem("manus-cookie", `${COOKIE_NAME}=${data.token}`);
        } catch {}
      }
      utils.auth.me.setData(undefined, data.user as any);
      await utils.auth.me.invalidate();
      toast.success(`Welcome to StudyNow, ${data.user?.name || "Student"}!`);
      onOpenChange(false);
      window.location.href = "/dashboard";
    },
    onError: (err) => {
      toast.error(err.message || "Failed to sign in");
    },
  });

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const defaultName =
      selectedRole === "teacher"
        ? "Professor Smith"
        : selectedRole === "admin"
          ? "Admin User"
          : "Student Demo";

    loginMutation.mutate({
      name: name.trim() || defaultName,
      email: email.trim() || undefined,
      role: selectedRole,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl p-6 sm:p-8">
        <DialogHeader className="text-left">
          <div className="mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lift">
            <BookOpen className="size-6" />
          </div>
          <DialogTitle className="font-display text-2xl font-black tracking-tight">
            Sign In to StudyNow
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Select your role to enter the workspace portal.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Select Role
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setSelectedRole("student")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition-all ${
                  selectedRole === "student"
                    ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                    : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <GraduationCap className={`size-5 ${selectedRole === "student" ? "text-teal-dark font-bold" : "text-teal"}`} />
                <span className="text-xs font-bold text-foreground">Student</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole("teacher")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition-all ${
                  selectedRole === "teacher"
                    ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                    : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <UserCheck className={`size-5 ${selectedRole === "teacher" ? "text-coral-dark font-bold" : "text-coral"}`} />
                <span className="text-xs font-bold text-foreground">Teacher</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedRole("admin")}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3.5 text-center transition-all ${
                  selectedRole === "admin"
                    ? "border-primary bg-primary/10 text-primary shadow-sm font-bold ring-2 ring-primary/20"
                    : "border-border/80 bg-white hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <Shield className={`size-5 ${selectedRole === "admin" ? "text-blue-700 font-bold" : "text-blue-600"}`} />
                <span className="text-xs font-bold text-foreground">Admin</span>
              </button>
            </div>
          </div>

          <div className="relative my-4 flex items-center justify-center">
            <div className="w-full border-t border-border/60" />
            <span className="absolute bg-background px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Optional Details
            </span>
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="custom-name" className="text-xs font-semibold">Your Name (Optional)</Label>
              <Input
                id="custom-name"
                placeholder={selectedRole === "teacher" ? "Professor Smith" : selectedRole === "admin" ? "Admin User" : "Student Demo"}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="custom-email" className="text-xs font-semibold">Email (Optional)</Label>
              <Input
                id="custom-email"
                type="email"
                placeholder="you@college.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="mt-2 h-11 w-full rounded-xl font-bold shadow-lift"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Entering Workspace...
              </>
            ) : (
              <>
                Enter Workspace as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
                <ArrowRight className="ml-2 size-4" />
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
