import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Edit2,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  Layers,
  Loader2,
  MoreVertical,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

// ── Status helpers ──────────────────────────────────────────────────────────
const statusMeta = {
  draft: {
    label: "Draft",
    icon: Clock,
    badge: "outline" as const,
    className: "text-amber-600 border-amber-400/40 bg-amber-50/50",
  },
  published: {
    label: "Published",
    icon: CheckCircle2,
    badge: "outline" as const,
    className: "text-emerald-600 border-emerald-400/40 bg-emerald-50/50",
  },
  unpublished: {
    label: "Unpublished",
    icon: EyeOff,
    badge: "outline" as const,
    className: "text-muted-foreground border-border",
  },
};

// ── Main component ──────────────────────────────────────────────────────────
export default function Teacher() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();

  // ── Server data ────────────────────────────────────────────────────────
  const { data: status, isLoading: statusLoading } = trpc.teacher.status.useQuery();
  const hasAccess = Boolean(status?.hasAccess);

  const { data: managedGroups = [], isLoading: groupsLoading } =
    trpc.teacher.managedGroups.useQuery(undefined, { enabled: hasAccess });

  const { data: myClasses = [], isLoading: classesLoading } =
    trpc.teacher.classes.useQuery(undefined, { enabled: hasAccess });

  const { data: resources = [], isLoading: resourcesLoading } =
    trpc.teacher.resources.useQuery(undefined, { enabled: hasAccess });

  // Teacher's own notes (to pick from when creating a resource)
  const { data: myNotes = [] } = trpc.notes.list.useQuery(
    { filter: "all" },
    { enabled: hasAccess },
  );

  // ── Dialog state ───────────────────────────────────────────────────────
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // Create form
  const [newClassId, setNewClassId] = useState("");
  const [newNoteId, setNewNoteId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newStatus, setNewStatus] = useState<"draft" | "published">("draft");

  // Edit form (replace resource note + metadata)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNoteId, setEditNoteId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ── Mutations ──────────────────────────────────────────────────────────
  const createMutation = trpc.teacher.createResource.useMutation({
    onSuccess: () => {
      toast.success(
        newStatus === "published"
          ? "Resource published to class!"
          : "Resource saved as draft.",
      );
      setCreateOpen(false);
      resetCreateForm();
      utils.teacher.resources.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const replaceMutation = trpc.teacher.replaceResource.useMutation({
    onSuccess: () => {
      toast.success("Resource updated.");
      setEditOpen(false);
      setEditingId(null);
      utils.teacher.resources.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const setStatusMutation = trpc.teacher.setStatus.useMutation({
    onSuccess: (_, vars) => {
      const label =
        vars.status === "published"
          ? "Resource published to students."
          : vars.status === "unpublished"
            ? "Resource unpublished."
            : "Resource moved to drafts.";
      toast.success(label);
      utils.teacher.resources.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Helpers ────────────────────────────────────────────────────────────
  const resetCreateForm = () => {
    setNewClassId("");
    setNewNoteId("");
    setNewTitle("");
    setNewDescription("");
    setNewStatus("draft");
  };

  const openEdit = (res: (typeof resources)[0]) => {
    setEditingId(res.id);
    setEditTitle(res.title);
    setEditDescription(res.description || "");
    setEditNoteId(String(res.noteId));
    setEditOpen(true);
  };

  const handleCreate = () => {
    if (!newClassId || !newNoteId || !newTitle.trim()) return;
    const selectedClass = myClasses.find((c) => String(c.id) === newClassId);
    if (!selectedClass) return;
    createMutation.mutate({
      classId: Number(newClassId),
      subjectId: selectedClass.subjectId,
      noteId: Number(newNoteId),
      title: newTitle.trim(),
      description: newDescription.trim() || undefined,
      status: newStatus,
    });
  };

  const handleEdit = () => {
    if (!editingId || !editNoteId || !editTitle.trim()) return;
    replaceMutation.mutate({
      resourceId: editingId,
      noteId: Number(editNoteId),
      title: editTitle.trim(),
      description: editDescription.trim() || undefined,
    });
  };

  const readyNotes = myNotes.filter(
    (n) => !n.isTrash && n.processingStatus === "ready",
  );

  // ── Loading ────────────────────────────────────────────────────────────
  if (statusLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  // ── Pending approval screen ────────────────────────────────────────────
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

  // ── Approved teacher dashboard ─────────────────────────────────────────
  const publishedCount = resources.filter((r) => r.status === "published").length;
  const draftCount = resources.filter((r) => r.status === "draft").length;

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
            Manage your academic study groups, publish class materials, and distribute resources.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => setLocation("/groups")}
            variant="outline"
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <Users className="size-3.5" /> My Groups
          </Button>
          <Button
            onClick={() => { resetCreateForm(); setCreateOpen(true); }}
            className="rounded-xl text-xs font-bold shadow-lift gap-1.5"
          >
            <Plus className="size-3.5" /> Publish Resource
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Groups</span>
              <Users className="size-4 text-primary" />
            </div>
            <p className="mt-3 font-display text-3xl font-black">{managedGroups.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Managed study circles</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Classes</span>
              <BookOpen className="size-4 text-primary" />
            </div>
            <p className="mt-3 font-display text-3xl font-black">{myClasses.length}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Assigned by admin</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Published</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
            <p className="mt-3 font-display text-3xl font-black text-emerald-600">{publishedCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Live to students</p>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Drafts</span>
              <FileText className="size-4 text-amber-500" />
            </div>
            <p className="mt-3 font-display text-3xl font-black text-amber-600">{draftCount}</p>
            <p className="text-[11px] text-muted-foreground mt-1">Not yet published</p>
          </CardContent>
        </Card>
      </div>

      {/* Teaching Resources Section */}
      <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
                <UploadCloud className="size-5 text-primary" /> Teaching Resources
              </CardTitle>
              <CardDescription className="mt-1">
                Notes you have published or saved as draft for your assigned classes.
              </CardDescription>
            </div>
            <Button
              size="sm"
              onClick={() => { resetCreateForm(); setCreateOpen(true); }}
              className="rounded-xl text-xs font-bold gap-1.5 shadow-lift"
            >
              <Plus className="size-3.5" /> New Resource
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {resourcesLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : resources.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <div className="mx-auto size-14 grid place-items-center rounded-2xl bg-primary/5 text-primary/50">
                <UploadCloud className="size-7" />
              </div>
              <p className="text-sm font-bold">No resources published yet</p>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Pick one of your notes and publish it to a class. Students enrolled in that class will immediately gain access.
              </p>
              <Button
                size="sm"
                onClick={() => { resetCreateForm(); setCreateOpen(true); }}
                className="mt-2 rounded-xl text-xs font-bold"
              >
                <Plus className="size-3.5 mr-1.5" /> Publish First Resource
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {resources.map((res) => {
                const meta = statusMeta[res.status as keyof typeof statusMeta] || statusMeta.draft;
                const StatusIcon = meta.icon;
                return (
                  <div
                    key={res.id}
                    className="rounded-2xl border border-border/70 p-4 bg-card/60 hover:border-primary/40 transition-colors flex flex-col justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0 mt-0.5">
                          <FileText className="size-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold line-clamp-1">{res.title}</p>
                          {res.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{res.description}</p>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon" variant="ghost" className="size-7 rounded-lg shrink-0">
                              <MoreVertical className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 rounded-xl">
                            <DropdownMenuItem
                              className="text-xs gap-2"
                              onClick={() => openEdit(res)}
                            >
                              <Edit2 className="size-3.5" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {res.status !== "published" && (
                              <DropdownMenuItem
                                className="text-xs gap-2 text-emerald-600 focus:text-emerald-600"
                                onClick={() =>
                                  setStatusMutation.mutate({ resourceId: res.id, status: "published" })
                                }
                              >
                                <Send className="size-3.5" /> Publish to Class
                              </DropdownMenuItem>
                            )}
                            {res.status === "published" && (
                              <DropdownMenuItem
                                className="text-xs gap-2"
                                onClick={() =>
                                  setStatusMutation.mutate({ resourceId: res.id, status: "unpublished" })
                                }
                              >
                                <EyeOff className="size-3.5" /> Unpublish
                              </DropdownMenuItem>
                            )}
                            {res.status !== "draft" && (
                              <DropdownMenuItem
                                className="text-xs gap-2"
                                onClick={() =>
                                  setStatusMutation.mutate({ resourceId: res.id, status: "draft" })
                                }
                              >
                                <FileText className="size-3.5" /> Move to Draft
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/40">
                      <Badge variant={meta.badge} className={`text-[10px] rounded-full px-2 ${meta.className}`}>
                        <StatusIcon className="size-2.5 mr-1" />
                        {meta.label}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(res.updatedAt || res.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assigned Classes */}
      <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
                <Layers className="size-5 text-primary" /> Assigned Classes
              </CardTitle>
              <CardDescription className="mt-1">
                Classes the administrator has assigned you to teach.
              </CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">{myClasses.length} assigned</Badge>
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {classesLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : myClasses.length === 0 ? (
            <div className="text-center py-8">
              <ShieldAlert className="size-9 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-bold">No classes assigned yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Contact your platform administrator to be assigned to a class before publishing resources.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {myClasses.map((cls) => (
                <div
                  key={cls.id}
                  className="rounded-2xl border border-border/70 bg-card/60 p-4 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                      <BookOpen className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold line-clamp-1">{cls.name}</p>
                      {cls.term && (
                        <p className="text-[11px] text-muted-foreground">{cls.term}</p>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs rounded-lg px-2.5 gap-1"
                      onClick={() => {
                        resetCreateForm();
                        setNewClassId(String(cls.id));
                        setCreateOpen(true);
                      }}
                    >
                      <Plus className="size-3" /> Publish Note
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Managed Study Groups */}
      <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
        <CardHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-display text-xl font-bold">Your Study Groups</CardTitle>
              <CardDescription>Collaborative peer spaces where you hold Owner or Manager authority.</CardDescription>
            </div>
            <Badge variant="outline" className="rounded-full">{managedGroups.length} active</Badge>
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

      {/* ── Create Resource Dialog ──────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold flex items-center gap-2">
              <UploadCloud className="size-5 text-primary" /> Publish a Resource
            </DialogTitle>
            <DialogDescription>
              Pick one of your notes and publish it to a class. Students in that class will gain access immediately upon publishing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Class selector */}
            <div className="space-y-1.5">
              <Label>Class <span className="text-destructive">*</span></Label>
              {myClasses.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3">
                  You have no assigned classes yet. Ask your admin to assign you to a class first.
                </p>
              ) : (
                <Select value={newClassId} onValueChange={setNewClassId}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Choose a class…" />
                  </SelectTrigger>
                  <SelectContent>
                    {myClasses.map((cls) => (
                      <SelectItem key={cls.id} value={String(cls.id)}>
                        {cls.name}{cls.term ? ` · ${cls.term}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Note selector */}
            <div className="space-y-1.5">
              <Label>Note to publish <span className="text-destructive">*</span></Label>
              {readyNotes.length === 0 ? (
                <p className="text-xs text-muted-foreground rounded-xl bg-muted/60 p-3">
                  No ready notes found. Upload or create a note in your library first.
                </p>
              ) : (
                <Select value={newNoteId} onValueChange={(val) => {
                  setNewNoteId(val);
                  // Auto-fill title from note if empty
                  if (!newTitle) {
                    const note = readyNotes.find((n) => String(n.id) === val);
                    if (note) setNewTitle(note.title);
                  }
                }}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue placeholder="Choose a note…" />
                  </SelectTrigger>
                  <SelectContent>
                    {readyNotes.map((note) => (
                      <SelectItem key={note.id} value={String(note.id)}>
                        <span className="flex items-center gap-2">
                          <FileText className="size-3.5 text-muted-foreground shrink-0" />
                          <span className="truncate">{note.title}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="res-title">Resource title <span className="text-destructive">*</span></Label>
              <Input
                id="res-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Lecture 3 — Sorting Algorithms"
                className="rounded-xl"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="res-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="res-desc"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Topic overview, learning objectives, or relevant week…"
                className="rounded-xl min-h-[72px]"
              />
            </div>

            {/* Publish immediately toggle */}
            <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
              <div className="flex-1">
                <p className="text-xs font-bold">Publish immediately</p>
                <p className="text-[11px] text-muted-foreground">
                  Students in the class will see this resource right away. Save as draft to review first.
                </p>
              </div>
              <Button
                size="sm"
                variant={newStatus === "published" ? "default" : "outline"}
                className="rounded-lg text-xs h-7 px-3 shrink-0"
                onClick={() => setNewStatus(newStatus === "published" ? "draft" : "published")}
              >
                {newStatus === "published" ? (
                  <><CheckCircle2 className="size-3 mr-1 text-emerald-300" /> Live</>
                ) : (
                  <><Clock className="size-3 mr-1" /> Draft</>
                )}
              </Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newClassId || !newNoteId || !newTitle.trim() || createMutation.isPending}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {createMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : newStatus === "published" ? (
                <Send className="size-3.5" />
              ) : (
                <FileText className="size-3.5" />
              )}
              {newStatus === "published" ? "Publish Resource" : "Save as Draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Resource Dialog ────────────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold flex items-center gap-2">
              <Edit2 className="size-5 text-primary" /> Edit Resource
            </DialogTitle>
            <DialogDescription>
              Update the title, description, or swap to a different note. Status can be changed from the resource card.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Note selector */}
            <div className="space-y-1.5">
              <Label>Swap note <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Select value={editNoteId} onValueChange={setEditNoteId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Keep current note…" />
                </SelectTrigger>
                <SelectContent>
                  {readyNotes.map((note) => (
                    <SelectItem key={note.id} value={String(note.id)}>
                      <span className="flex items-center gap-2">
                        <FileText className="size-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate">{note.title}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-title">Title <span className="text-destructive">*</span></Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="rounded-xl"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-desc">Description <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="edit-desc"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="rounded-xl min-h-[72px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} className="rounded-xl text-xs">
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={!editNoteId || !editTitle.trim() || replaceMutation.isPending}
              className="rounded-xl text-xs font-bold gap-1.5"
            >
              {replaceMutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
