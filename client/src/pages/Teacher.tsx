import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

export default function Teacher() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: status, isLoading: statusLoading } = trpc.teacher.status.useQuery();
  const { data: managedGroups = [], isLoading: groupsLoading } =
    trpc.teacher.managedGroups.useQuery(undefined, {
      enabled: Boolean(status?.hasAccess),
    });
  const { data: resources = [], isLoading: resourcesLoading } =
    trpc.teacher.resources.useQuery(undefined, {
      enabled: Boolean(status?.hasAccess),
    });

  if (statusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // 1. Pending Teacher Approval Screen
  if (status?.teacherApproval === "pending" && status.role !== "admin") {
    return (
      <div className="mx-auto max-w-2xl py-12 px-4 text-center">
        <Card className="rounded-3xl border-border/80 p-8 sm:p-12 shadow-soft bg-card/70 backdrop-blur">
          <div className="mx-auto size-16 grid place-items-center rounded-3xl bg-amber-500/10 text-amber-500 mb-6">
            <Clock className="size-8 animate-pulse" />
          </div>

          <Badge variant="outline" className="mb-3 border-amber-500/30 text-amber-600 bg-amber-50/50">
            Pending Admin Review
          </Badge>

          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
            Teacher Account Pending Approval
          </h1>

          <p className="mt-4 text-sm leading-6 text-muted-foreground text-center">
            Your registration as an educator on StudyNow is currently queued for platform administrator
            verification. While awaiting approval, you have full access to your personal note library,
            can participate in study groups, and search materials with AI.
          </p>

          <div className="mt-8 rounded-2xl border border-border/60 bg-muted/30 p-4 text-xs text-left leading-5 text-muted-foreground space-y-2">
            <p className="font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" /> What happens once approved?
            </p>
            <p>• Immediate ability to publish institutional lecture materials to classes.</p>
            <p>• Dedicated educator privileges in peer study groups.</p>
            <p>• Verified Teacher badge displayed on your public profile.</p>
          </div>

          <div className="mt-8 flex justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => setLocation("/notes")}
              className="rounded-xl text-xs font-semibold"
            >
              Open My Notes
            </Button>
            <Button
              onClick={() => setLocation("/groups")}
              className="rounded-xl text-xs font-bold shadow-lift"
            >
              Explore Study Groups
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // 2. Approved Teacher Dashboard Screen
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs font-bold uppercase tracking-wider text-primary">
            <GraduationCap className="size-4" /> Educator Workspace
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Teacher Portal</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage your academic study groups, monitor class materials, and distribute resources.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocation("/groups")}
            className="rounded-xl text-xs font-bold shadow-lift gap-1.5"
          >
            <Plus className="size-3.5" /> Create Study Group
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Managed Groups
              </span>
              <Users className="size-4 text-primary" />
            </div>
            <p className="mt-3 font-display text-3xl font-black">{managedGroups.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Study circles and class groups</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Teaching Resources
              </span>
              <FileText className="size-4 text-primary" />
            </div>
            <p className="mt-3 font-display text-3xl font-black">{resources.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Class notes and reference items</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Educator Status
              </span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <p className="mt-3 font-display text-2xl font-black text-emerald-600">Verified</p>
            <p className="text-[11px] text-muted-foreground mt-1">Full publishing permissions</p>
          </CardContent>
        </Card>
      </div>

      {/* Managed Study Groups Section */}
      <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl font-bold">
                Your Academic Study Groups
              </CardTitle>
              <CardDescription>
                Collaborative peer spaces where you hold Owner or Manager authority.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">
              {managedGroups.length} active
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {groupsLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : managedGroups.length === 0 ? (
            <div className="text-center py-10">
              <Users className="size-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-bold">No managed groups yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create a study group to share lecture notes and organize study materials with students.
              </p>
              <Button
                size="sm"
                onClick={() => setLocation("/groups")}
                className="mt-4 rounded-xl text-xs font-bold"
              >
                Create Study Group
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {managedGroups.map((grp) => (
                <div
                  key={grp.id}
                  onClick={() => setLocation("/groups")}
                  className="rounded-2xl border border-border/70 p-4 hover:border-primary/50 transition cursor-pointer bg-card/60 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-bold text-sm text-foreground truncate">{grp.name}</h3>
                      <Badge variant="secondary" className="capitalize text-[10px]">
                        {grp.myRole || "Manager"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                      {grp.description || "No description"}
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>Code: {grp.code}</span>
                    <span className="text-primary font-semibold flex items-center gap-1">
                      Manage <ExternalLink className="size-3" />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
