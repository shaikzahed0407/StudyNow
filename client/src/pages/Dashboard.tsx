import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  FileText,
  Folder,
  GraduationCap,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { Link } from "wouter";

const roleLabel = (role?: string | null) =>
  role === "admin" ? "Administrator" : role === "teacher" ? "Educator" : "Student";

export default function Dashboard() {
  const { user } = useAuth();
  const { data, isLoading } = trpc.dashboard.summary.useQuery();

  const isTeacher = user?.role === "teacher";
  const isAdmin = user?.role === "admin";

  const collections = data?.collections || [];
  const notes = data?.notes || [];
  const groups = data?.groups || [];

  return (
    <div className="mx-auto max-w-[1320px] space-y-8">
      {/* Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 p-6 sm:p-8 lg:p-10 shadow-soft backdrop-blur">
        <div className="absolute -right-12 -top-20 size-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-0 right-24 size-36 rounded-full bg-accent/20 blur-3xl" />

        <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-primary">
              <span className="size-2 rounded-full bg-primary" /> {roleLabel(user?.role)} Workspace
            </div>
            <h1 className="font-display text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl">
              Welcome back, {user?.name?.split(" ")[0] || "Scholar"}.
            </h1>
            <p className="mt-2.5 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
              Your decentralized knowledge hub is ready. Organize your personal note library, share materials
              with chat-free study circles, and ask grounded study questions.
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Link href="/notes">
              <Button className="rounded-xl font-bold shadow-lift gap-1.5">
                <FileText className="size-4" /> Open My Notes
              </Button>
            </Link>
            <Link href="/groups">
              <Button variant="outline" className="rounded-xl font-semibold gap-1.5">
                <Users className="size-4" /> Study Groups
              </Button>
            </Link>
            <Link href="/ask">
              <Button variant="secondary" className="rounded-xl font-bold gap-1.5">
                <Sparkles className="size-4 text-primary" /> Ask AI
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Metrics Row */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Personal Collections
              </p>
              <div className="mt-1 font-display text-3xl font-black">
                {isLoading ? <Skeleton className="h-9 w-12" /> : collections.length}
              </div>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-primary/10 text-primary">
              <Folder className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Stored Notes
              </p>
              <div className="mt-1 font-display text-3xl font-black">
                {isLoading ? <Skeleton className="h-9 w-12" /> : notes.length}
              </div>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-teal/10 text-teal-dark">
              <FileText className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Study Groups
              </p>
              <div className="mt-1 font-display text-3xl font-black">
                {isLoading ? <Skeleton className="h-9 w-12" /> : groups.length}
              </div>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-coral/10 text-coral-dark">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="flex items-center justify-between p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
                System Status
              </p>
              <div className="mt-1 font-display text-2xl font-black text-emerald-600">Active</div>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Main Two-Column Layout */}
      <section className="grid gap-6 lg:grid-cols-12">
        {/* Left: Collections Overview */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="rounded-3xl border-border/70 shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Organization
                </p>
                <CardTitle className="font-display text-xl font-bold mt-0.5">
                  Personal Collections
                </CardTitle>
              </div>
              <Link href="/notes">
                <Button variant="ghost" size="sm" className="rounded-xl text-xs font-semibold gap-1">
                  View all <ArrowRight className="size-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-14 w-full rounded-2xl" />
                  <Skeleton className="h-14 w-full rounded-2xl" />
                </div>
              ) : collections.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border/70 rounded-2xl bg-card/40">
                  <Folder className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-bold text-foreground">No custom collections yet</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">
                    Group your study notes by course, exam, or research topic in your Note Library.
                  </p>
                  <Link href="/notes">
                    <Button size="sm" className="mt-3 rounded-xl text-xs font-bold">
                      <Plus className="size-3 mr-1" /> Create Collection
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {collections.slice(0, 6).map((col) => (
                    <Link key={col.id} href="/notes">
                      <div className="group rounded-2xl border border-border/60 bg-card/60 p-3.5 hover:border-primary/40 hover:bg-muted/40 transition cursor-pointer flex items-center justify-between">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className="size-3 rounded-full shrink-0"
                            style={{ backgroundColor: col.color || "#3B82F6" }}
                          />
                          <span className="font-bold text-xs truncate text-foreground group-hover:text-primary transition-colors">
                            {col.name}
                          </span>
                        </div>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {col.noteCount} notes
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Recent Notes */}
        <div className="lg:col-span-6 space-y-4">
          <Card className="rounded-3xl border-border/70 shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Recent Activity
                </p>
                <CardTitle className="font-display text-xl font-bold mt-0.5">
                  Latest Study Notes
                </CardTitle>
              </div>
              <Link href="/notes">
                <Button variant="ghost" size="sm" className="rounded-xl text-xs font-semibold gap-1">
                  Manage notes <ArrowRight className="size-3" />
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full rounded-2xl" />
                  <Skeleton className="h-12 w-full rounded-2xl" />
                </div>
              ) : notes.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-border/70 rounded-2xl bg-card/40">
                  <FileText className="size-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-xs font-bold text-foreground">No notes stored yet</p>
                  <p className="text-[11px] text-muted-foreground mt-1 max-w-xs mx-auto">
                    Start uploading textbook chapters, lecture slides, or writing summaries.
                  </p>
                  <Link href="/notes">
                    <Button size="sm" className="mt-3 rounded-xl text-xs font-bold">
                      <Plus className="size-3 mr-1" /> Add Your First Note
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {notes.slice(0, 5).map((note) => (
                    <Link key={note.id} href="/notes">
                      <div className="group rounded-2xl border border-border/60 bg-card/60 p-3 hover:border-primary/40 hover:bg-muted/40 transition cursor-pointer flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                            <FileText className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-xs truncate text-foreground group-hover:text-primary transition-colors">
                              {note.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {new Date(note.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider shrink-0">
                          {note.kind === "file" ? "Document" : "Text"}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
