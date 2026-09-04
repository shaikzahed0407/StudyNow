import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  FileText,
  MessageSquare,
  Plus,
  Share2,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

export default function StudyGroups() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const groupsQuery = trpc.groups.list.useQuery();
  const myNotesQuery = trpc.notes.list.useQuery();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinDialogOpen, setJoinDialogOpen] = useState(false);
  const [shareNoteDialogOpen, setShareNoteDialogOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [groupType, setGroupType] = useState<"study_circle" | "class">("study_circle");
  const [joinCode, setJoinCode] = useState("");
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const groupDetailsQuery = trpc.groups.get.useQuery(
    { groupId: selectedGroupId || 0 },
    { enabled: Boolean(selectedGroupId) }
  );

  const createGroupMutation = trpc.groups.create.useMutation({
    onSuccess: (data) => {
      toast.success(`Group created! Invite code: ${data.code}`);
      utils.groups.list.invalidate();
      setCreateDialogOpen(false);
      setName("");
      setDescription("");
      setSelectedGroupId(data.id);
    },
    onError: (err) => toast.error(err.message || "Failed to create group"),
  });

  const joinGroupMutation = trpc.groups.join.useMutation({
    onSuccess: (data) => {
      if (data.alreadyMember) {
        toast.info("You are already a member of this group");
      } else {
        toast.success(`Joined ${data.group.name}!`);
      }
      utils.groups.list.invalidate();
      setJoinDialogOpen(false);
      setJoinCode("");
      setSelectedGroupId(data.group.id);
    },
    onError: (err) => toast.error(err.message || "Failed to join group"),
  });

  const shareNoteMutation = trpc.groups.shareNote.useMutation({
    onSuccess: (data) => {
      if (data.alreadyShared) {
        toast.info("Note is already shared to this group");
      } else {
        toast.success("Note shared to study group!");
      }
      if (selectedGroupId) {
        utils.groups.get.invalidate({ groupId: selectedGroupId });
      }
      setShareNoteDialogOpen(false);
      setSelectedNoteId(null);
    },
    onError: (err) => toast.error(err.message || "Failed to share note"),
  });

  const removeNoteMutation = trpc.groups.removeNote.useMutation({
    onSuccess: () => {
      toast.success("Note removed from group");
      if (selectedGroupId) {
        utils.groups.get.invalidate({ groupId: selectedGroupId });
      }
    },
    onError: (err) => toast.error(err.message || "Failed to remove note"),
  });

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success("Invite code copied to clipboard!");
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Please enter a group name");
    createGroupMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      type: groupType,
    });
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return toast.error("Please enter an invite code");
    joinGroupMutation.mutate({ code: joinCode.trim() });
  };

  const handleShare = () => {
    if (!selectedGroupId || !selectedNoteId) return;
    shareNoteMutation.mutate({
      groupId: selectedGroupId,
      noteId: selectedNoteId,
    });
  };

  const activeGroup = groupDetailsQuery.data?.group;
  const sharedNotes = groupDetailsQuery.data?.notes || [];
  const members = groupDetailsQuery.data?.members || [];

  return (
    <div className="mx-auto max-w-[1320px] space-y-8">
      {/* Top Header */}
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
            <Users className="size-4" /> Collaborative Learning
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight">Study Groups & Circles</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pool notes with friends and classmates, share join codes, and ask AI across shared notes.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            className="rounded-xl border-border/80 bg-white shadow-sm"
            onClick={() => setJoinDialogOpen(true)}
          >
            <UserPlus className="mr-2 size-4" /> Join with Code
          </Button>
          <Button
            className="rounded-xl font-bold shadow-lift"
            onClick={() => setCreateDialogOpen(true)}
          >
            <Plus className="mr-2 size-4" /> Create Study Group
          </Button>
        </div>
      </section>

      {/* Main View: Group Grid + Details Panel */}
      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: List of Groups */}
        <div className="space-y-4 lg:col-span-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Your Groups ({groupsQuery.data?.length || 0})
          </h2>

          {groupsQuery.isLoading ? (
            <div className="space-y-3">
              <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
              <div className="h-24 animate-pulse rounded-2xl bg-muted/60" />
            </div>
          ) : !groupsQuery.data?.length ? (
            <Card className="rounded-2xl border-dashed border-border bg-white/50 text-center p-6">
              <Users className="mx-auto size-10 text-muted-foreground/60 mb-3" />
              <h3 className="font-bold text-sm">No groups yet</h3>
              <p className="text-xs text-muted-foreground mt-1 mb-4">
                Create a group for your class or enter an invite code from a classmate.
              </p>
              <Button size="sm" className="rounded-xl" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="mr-1.5 size-3.5" /> Create first group
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {groupsQuery.data.map((group) => {
                const isSelected = selectedGroupId === group.id;
                return (
                  <Card
                    key={group.id}
                    onClick={() => setSelectedGroupId(group.id)}
                    className={`cursor-pointer rounded-2xl transition-all ${
                      isSelected
                        ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary"
                        : "border-border/80 bg-card hover:border-border hover:bg-muted/20"
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-bold text-sm">{group.name}</span>
                            <span className="inline-block rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {group.type === "class" ? "Class" : "Circle"}
                            </span>
                          </div>
                          {group.description && (
                            <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                              {group.description}
                            </p>
                          )}
                        </div>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-2 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <span className="font-mono font-bold text-foreground bg-muted/80 px-1.5 py-0.5 rounded">
                            {group.code}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyCode(group.code);
                          }}
                          className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        >
                          {copiedCode === group.code ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                          Copy Code
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Group Details & Shared Notes */}
        <div className="lg:col-span-2">
          {!selectedGroupId ? (
            <Card className="flex h-96 items-center justify-center rounded-2xl border-dashed border-border bg-white/40 text-center p-8">
              <div className="max-w-sm space-y-3">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <Share2 className="size-6" />
                </div>
                <h3 className="font-bold text-base">Select or join a study group</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Pick a group on the left to see members, view pooled study materials, or ask the AI questions grounded on this group's notes.
                </p>
              </div>
            </Card>
          ) : groupDetailsQuery.isLoading ? (
            <div className="space-y-4">
              <div className="h-32 animate-pulse rounded-2xl bg-muted/60" />
              <div className="h-64 animate-pulse rounded-2xl bg-muted/60" />
            </div>
          ) : !activeGroup ? (
            <Card className="p-8 text-center rounded-2xl">
              <p className="text-sm text-muted-foreground">Group not found or access denied.</p>
            </Card>
          ) : (
            <div className="space-y-6">
              {/* Group Header Card */}
              <Card className="rounded-2xl border-border/80 bg-card shadow-soft p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-2xl font-black tracking-tight">{activeGroup.name}</h2>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                        {activeGroup.type === "class" ? "Official Class" : "Study Circle"}
                      </span>
                    </div>
                    {activeGroup.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{activeGroup.description}</p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Users className="size-3.5" />
                        <span>{members.length} {members.length === 1 ? "member" : "members"}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <FileText className="size-3.5" />
                        <span>{sharedNotes.length} {sharedNotes.length === 1 ? "shared note" : "shared notes"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions & Invite Code */}
                  <div className="flex flex-col gap-2 sm:items-end">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Invite Code:</span>
                      <span className="font-mono text-sm font-black text-foreground">{activeGroup.code}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyCode(activeGroup.code)}
                        className="h-7 px-2 text-xs"
                      >
                        {copiedCode === activeGroup.code ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/ask?groupId=${activeGroup.id}`)}
                        className="rounded-xl border-border font-semibold shadow-sm"
                      >
                        <MessageSquare className="mr-1.5 size-3.5 text-primary" /> Ask AI on Group
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setShareNoteDialogOpen(true)}
                        className="rounded-xl font-bold shadow-lift"
                      >
                        <Plus className="mr-1.5 size-3.5" /> Share Note to Group
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Shared Notes Feed */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-base">Shared Note Library</h3>
                  <span className="text-xs text-muted-foreground">
                    Notes pooled by members of this group
                  </span>
                </div>

                {!sharedNotes.length ? (
                  <Card className="rounded-2xl border-dashed border-border bg-white/50 p-8 text-center">
                    <BookOpen className="mx-auto size-10 text-muted-foreground/60 mb-2" />
                    <h4 className="font-bold text-sm">No notes shared to this group yet</h4>
                    <p className="text-xs text-muted-foreground mt-1 mb-4">
                      Share any note from your personal library so group members can study together.
                    </p>
                    <Button size="sm" onClick={() => setShareNoteDialogOpen(true)} className="rounded-xl">
                      <Plus className="mr-1.5 size-3.5" /> Share the first note
                    </Button>
                  </Card>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {sharedNotes.map((note) => (
                      <Card key={note.id} className="rounded-2xl border-border/80 bg-card p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-bold text-sm line-clamp-1">{note.title}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground uppercase">
                              {note.kind === "file" ? "File" : "Note"}
                            </span>
                          </div>

                          {note.content && (
                            <p className="mt-2 line-clamp-3 text-xs leading-5 text-muted-foreground">
                              {note.content}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-3 text-[11px] text-muted-foreground">
                          <span>Shared by {note.sharedByName || "Member"}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeNoteMutation.mutate({ groupId: activeGroup.id, noteId: note.noteId })}
                            className="h-6 px-1.5 text-destructive hover:bg-destructive/10"
                            title="Remove from group"
                          >
                            <Trash2 className="size-3" />
                          </Button>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Group Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Create a Study Group</DialogTitle>
            <DialogDescription>
              Create a group for your class, exam prep, or study circle.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="group-name" className="text-xs font-bold">Group Name</Label>
              <Input
                id="group-name"
                placeholder="e.g. Bio 101 Exam Prep or CS Study Squad"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 h-10 rounded-xl"
              />
            </div>
            <div>
              <Label htmlFor="group-desc" className="text-xs font-bold">Description (Optional)</Label>
              <Textarea
                id="group-desc"
                placeholder="What topics or classes does this group cover?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-1 rounded-xl"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs font-bold">Group Type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setGroupType("study_circle")}
                  className={`p-3 rounded-xl border text-xs text-left transition-all ${
                    groupType === "study_circle"
                      ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                      : "border-border hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <p className="font-bold text-foreground">Study Circle</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Peer-to-peer sharing between friends</p>
                </button>
                <button
                  type="button"
                  onClick={() => setGroupType("class")}
                  className={`p-3 rounded-xl border text-xs text-left transition-all ${
                    groupType === "class"
                      ? "border-primary bg-primary/10 text-primary font-bold ring-1 ring-primary"
                      : "border-border hover:bg-muted/30 text-muted-foreground"
                  }`}
                >
                  <p className="font-bold text-foreground">Official Class</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Teacher/course managed group</p>
                </button>
              </div>
            </div>
            <Button
              type="submit"
              disabled={createGroupMutation.isPending}
              className="w-full h-11 rounded-xl font-bold shadow-lift mt-2"
            >
              {createGroupMutation.isPending ? "Creating..." : "Create Group & Generate Code"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Join Group Dialog */}
      <Dialog open={joinDialogOpen} onOpenChange={setJoinDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Join with Invite Code</DialogTitle>
            <DialogDescription>
              Enter the 6-character code shared by your teacher or classmate.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleJoin} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="join-code" className="text-xs font-bold">Join Code</Label>
              <Input
                id="join-code"
                placeholder="e.g. BIO1-89A"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="mt-1 h-11 text-center font-mono text-lg font-bold tracking-widest uppercase rounded-xl"
              />
            </div>
            <Button
              type="submit"
              disabled={joinGroupMutation.isPending}
              className="w-full h-11 rounded-xl font-bold shadow-lift"
            >
              {joinGroupMutation.isPending ? "Joining..." : "Join Group"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Share Note to Group Dialog */}
      <Dialog open={shareNoteDialogOpen} onOpenChange={setShareNoteDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">Share a Note</DialogTitle>
            <DialogDescription>
              Select a note from your personal library to share with {activeGroup?.name}.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {!myNotesQuery.data?.length ? (
              <p className="text-xs text-muted-foreground">You don't have any notes created yet.</p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {myNotesQuery.data.map((note) => {
                  const isSelected = selectedNoteId === note.id;
                  return (
                    <div
                      key={note.id}
                      onClick={() => setSelectedNoteId(note.id)}
                      className={`cursor-pointer rounded-xl border p-3 text-xs transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 font-bold"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      <p className="font-bold text-foreground truncate">{note.title}</p>
                      <p className="text-muted-foreground text-[11px] truncate mt-0.5">
                        {note.source || "Personal note"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              onClick={handleShare}
              disabled={!selectedNoteId || shareNoteMutation.isPending}
              className="w-full h-11 rounded-xl font-bold shadow-lift"
            >
              {shareNoteMutation.isPending ? "Sharing..." : "Share Selected Note"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
