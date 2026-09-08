import { useAuth } from "@/_core/hooks/useAuth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Database,
  GraduationCap,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserCog,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function Admin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const [search, setSearch] = useState("");
  const [roleChangeUser, setRoleChangeUser] = useState<{
    id: number;
    name: string;
    currentRole: string;
    newRole: "student" | "teacher" | "admin";
  } | null>(null);
  const [changeReason, setChangeReason] = useState("");

  // Queries
  const { data: users = [], isLoading: usersLoading } = trpc.admin.users.useQuery();
  const { data: pendingTeachers = [], isLoading: pendingLoading } =
    trpc.admin.pendingTeachers.useQuery();
  const { data: auditLogs = [], isLoading: auditLoading } = trpc.admin.audit.useQuery();

  // Mutations
  const changeRoleMutation = trpc.admin.changeRole.useMutation({
    onSuccess: () => {
      toast.success("User platform role updated!");
      setRoleChangeUser(null);
      setChangeReason("");
      utils.admin.users.invalidate();
      utils.admin.audit.invalidate();
      utils.admin.pendingTeachers.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update role"),
  });

  const approveTeacherMutation = trpc.admin.approveTeacher.useMutation({
    onSuccess: () => {
      toast.success("Teacher account approved! Full publishing privileges granted.");
      utils.admin.pendingTeachers.invalidate();
      utils.admin.users.invalidate();
      utils.admin.audit.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to approve teacher"),
  });

  const rejectTeacherMutation = trpc.admin.rejectTeacher.useMutation({
    onSuccess: () => {
      toast.success("Teacher registration rejected.");
      utils.admin.pendingTeachers.invalidate();
      utils.admin.users.invalidate();
      utils.admin.audit.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to reject teacher"),
  });

  const backfillMutation = trpc.admin.backfillEmbeddings.useMutation({
    onSuccess: () => {
      toast.success("AI embeddings backfilled successfully!");
    },
    onError: (err) => toast.error(err.message || "Backfill failed"),
  });

  const counts = {
    total: users.length,
    students: users.filter((u) => u.role === "student" || u.role === "user").length,
    teachers: users.filter((u) => u.role === "teacher").length,
    admins: users.filter((u) => u.role === "admin").length,
    pending: pendingTeachers.length,
  };

  const filteredUsers = users.filter((u) => {
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 text-xs font-bold uppercase tracking-wider text-primary">
            <ShieldCheck className="size-4" /> Platform Control Plane
          </div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Admin Workspace</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage platform roles, review educator credentials, and audit administrative governance.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => {
              utils.admin.users.invalidate();
              utils.admin.pendingTeachers.invalidate();
              utils.admin.audit.invalidate();
              toast.success("Refreshed directory data");
            }}
            className="rounded-xl text-xs font-semibold gap-1.5"
          >
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button
            variant="secondary"
            onClick={() => backfillMutation.mutate()}
            disabled={backfillMutation.isPending}
            className="rounded-xl text-xs font-bold gap-1.5"
          >
            {backfillMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Database className="size-3.5" />
            )}
            Backfill Vectors
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Users
              </p>
              <p className="font-display text-3xl font-black mt-1">{counts.total}</p>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Students
              </p>
              <p className="font-display text-3xl font-black mt-1">{counts.students}</p>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-teal/10 text-teal-dark">
              <CheckCircle2 className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Teachers
              </p>
              <p className="font-display text-3xl font-black mt-1">{counts.teachers}</p>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="size-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/70 shadow-soft bg-card/70">
          <CardContent className="p-5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                Pending Approval
              </p>
              <p className="font-display text-3xl font-black mt-1 text-amber-600">{counts.pending}</p>
            </div>
            <div className="size-11 grid place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Clock className="size-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="rounded-2xl p-1 bg-muted/60 h-11">
          <TabsTrigger value="users" className="rounded-xl font-bold text-xs flex items-center gap-2 px-4">
            <Users className="size-3.5" /> User Directory ({users.length})
          </TabsTrigger>
          <TabsTrigger
            value="pending"
            className="rounded-xl font-bold text-xs flex items-center gap-2 px-4 relative"
          >
            <Clock className="size-3.5" /> Pending Teachers ({pendingTeachers.length})
            {pendingTeachers.length > 0 && (
              <span className="size-2 rounded-full bg-coral animate-pulse" />
            )}
          </TabsTrigger>
          <TabsTrigger value="audit" className="rounded-xl font-bold text-xs flex items-center gap-2 px-4">
            <History className="size-3.5" /> Audit Log ({auditLogs.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: User Directory */}
        <TabsContent value="users" className="mt-6 space-y-4">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search users by name, email, or platform role..."
                className="pl-10 h-11 rounded-2xl bg-card/60 backdrop-blur border-border/70"
              />
            </div>
          </div>

          <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
            {usersLoading ? (
              <div className="flex h-48 items-center justify-center">
                <Loader2 className="size-8 animate-spin text-primary" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No users match query.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {filteredUsers.map((u) => {
                  const isCurrentAdmin = u.id === user?.id;
                  return (
                    <div
                      key={u.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-10 border border-border">
                          {u.avatarUrl && <AvatarImage src={u.avatarUrl} />}
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                            {u.name?.slice(0, 1).toUpperCase() || "U"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground truncate">{u.name}</p>
                            {isCurrentAdmin && (
                              <span className="text-[10px] text-muted-foreground font-semibold">
                                (You)
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{u.email || "No email"}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            u.role === "admin"
                              ? "destructive"
                              : u.role === "teacher"
                              ? "default"
                              : "secondary"
                          }
                          className="capitalize text-xs font-bold"
                        >
                          {u.role}
                        </Badge>

                        {u.role === "teacher" && (
                          <Badge
                            variant={u.teacherApproval === "approved" ? "outline" : "secondary"}
                            className="text-[10px]"
                          >
                            {u.teacherApproval === "approved" ? "Approved" : "Pending"}
                          </Badge>
                        )}

                        <Select
                          defaultValue={u.role === "user" ? "student" : u.role}
                          onValueChange={(val) => {
                            if (val !== u.role) {
                              setRoleChangeUser({
                                id: u.id,
                                name: u.name || `User #${u.id}`,
                                currentRole: u.role,
                                newRole: val as any,
                              });
                            }
                          }}
                        >
                          <SelectTrigger className="rounded-xl h-9 text-xs w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Tab 2: Pending Teachers */}
        <TabsContent value="pending" className="mt-6 space-y-4 max-w-3xl">
          <div>
            <h2 className="font-display text-xl font-bold">Pending Educator Registrations</h2>
            <p className="text-xs text-muted-foreground">
              Users who self-registered with the Teacher role require administrator approval before
              their Teacher Portal and publishing workspace are activated.
            </p>
          </div>

          {pendingLoading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          ) : pendingTeachers.length === 0 ? (
            <Card className="rounded-3xl border-dashed border-2 border-border/80 p-8 text-center bg-card/40">
              <UserCheck className="size-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm font-bold">No pending teacher applications</p>
              <p className="text-xs text-muted-foreground mt-1">
                All educator accounts are currently verified and active.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingTeachers.map((teach) => (
                <Card
                  key={teach.id}
                  className="rounded-2xl border-border/70 p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-10 border border-border">
                      {teach.avatarUrl && <AvatarImage src={teach.avatarUrl} />}
                      <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                        {teach.name?.slice(0, 1).toUpperCase() || "T"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{teach.name}</h4>
                      <p className="text-xs text-muted-foreground">{teach.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={rejectTeacherMutation.isPending}
                      onClick={() =>
                        rejectTeacherMutation.mutate({
                          teacherUserId: teach.id,
                        })
                      }
                      className="rounded-xl text-xs text-destructive hover:text-destructive"
                    >
                      Reject & Demote
                    </Button>
                    <Button
                      size="sm"
                      disabled={approveTeacherMutation.isPending}
                      onClick={() => approveTeacherMutation.mutate({ teacherUserId: teach.id })}
                      className="rounded-xl text-xs font-bold shadow-lift"
                    >
                      {approveTeacherMutation.isPending && (
                        <Loader2 className="size-3.5 animate-spin mr-1" />
                      )}
                      Approve Educator
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Role Change Audit Log */}
        <TabsContent value="audit" className="mt-6 space-y-4">
          <div>
            <h2 className="font-display text-xl font-bold">Platform Role Change Audits</h2>
            <p className="text-xs text-muted-foreground">
              Traceable, immutable records of all platform role adjustments, including reasons and timestamps.
            </p>
          </div>

          <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden">
            {auditLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-primary" />
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No audit entries recorded.</div>
            ) : (
              <div className="divide-y divide-border/60">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-center justify-between gap-4 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">
                          User #{log.targetUserId}
                        </span>
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {log.oldRole}
                          </Badge>
                          <ArrowRight className="size-3 text-muted-foreground" />
                          <Badge variant="default" className="text-[10px] capitalize">
                            {log.newRole}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-muted-foreground">
                        Reason: {log.reason || "No reason specified"}
                      </p>
                    </div>

                    <div className="text-right text-[11px] text-muted-foreground">
                      <p>By Admin #{log.actorId}</p>
                      <p>{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* ======================================================== */}
      {/* Dialog: Confirm Platform Role Change */}
      {/* ======================================================== */}
      <Dialog
        open={roleChangeUser !== null}
        onOpenChange={(open) => {
          if (!open) setRoleChangeUser(null);
        }}
      >
        <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              Confirm Platform Role Change
            </DialogTitle>
            <DialogDescription>
              Modifying platform roles alters system authorization boundaries and unlocks or revokes
              privileged portals.
            </DialogDescription>
          </DialogHeader>

          {roleChangeUser && (
            <div className="space-y-4 mt-3">
              <div className="rounded-2xl border border-border/70 p-4 bg-muted/20 space-y-2">
                <p className="text-xs font-bold text-foreground">{roleChangeUser.name}</p>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Transition:</span>
                  <Badge variant="outline" className="capitalize">
                    {roleChangeUser.currentRole}
                  </Badge>
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <Badge variant="default" className="capitalize">
                    {roleChangeUser.newRole}
                  </Badge>
                </div>
                {roleChangeUser.newRole === "teacher" && (
                  <p className="text-[11px] text-primary leading-4">
                    Note: Admin promotions to Teacher activate immediately with no approval delay.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reason" className="text-xs font-bold">
                  Audit Reason (optional)
                </Label>
                <Input
                  id="reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="e.g. Approved faculty member for Spring semester"
                  className="rounded-xl h-11 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRoleChangeUser(null)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  disabled={changeRoleMutation.isPending}
                  onClick={() => {
                    changeRoleMutation.mutate({
                      userId: roleChangeUser.id,
                      role: roleChangeUser.newRole,
                      reason: changeReason.trim() || undefined,
                    });
                  }}
                  className="rounded-xl font-bold text-xs shadow-lift"
                >
                  {changeRoleMutation.isPending && (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  )}
                  Confirm Change
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
