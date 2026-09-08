import { useAuth } from "@/_core/hooks/useAuth";
import { UserProfileModal } from "@/components/UserProfileModal";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  ArrowRight,
  BookOpen,
  BookmarkPlus,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  Crown,
  Download,
  Eye,
  FileText,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MoreVertical,
  Plus,
  Search,
  Share2,
  Shield,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

export default function StudyGroups() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Top-level Navigation: "my_groups" | "discover" | "invitations"
  const [activeTab, setActiveTab] = useState<"my_groups" | "discover" | "invitations">("my_groups");
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);

  // Group Details sub-tab: "notes" | "members" | "requests" | "settings"
  const [groupSubTab, setGroupSubTab] = useState<"notes" | "members" | "requests" | "settings">(
    "notes"
  );

  // Modal dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [joinCodeDialogOpen, setJoinCodeDialogOpen] = useState(false);
  const [shareNoteDialogOpen, setShareNoteDialogOpen] = useState(false);
  const [saveToPersonalDialogOpen, setSaveToPersonalDialogOpen] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [previewNoteId, setPreviewNoteId] = useState<number | null>(null);
  const [selectedUserProfileId, setSelectedUserProfileId] = useState<number | null>(null);

  // Form states
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupType, setGroupType] = useState<"study_circle" | "class">("study_circle");
  const [joinCodeInput, setJoinCodeInput] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Note Sharing / Saving states
  const [noteToShareId, setNoteToShareId] = useState<number | null>(null);
  const [savingNote, setSavingNote] = useState<{ id: number; title: string } | null>(null);
  const [saveCollectionId, setSaveCollectionId] = useState<string>("none");
  const [saveCustomTitle, setSaveCustomTitle] = useState("");

  // Invite Form
  const [inviteEmail, setInviteEmail] = useState("");

  // Queries
  const { data: myGroups = [], isLoading: groupsLoading } = trpc.groups.list.useQuery();
  const { data: publicGroups = [], isLoading: discoverLoading } = trpc.groups.discover.useQuery();
  const { data: invitations = [] } = trpc.groups.listInvitations.useQuery();
  const { data: myPersonalCollections = [] } = trpc.collections.list.useQuery();
  const { data: myPersonalNotes = [] } = trpc.notes.list.useQuery({ filter: "all" });

  const activeGroup = useMemo(
    () => myGroups.find((g) => g.id === selectedGroupId) || null,
    [myGroups, selectedGroupId]
  );

  const { data: groupDetails, isLoading: detailsLoading } = trpc.groups.get.useQuery(
    { groupId: selectedGroupId! },
    { enabled: selectedGroupId !== null }
  );

  const { data: previewNote, isLoading: previewLoading } = trpc.notes.get.useQuery(
    { noteId: previewNoteId! },
    { enabled: previewNoteId !== null }
  );

  // Membership & Delegated Permissions
  const myMembership = groupDetails?.members.find((m) => m.userId === user?.id);
  const isOwner = myMembership?.role === "owner" || groupDetails?.group.ownerId === user?.id;
  const isManager = myMembership?.role === "manager";
  const canManage = isOwner || isManager;

  // Mutations
  const createGroupMutation = trpc.groups.create.useMutation({
    onSuccess: (newGrp) => {
      toast.success("Study group created successfully!");
      setCreateDialogOpen(false);
      setGroupName("");
      setGroupDescription("");
      utils.groups.list.invalidate();
      setSelectedGroupId(newGrp.id);
    },
    onError: (err) => toast.error(err.message || "Failed to create group"),
  });

  const joinByCodeMutation = trpc.groups.joinByCode.useMutation({
    onSuccess: (res) => {
      toast.success(`Joined ${res.group.name}!`);
      setJoinCodeDialogOpen(false);
      setJoinCodeInput("");
      utils.groups.list.invalidate();
      setSelectedGroupId(res.group.id);
    },
    onError: (err) => toast.error(err.message || "Failed to join group"),
  });

  const requestJoinMutation = trpc.groups.requestJoin.useMutation({
    onSuccess: (res) => {
      if (res.alreadyMember) {
        toast.info("You are already a member of this group.");
      } else if (res.alreadyPending) {
        toast.info("Your request to join is already pending review.");
      } else {
        toast.success("Join request submitted to group managers!");
      }
      utils.groups.discover.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to request join"),
  });

  const shareNoteMutation = trpc.sharing.shareToGroup.useMutation({
    onSuccess: (data) => {
      if (data.alreadyShared) {
        toast.info("Note is already shared to this group.");
      } else {
        toast.success("Note shared to group!");
      }
      setShareNoteDialogOpen(false);
      setNoteToShareId(null);
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Failed to share note"),
  });

  const removeFromGroupMutation = trpc.sharing.removeFromGroup.useMutation({
    onSuccess: () => {
      toast.success("Note unshared from group");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Failed to remove note"),
  });

  const saveToPersonalMutation = trpc.sharing.saveToPersonal.useMutation({
    onSuccess: () => {
      toast.success("Reference saved to your personal note library!");
      setSaveToPersonalDialogOpen(false);
      setSavingNote(null);
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to save note"),
  });

  const inviteMutation = trpc.groups.invite.useMutation({
    onSuccess: (res) => {
      if (res.alreadyMember) {
        toast.info("This user is already a member of the group.");
      } else if (res.autoJoined) {
        toast.success("Member added to group immediately!");
      } else {
        toast.success("Invitation sent! Awaiting recipient acceptance.");
      }
      setInviteDialogOpen(false);
      setInviteEmail("");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Failed to send invitation"),
  });

  const decideInvitationMutation = trpc.groups.decideInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation decision saved");
      utils.groups.listInvitations.invalidate();
      utils.groups.list.invalidate();
    },
  });

  const decideRequestMutation = trpc.groups.decideJoinRequest.useMutation({
    onSuccess: () => {
      toast.success("Join request updated");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
  });

  const promoteMutation = trpc.groups.promoteManager.useMutation({
    onSuccess: () => {
      toast.success("Member promoted to Manager");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Action failed"),
  });

  const demoteMutation = trpc.groups.demoteManager.useMutation({
    onSuccess: () => {
      toast.success("Manager demoted to Member");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Action failed"),
  });

  const transferMutation = trpc.groups.transferOwnership.useMutation({
    onSuccess: () => {
      toast.success("Group ownership transferred successfully");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Transfer failed"),
  });

  const removeMemberMutation = trpc.groups.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed from group");
      if (selectedGroupId) utils.groups.get.invalidate({ groupId: selectedGroupId });
    },
    onError: (err) => toast.error(err.message || "Action failed"),
  });

  const leaveMutation = trpc.groups.leave.useMutation({
    onSuccess: () => {
      toast.success("You left the group");
      setSelectedGroupId(null);
      utils.groups.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to leave group"),
  });

  const deleteGroupMutation = trpc.groups.delete.useMutation({
    onSuccess: () => {
      toast.success("Group deleted");
      setSelectedGroupId(null);
      utils.groups.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to delete group"),
  });

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    toast.success("Group invite code copied!");
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleOpenSaveDialog = (note: { id: number; title: string }) => {
    setSavingNote(note);
    setSaveCustomTitle(note.title);
    setSaveCollectionId("none");
    setSaveToPersonalDialogOpen(true);
  };

  const pendingInvitesCount = invitations.filter((i) => i.status === "pending").length;

  return (
    <div className="space-y-6">
      <UserProfileModal
        userId={selectedUserProfileId}
        open={selectedUserProfileId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedUserProfileId(null);
        }}
      />

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Study Groups</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Collaborative peer spaces focused purely on note sharing and discovery.{" "}
            <span className="font-bold text-foreground">Zero distractions, absolutely no chat.</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setJoinCodeDialogOpen(true)}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <KeyRound className="size-3.5" /> Join with Code
          </Button>
          <Button
            onClick={() => setCreateDialogOpen(true)}
            className="rounded-xl text-xs font-bold shadow-lift gap-1.5"
          >
            <Plus className="size-3.5" /> Create Group
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as any);
          if (v !== "my_groups") setSelectedGroupId(null);
        }}
        className="w-full"
      >
        <TabsList className="rounded-2xl p-1 bg-muted/60 h-11">
          <TabsTrigger
            value="my_groups"
            className="rounded-xl font-bold text-xs flex items-center gap-2 px-4"
          >
            <Users className="size-3.5" /> My Groups ({myGroups.length})
          </TabsTrigger>
          <TabsTrigger
            value="discover"
            className="rounded-xl font-bold text-xs flex items-center gap-2 px-4"
          >
            <Compass className="size-3.5" /> Discover Public Groups
          </TabsTrigger>
          <TabsTrigger
            value="invitations"
            className="rounded-xl font-bold text-xs flex items-center gap-2 px-4 relative"
          >
            <Mail className="size-3.5" /> Invitations
            {pendingInvitesCount > 0 && (
              <span className="size-2 rounded-full bg-coral animate-pulse" />
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: My Groups & Group Workspace */}
        <TabsContent value="my_groups" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left: Group List */}
            <div className="lg:col-span-4 space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Your Memberships
                </span>
                <span className="text-xs text-muted-foreground">{myGroups.length} groups</span>
              </div>

              {groupsLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="size-6 animate-spin text-primary" />
                </div>
              ) : myGroups.length === 0 ? (
                <Card className="rounded-3xl border-dashed border-2 border-border/80 p-8 text-center bg-card/40">
                  <Users className="size-8 mx-auto text-muted-foreground/60 mb-2" />
                  <p className="text-sm font-bold">No groups joined yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Create your own study circle or explore public groups to start sharing notes.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setActiveTab("discover")}
                    className="mt-4 rounded-xl text-xs font-bold"
                  >
                    Discover Groups
                  </Button>
                </Card>
              ) : (
                <div className="space-y-2">
                  {myGroups.map((grp) => {
                    const isSelected = selectedGroupId === grp.id;
                    const role = grp.myRole || "member";
                    return (
                      <div
                        key={grp.id}
                        onClick={() => setSelectedGroupId(grp.id)}
                        className={`p-4 rounded-2xl border text-left cursor-pointer transition-all ${
                          isSelected
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border/70 hover:border-border hover:bg-card/70 bg-card/40"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h3 className="font-bold text-sm truncate text-foreground">
                              {grp.name}
                            </h3>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                              {grp.description || "No description provided."}
                            </p>
                          </div>
                          <Badge
                            variant={
                              role === "owner"
                                ? "default"
                                : role === "manager"
                                ? "secondary"
                                : "outline"
                            }
                            className="capitalize text-[10px] shrink-0 font-bold"
                          >
                            {role === "owner" && <Crown className="size-3 mr-1 text-amber-300" />}
                            {role}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right: Selected Group Workspace (NO CHAT) */}
            <div className="lg:col-span-8">
              {!selectedGroupId ? (
                <Card className="rounded-3xl border-border/70 p-12 text-center bg-card/40 flex flex-col items-center justify-center min-h-[400px]">
                  <Layers className="size-12 text-muted-foreground/40 mb-3" />
                  <h3 className="font-display text-lg font-bold">Select a Study Group</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Choose a group from the list on the left to browse shared study notes, view members,
                    or delegate manager permissions.
                  </p>
                </Card>
              ) : detailsLoading ? (
                <div className="flex h-64 items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-primary" />
                </div>
              ) : groupDetails ? (
                <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden bg-card/80 backdrop-blur">
                  {/* Group Header */}
                  <div className="border-b border-border/60 p-6 bg-gradient-to-r from-primary/10 via-background to-accent/10">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-display text-2xl font-black tracking-tight">
                            {groupDetails.group.name}
                          </h2>
                          <Badge variant="outline" className="capitalize text-xs">
                            {groupDetails.group.type === "class" ? "Class" : "Study Circle"}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                          {groupDetails.group.description || "No description provided."}
                        </p>
                        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Users className="size-3.5" />
                            {groupDetails.members.length} members
                          </span>
                          <span className="flex items-center gap-1.5">
                            <FileText className="size-3.5" />
                            {groupDetails.notes.length} shared notes
                          </span>
                        </div>
                      </div>

                      {/* Quick actions: Copy Code / Invite */}
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyInviteCode(groupDetails.group.code)}
                          className="rounded-xl text-xs gap-1.5"
                        >
                          <Copy className="size-3" />
                          {copiedCode ? "Copied!" : "Invite Code"}
                        </Button>

                        {canManage && (
                          <Button
                            size="sm"
                            onClick={() => setInviteDialogOpen(true)}
                            className="rounded-xl text-xs font-bold gap-1.5 shadow-lift"
                          >
                            <UserPlus className="size-3" /> Invite
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Sub-tabs Navigation */}
                    <div className="flex gap-2 mt-6 border-t border-border/50 pt-4">
                      <Button
                        size="sm"
                        variant={groupSubTab === "notes" ? "default" : "ghost"}
                        onClick={() => setGroupSubTab("notes")}
                        className="rounded-xl text-xs font-bold gap-1.5"
                      >
                        <FileText className="size-3.5" /> Shared Notes (
                        {groupDetails.notes.length})
                      </Button>
                      <Button
                        size="sm"
                        variant={groupSubTab === "members" ? "default" : "ghost"}
                        onClick={() => setGroupSubTab("members")}
                        className="rounded-xl text-xs font-bold gap-1.5"
                      >
                        <Users className="size-3.5" /> Members ({groupDetails.members.length})
                      </Button>
                      <Button
                        size="sm"
                        variant={groupSubTab === "settings" ? "default" : "ghost"}
                        onClick={() => setGroupSubTab("settings")}
                        className="rounded-xl text-xs font-bold gap-1.5"
                      >
                        Settings
                      </Button>
                    </div>
                  </div>

                  {/* Sub-tab 1: Shared Notes */}
                  {groupSubTab === "notes" && (
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-sm">Group Note Repository</h3>
                          <p className="text-xs text-muted-foreground">
                            Preview notes, download original files, or save an independent reference to your
                            personal collections.
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setShareNoteDialogOpen(true)}
                          className="rounded-xl text-xs font-bold gap-1.5"
                        >
                          <Share2 className="size-3" /> Share from My Notes
                        </Button>
                      </div>

                      {groupDetails.notes.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-border/70 p-10 text-center bg-card/30">
                          <FileText className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                          <p className="text-sm font-bold">No notes shared to this group yet</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Share class slides, personal study guides, or summaries to kick off collaboration.
                          </p>
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {groupDetails.notes.map((sn) => (
                            <Card
                              key={sn.id}
                              className="rounded-2xl border-border/70 bg-card/60 p-4 flex flex-col justify-between hover:border-primary/50 transition-colors"
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="font-bold text-sm line-clamp-1">{sn.title}</h4>
                                  <Badge variant="secondary" className="text-[9px] uppercase">
                                    {sn.kind}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {sn.content ? sn.content.slice(0, 140) : "No text content"}
                                </p>
                                <p className="text-[10px] text-muted-foreground/70">
                                  Shared by {sn.sharedByName || "Peer"} •{" "}
                                  {new Date(sn.sharedAt).toLocaleDateString()}
                                </p>
                              </div>

                              <div className="flex items-center justify-between pt-3 mt-3 border-t border-border/50">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setPreviewNoteId(sn.noteId)}
                                  className="h-7 text-xs rounded-lg px-2"
                                >
                                  <Eye className="size-3 mr-1" /> Preview
                                </Button>

                                <div className="flex items-center gap-1">
                                  {/* Save to Personal Library */}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      handleOpenSaveDialog({ id: sn.noteId, title: sn.title || "Note" })
                                    }
                                    className="h-7 text-xs rounded-lg px-2 text-primary font-semibold"
                                  >
                                    <BookmarkPlus className="size-3 mr-1" /> Save
                                  </Button>

                                  {/* Remove from Group (Sharer or Manager/Owner) */}
                                  {(canManage || sn.sharedByUserId === user?.id) && (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => {
                                        if (confirm("Remove this note from the group?")) {
                                          removeFromGroupMutation.mutate({
                                            noteId: sn.noteId,
                                            groupId: groupDetails.group.id,
                                          });
                                        }
                                      }}
                                      className="size-7 rounded-lg text-muted-foreground hover:text-destructive"
                                      title="Remove from group"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Sub-tab 2: Members & Roles */}
                  {groupSubTab === "members" && (
                    <div className="p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-sm">Group Members & Delegated Roles</h3>
                          <p className="text-xs text-muted-foreground">
                            Click any member to inspect their public profile. Group Owners and Managers can
                            delegate moderation.
                          </p>
                        </div>
                      </div>

                      <div className="divide-y divide-border/60 rounded-2xl border border-border/70 overflow-hidden bg-card/40">
                        {groupDetails.members.map((member) => {
                          const isSelf = member.userId === user?.id;
                          const memberRole = member.role;

                          return (
                            <div
                              key={member.id}
                              className="p-4 flex items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                            >
                              <div
                                className="flex items-center gap-3 cursor-pointer group"
                                onClick={() => setSelectedUserProfileId(member.userId)}
                              >
                                <Avatar className="size-10 border border-border">
                                  {member.avatarUrl && <AvatarImage src={member.avatarUrl} />}
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                    {member.name?.slice(0, 1).toUpperCase() || "U"}
                                  </AvatarFallback>
                                </Avatar>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                                      {member.name || "Member"}
                                    </p>
                                    {isSelf && (
                                      <span className="text-[10px] text-muted-foreground font-semibold">
                                        (You)
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    <Badge
                                      variant={
                                        memberRole === "owner"
                                          ? "default"
                                          : memberRole === "manager"
                                          ? "secondary"
                                          : "outline"
                                      }
                                      className="capitalize text-[10px] font-bold"
                                    >
                                      {memberRole === "owner" && (
                                        <Crown className="size-3 mr-1 text-amber-300" />
                                      )}
                                      {memberRole}
                                    </Badge>
                                    <span className="text-[10px] text-muted-foreground capitalize">
                                      Platform: {member.platformRole || "student"}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Member Management Actions */}
                              {isOwner && !isSelf && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-8 rounded-lg"
                                    >
                                      <MoreVertical className="size-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-48 rounded-xl">
                                    <DropdownMenuLabel className="text-xs">
                                      Owner Delegation
                                    </DropdownMenuLabel>
                                    {memberRole === "member" && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          promoteMutation.mutate({
                                            groupId: groupDetails.group.id,
                                            targetUserId: member.userId,
                                          })
                                        }
                                        className="text-xs gap-2"
                                      >
                                        <Shield className="size-3.5 text-primary" /> Promote to
                                        Manager
                                      </DropdownMenuItem>
                                    )}
                                    {memberRole === "manager" && (
                                      <DropdownMenuItem
                                        onClick={() =>
                                          demoteMutation.mutate({
                                            groupId: groupDetails.group.id,
                                            targetUserId: member.userId,
                                          })
                                        }
                                        className="text-xs gap-2 text-amber-600"
                                      >
                                        <ShieldAlert className="size-3.5" /> Demote to Member
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (
                                          confirm(
                                            `Transfer complete group ownership to ${member.name}? You will become a Manager.`
                                          )
                                        ) {
                                          transferMutation.mutate({
                                            groupId: groupDetails.group.id,
                                            newOwnerId: member.userId,
                                          });
                                        }
                                      }}
                                      className="text-xs gap-2 text-amber-600"
                                    >
                                      <Crown className="size-3.5" /> Transfer Ownership
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => {
                                        if (confirm(`Remove ${member.name} from the group?`)) {
                                          removeMemberMutation.mutate({
                                            groupId: groupDetails.group.id,
                                            targetUserId: member.userId,
                                          });
                                        }
                                      }}
                                      className="text-xs gap-2 text-destructive focus:text-destructive"
                                    >
                                      <UserMinus className="size-3.5" /> Remove Member
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}

                              {isManager && !isOwner && !isSelf && memberRole === "member" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    if (confirm(`Remove ${member.name} from the group?`)) {
                                      removeMemberMutation.mutate({
                                        groupId: groupDetails.group.id,
                                        targetUserId: member.userId,
                                      });
                                    }
                                  }}
                                  className="h-7 text-xs text-destructive hover:text-destructive"
                                >
                                  Remove
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Sub-tab 3: Group Settings */}
                  {groupSubTab === "settings" && (
                    <div className="p-6 space-y-6">
                      <div className="rounded-2xl border border-border/70 p-4 bg-muted/20 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Invite Code
                        </h4>
                        <div className="flex items-center gap-2">
                          <code className="text-sm font-mono font-bold bg-muted px-3 py-1.5 rounded-xl border border-border">
                            {groupDetails.group.code}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => copyInviteCode(groupDetails.group.code)}
                            className="rounded-xl text-xs"
                          >
                            <Copy className="size-3.5 mr-1" /> Copy
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Share this invite code with peers to let them easily join via the "Join with Code" dialog.
                        </p>
                      </div>

                      <div className="border-t border-border/60 pt-6 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-destructive">
                          Danger Zone
                        </h4>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold">Leave Study Group</p>
                            <p className="text-[11px] text-muted-foreground">
                              You will lose access to shared notes in this group.
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              if (confirm("Leave this group?")) {
                                leaveMutation.mutate({ groupId: groupDetails.group.id });
                              }
                            }}
                            className="rounded-xl text-xs text-destructive hover:text-destructive"
                          >
                            <LogOut className="size-3.5 mr-1" /> Leave Group
                          </Button>
                        </div>

                        {isOwner && (
                          <div className="flex items-center justify-between pt-3 border-t border-border/40">
                            <div>
                              <p className="text-xs font-bold text-destructive">Delete Entire Group</p>
                              <p className="text-[11px] text-muted-foreground">
                                Permanently disbands the group for all members. Shared note references are removed.
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                if (confirm("Are you sure you want to permanently delete this group?")) {
                                  deleteGroupMutation.mutate({ groupId: groupDetails.group.id });
                                }
                              }}
                              className="rounded-xl text-xs font-bold"
                            >
                              <Trash2 className="size-3.5 mr-1" /> Delete Group
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Discover Public Groups */}
        <TabsContent value="discover" className="mt-6">
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-xl font-bold">Explore Public Study Groups</h2>
              <p className="text-xs text-muted-foreground">
                Join active study communities to exchange lecture summaries, exam prep, and research.
              </p>
            </div>

            {discoverLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : publicGroups.length === 0 ? (
              <Card className="rounded-3xl border-dashed border-2 border-border/80 p-8 text-center bg-card/40">
                <Compass className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-bold">No public groups found</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Be the first to create an open study community!
                </p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {publicGroups.map((grp) => {
                  const isMember = grp.isMember || myGroups.some((m) => m.id === grp.id);
                  return (
                    <Card
                      key={grp.id}
                      className="rounded-3xl border-border/70 bg-card/80 p-5 flex flex-col justify-between"
                    >
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-bold text-sm text-foreground">{grp.name}</h3>
                          <Badge variant="secondary" className="capitalize text-[10px]">
                            {grp.type}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {grp.description || "Open study circle for sharing notes."}
                        </p>
                      </div>

                      <div className="pt-4 mt-4 border-t border-border/50 flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">
                          Code: {grp.code}
                        </span>
                        {isMember ? (
                          <Badge variant="outline" className="text-xs">
                            Already Joined
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => requestJoinMutation.mutate({ groupId: grp.id })}
                            className="rounded-xl text-xs font-bold shadow-lift"
                          >
                            Join Group
                          </Button>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Tab 3: Pending Invitations */}
        <TabsContent value="invitations" className="mt-6">
          <div className="space-y-4 max-w-2xl">
            <div>
              <h2 className="font-display text-xl font-bold">Group Invitations</h2>
              <p className="text-xs text-muted-foreground">
                Invitations sent to your email or account by group owners and managers.
              </p>
            </div>

            {invitations.length === 0 ? (
              <Card className="rounded-3xl border-dashed border-2 border-border/80 p-8 text-center bg-card/40">
                <Mail className="size-8 mx-auto text-muted-foreground/50 mb-2" />
                <p className="text-sm font-bold">No invitations</p>
                <p className="text-xs text-muted-foreground mt-1">
                  When peers invite you to private study groups, they will show up here.
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {invitations.map((inv) => (
                  <Card
                    key={inv.id}
                    className="rounded-2xl border-border/70 p-4 flex items-center justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm text-foreground">
                          {inv.groupName || `Group #${inv.groupId}`}
                        </h4>
                        <Badge variant="secondary" className="capitalize text-[10px]">
                          {inv.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Invited by {inv.inviterName || "Peer"} •{" "}
                        {new Date(inv.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    {inv.status === "pending" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            decideInvitationMutation.mutate({
                              invitationId: inv.id,
                              accept: false,
                            })
                          }
                          className="rounded-xl text-xs"
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          onClick={() =>
                            decideInvitationMutation.mutate({
                              invitationId: inv.id,
                              accept: true,
                            })
                          }
                          className="rounded-xl text-xs font-bold shadow-lift"
                        >
                          Accept
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* ======================================================== */}
      {/* Dialog: Create New Study Group */}
      {/* ======================================================== */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Create New Study Group
            </DialogTitle>
            <DialogDescription>
              Create a dedicated study circle to share notes and collaborate with classmates.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!groupName.trim()) return toast.error("Group name is required");
              createGroupMutation.mutate({
                name: groupName.trim(),
                description: groupDescription.trim() || undefined,
                type: groupType,
              });
            }}
            className="space-y-4 mt-3"
          >
            <div className="space-y-2">
              <Label htmlFor="gName" className="text-xs font-bold">
                Group Name
              </Label>
              <Input
                id="gName"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="e.g. Distributed Systems Working Group"
                className="rounded-xl h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gDesc" className="text-xs font-bold">
                Description (optional)
              </Label>
              <Textarea
                id="gDesc"
                value={groupDescription}
                onChange={(e) => setGroupDescription(e.target.value)}
                placeholder="Brief summary of syllabus or study goals..."
                className="rounded-xl min-h-[80px] text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Group Type</Label>
              <Select
                value={groupType}
                onValueChange={(v) => setGroupType(v as any)}
              >
                <SelectTrigger className="rounded-xl h-10 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="study_circle">
                    <div className="text-left">
                      <p className="font-bold">Study Circle</p>
                      <p className="text-[10px] text-muted-foreground">
                        Collaborative peer study group open to sharing notes.
                      </p>
                    </div>
                  </SelectItem>
                  <SelectItem value="class">
                    <div className="text-left">
                      <p className="font-bold">Academic Class</p>
                      <p className="text-[10px] text-muted-foreground">
                        Formal class section or course group.
                      </p>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createGroupMutation.isPending}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {createGroupMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Create Group
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Join by Code */}
      {/* ======================================================== */}
      <Dialog open={joinCodeDialogOpen} onOpenChange={setJoinCodeDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">Join with Invite Code</DialogTitle>
            <DialogDescription>
              Enter the invite code provided by your peer or teacher.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!joinCodeInput.trim()) return toast.error("Code is required");
              joinByCodeMutation.mutate({ code: joinCodeInput.trim().toUpperCase() });
            }}
            className="space-y-4 mt-3"
          >
            <div className="space-y-2">
              <Label htmlFor="codeIn" className="text-xs font-bold">
                Invite Code
              </Label>
              <Input
                id="codeIn"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. GRP-A1B2"
                className="rounded-xl h-11 font-mono uppercase tracking-wider"
                required
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setJoinCodeDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={joinByCodeMutation.isPending}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {joinByCodeMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Join
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Share Note to Group */}
      {/* ======================================================== */}
      <Dialog open={shareNoteDialogOpen} onOpenChange={setShareNoteDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Share from Personal Library
            </DialogTitle>
            <DialogDescription>
              Select one of your notes to publish into this group's repository.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 mt-3">
            {myPersonalNotes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                You don't have any notes in your library yet. Create one in 'My Notes' first.
              </p>
            ) : (
              <ScrollArea className="max-h-60 pr-1">
                <div className="space-y-2">
                  {myPersonalNotes.map((n) => (
                    <div
                      key={n.id}
                      onClick={() => setNoteToShareId(n.id)}
                      className={`p-3 rounded-2xl border text-left cursor-pointer transition ${
                        noteToShareId === n.id
                          ? "border-primary bg-primary/10"
                          : "border-border/70 hover:bg-muted/40"
                      }`}
                    >
                      <p className="text-xs font-bold text-foreground">{n.title}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {n.content ? n.content.slice(0, 140) : "No excerpt"}
                      </p>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setShareNoteDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                disabled={!noteToShareId || !selectedGroupId || shareNoteMutation.isPending}
                onClick={() => {
                  if (noteToShareId && selectedGroupId) {
                    shareNoteMutation.mutate({ noteId: noteToShareId, groupId: selectedGroupId });
                  }
                }}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {shareNoteMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Share Note
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Save Independent Reference to Personal Library */}
      {/* ======================================================== */}
      <Dialog open={saveToPersonalDialogOpen} onOpenChange={setSaveToPersonalDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Save Note to Personal Library
            </DialogTitle>
            <DialogDescription>
              This creates your own independent reference record. You can organize it into your
              personal collections without duplicating the underlying file.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!savingNote) return;
              const collId = saveCollectionId === "none" ? undefined : Number(saveCollectionId);
              saveToPersonalMutation.mutate({
                noteId: savingNote.id,
                collectionId: collId,
                customTitle: saveCustomTitle.trim() || undefined,
              });
            }}
            className="space-y-4 mt-3"
          >
            <div className="space-y-2">
              <Label htmlFor="customTitle" className="text-xs font-bold">
                Custom Title in My Library
              </Label>
              <Input
                id="customTitle"
                value={saveCustomTitle}
                onChange={(e) => setSaveCustomTitle(e.target.value)}
                placeholder="Rename for your personal reference..."
                className="rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Destination Collection</Label>
              <Select value={saveCollectionId} onValueChange={setSaveCollectionId}>
                <SelectTrigger className="rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Select collection" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {myPersonalCollections.map((col) => (
                    <SelectItem key={col.id} value={String(col.id)}>
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: col.color || "#3B82F6" }}
                        />
                        <span>{col.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSaveToPersonalDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saveToPersonalMutation.isPending}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {saveToPersonalMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Save Reference
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Send Group Invitation (Exact Role Matrix) */}
      {/* ======================================================== */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Invite Peer or Student
            </DialogTitle>
            <DialogDescription>
              Send an invite to a registered user's email address. Platform authority rules determine
              whether the invite joins automatically or requires recipient confirmation.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!inviteEmail.trim()) return toast.error("Email is required");
              if (!selectedGroupId) return;
              inviteMutation.mutate({
                groupId: selectedGroupId,
                inviteeEmail: inviteEmail.trim(),
              });
            }}
            className="space-y-4 mt-3"
          >
            <div className="space-y-2">
              <Label htmlFor="invEmail" className="text-xs font-bold">
                Recipient Email
              </Label>
              <Input
                id="invEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="student@university.edu"
                className="rounded-xl h-11"
                required
              />
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-[11px] leading-5 text-muted-foreground space-y-1">
              <p className="font-bold text-foreground">Invitation Rules Matrix:</p>
              <p>• Admin → Student/Teacher: Auto-joins immediately</p>
              <p>• Teacher → Student: Auto-joins immediately</p>
              <p>• Student/Manager → Anyone: Requires user acceptance</p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setInviteDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={inviteMutation.isPending}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {inviteMutation.isPending && (
                  <Loader2 className="size-3.5 animate-spin mr-1.5" />
                )}
                Send Invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Multi-Format Preview Modal */}
      {/* ======================================================== */}
      <Dialog
        open={previewNoteId !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewNoteId(null);
        }}
      >
        <DialogContent className="max-w-3xl rounded-3xl p-6 max-h-[85vh] flex flex-col overflow-hidden">
          {previewLoading ? (
            <div className="py-24 flex justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : previewNote?.note ? (
            <>
              <DialogHeader className="border-b border-border/60 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <DialogTitle className="font-display text-xl font-bold">
                      {previewNote.note.title}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {previewNote.files?.[0]?.mimeType || previewNote.note.kind} • Uploaded{" "}
                      {new Date(previewNote.note.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {previewNote.files?.[0]?.storageUrl && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl text-xs gap-1.5"
                      asChild
                    >
                      <a
                        href={previewNote.files[0].storageUrl}
                        download={previewNote.files[0].originalName}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download className="size-3.5" /> Download Original
                      </a>
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-3 my-4">
                {previewNote.files?.[0]?.mimeType?.includes("image") &&
                previewNote.files?.[0]?.storageUrl ? (
                  <div className="rounded-2xl overflow-hidden border border-border/60 mb-4 bg-muted/20 text-center">
                    <img
                      src={previewNote.files[0].storageUrl}
                      alt={previewNote.note.title}
                      className="max-h-[400px] w-auto mx-auto object-contain"
                    />
                  </div>
                ) : previewNote.files?.[0]?.mimeType?.includes("pdf") &&
                  previewNote.files?.[0]?.storageUrl ? (
                  <div className="rounded-2xl overflow-hidden border border-border/60 mb-4 h-[420px]">
                    <iframe
                      src={`${previewNote.files[0].storageUrl}#toolbar=0`}
                      className="w-full h-full"
                      title={previewNote.note.title}
                    />
                  </div>
                ) : null}

                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-6 text-foreground bg-muted/30 p-4 rounded-2xl border border-border/50">
                  <Streamdown>{previewNote.note.content || "No text content available."}</Streamdown>
                </div>

                {previewNote.visuals && previewNote.visuals.length > 0 && (
                  <div className="mt-5 space-y-3">
                    <h4 className="font-display text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Extracted Visuals & Diagrams ({previewNote.visuals.length})
                    </h4>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {previewNote.visuals.map((vis) => (
                        <div
                          key={vis.id}
                          className="rounded-2xl border border-border/60 p-3 bg-card/60 space-y-2"
                        >
                          {vis.storageUrl && (
                            <img
                              src={vis.storageUrl}
                              alt={vis.caption || "Visual diagram"}
                              className="rounded-xl max-h-36 w-full object-cover"
                            />
                          )}
                          <p className="text-[11px] font-semibold text-foreground">{vis.caption}</p>
                          <Badge variant="secondary" className="text-[9px]">
                            {vis.pageRef || "Visual"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </ScrollArea>
            </>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">Note not found</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
