import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { BookOpen, Boxes, GraduationCap, Loader2, Plus, Sparkles, UserPlus, Users } from "lucide-react";
import { useState } from "react";

export default function AdminClasses() {
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [subjectTerm, setSubjectTerm] = useState("");
  const [subjectDescription, setSubjectDescription] = useState("");

  const [className, setClassName] = useState("");
  const [classSubject, setClassSubject] = useState("");
  const [classTerm, setClassTerm] = useState("");
  const [classDescription, setClassDescription] = useState("");

  const [assignClass, setAssignClass] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [studentId, setStudentId] = useState("");

  const utils = trpc.useUtils();
  const subjects = trpc.admin.subjects.useQuery();
  const classes = trpc.admin.classes.useQuery();
  const users = trpc.admin.users.useQuery();

  const createSubject = trpc.subjects.create.useMutation({
    onSuccess: () => {
      toast.success("Curriculum subject created and visible to all students & teachers");
      setSubjectName("");
      setSubjectCode("");
      setSubjectTerm("");
      setSubjectDescription("");
      subjects.refetch();
      utils.subjects.list.invalidate();
      utils.dashboard.summary.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });

  const createClass = trpc.admin.createClass.useMutation({
    onSuccess: () => {
      toast.success("Class created");
      setClassName("");
      setClassSubject("");
      setClassTerm("");
      setClassDescription("");
      classes.refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const assignTeacher = trpc.admin.assignTeacher.useMutation({
    onSuccess: () => {
      toast.success("Teacher assigned");
      setTeacherId("");
    },
    onError: (error) => toast.error(error.message),
  });

  const assignStudent = trpc.admin.assignStudent.useMutation({
    onSuccess: () => {
      toast.success("Student assigned");
      setStudentId("");
    },
    onError: (error) => toast.error(error.message),
  });

  const teachers = users.data?.filter((user) => user.role === "teacher" && user.status !== "disabled") || [];
  const students = users.data?.filter((user) => ["student", "user"].includes(user.role) && user.status !== "disabled") || [];
  const selectedClass = classes.data?.find((item) => String(item.id) === assignClass);

  return (
    <div className="mx-auto max-w-[1320px] space-y-7">
      <section>
        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-primary">
          <Boxes className="size-4" /> Academic structure
        </div>
        <h1 className="font-display text-3xl font-black tracking-tight sm:text-5xl">
          Subjects & classes
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          Create official institution subjects with course codes. These subjects are instantly visible across the entire platform so students and teachers do not need to create them individually.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {/* Create Subject Card */}
        <Card className="border-border/70 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                <BookOpen className="size-5" />
              </div>
              <div>
                <CardTitle className="font-display text-xl font-extrabold">Create curriculum subject</CardTitle>
                <p className="text-xs text-muted-foreground">Global subject visible to all students and teachers</p>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full bg-primary/5 text-primary border-primary/20">
              Universal Catalog
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="admin-subject">Subject name <span className="text-destructive">*</span></Label>
                <Input
                  id="admin-subject"
                  value={subjectName}
                  onChange={(e) => setSubjectName(e.target.value)}
                  placeholder="e.g. Data Structures & Algorithms"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-code">Subject / Course code</Label>
                <Input
                  id="admin-code"
                  value={subjectCode}
                  onChange={(e) => setSubjectCode(e.target.value.toUpperCase())}
                  placeholder="e.g. CS-204"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-term">Term / Semester</Label>
                <Input
                  id="admin-term"
                  value={subjectTerm}
                  onChange={(e) => setSubjectTerm(e.target.value)}
                  placeholder="e.g. Fall 2026"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="admin-desc">Description <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Textarea
                  id="admin-desc"
                  value={subjectDescription}
                  onChange={(e) => setSubjectDescription(e.target.value)}
                  placeholder="Summary of syllabus, course overview, or target competencies…"
                  className="min-h-16"
                />
              </div>
            </div>

            <Button
              disabled={!subjectName.trim() || createSubject.isPending}
              onClick={() =>
                createSubject.mutate({
                  name: subjectName.trim(),
                  code: subjectCode.trim() || undefined,
                  term: subjectTerm.trim() || undefined,
                  description: subjectDescription.trim() || undefined,
                })
              }
              className="w-full rounded-xl"
            >
              {createSubject.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Create official subject
            </Button>

            <div className="mt-4 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Active Subjects</p>
                <Badge variant="outline" className="rounded-full text-[11px]">{subjects.data?.length || 0} total</Badge>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {subjects.data?.map((subject) => (
                  <div
                    key={subject.id}
                    className="flex items-center justify-between rounded-xl bg-muted/60 p-3 transition hover:bg-muted/80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {subject.code && (
                          <Badge variant="outline" className="font-mono text-[11px] font-bold bg-primary/10 text-primary border-primary/25">
                            {subject.code}
                          </Badge>
                        )}
                        <span className="truncate text-sm font-bold">{subject.name}</span>
                      </div>
                      {subject.term && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{subject.term}</p>
                      )}
                    </div>
                    <Badge variant="secondary" className="ml-2 shrink-0 rounded-full text-[11px]">
                      {subject.isGlobal ? "Official" : "Personal"}
                    </Badge>
                  </div>
                ))}
                {!subjects.isLoading && !subjects.data?.length && (
                  <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">
                    No subjects created yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Create Class Card */}
        <Card className="border-border/70 shadow-soft">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl bg-teal/10 text-teal-dark">
                <Boxes className="size-5" />
              </div>
              <div>
                <CardTitle className="font-display text-xl font-extrabold">Create a class</CardTitle>
                <p className="text-xs text-muted-foreground">Connect cohort sections to an official subject</p>
              </div>
            </div>
            <Badge variant="outline" className="rounded-full bg-teal/5 text-teal-dark border-teal/20">
              Cohorts & Sections
            </Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-class">Class name <span className="text-destructive">*</span></Label>
              <Input
                id="admin-class"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="e.g. CS-204 · Section A"
              />
            </div>
            <div className="space-y-2">
              <Label>Subject <span className="text-destructive">*</span></Label>
              <Select value={classSubject} onValueChange={setClassSubject}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Choose subject" />
                </SelectTrigger>
                <SelectContent>
                  {subjects.data?.map((subject) => (
                    <SelectItem key={subject.id} value={String(subject.id)}>
                      {subject.code ? `[${subject.code}] ${subject.name}` : subject.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="class-term">Term / Period <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input
                id="class-term"
                value={classTerm}
                onChange={(e) => setClassTerm(e.target.value)}
                placeholder="e.g. Fall 2026"
              />
            </div>
            <Button
              disabled={!className.trim() || !classSubject || createClass.isPending}
              onClick={() =>
                createClass.mutate({
                  name: className.trim(),
                  subjectId: Number(classSubject),
                  term: classTerm.trim() || undefined,
                  description: classDescription.trim() || undefined,
                })
              }
              className="w-full rounded-xl"
            >
              {createClass.isPending ? (
                <Loader2 className="mr-2 size-4 animate-spin" />
              ) : (
                <Plus className="mr-2 size-4" />
              )}
              Create class
            </Button>

            <div className="mt-4 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between pb-2">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Active Classes</p>
                <Badge variant="outline" className="rounded-full text-[11px]">{classes.data?.length || 0} total</Badge>
              </div>
              <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
                {classes.data?.map((item) => {
                  const subject = subjects.data?.find((s) => s.id === item.subjectId);
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-xl bg-muted/60 p-3 transition hover:bg-muted/80"
                    >
                      <span className="text-sm font-bold">{item.name}</span>
                      <Badge variant="outline" className="rounded-full text-[11px]">
                        {subject ? (subject.code ? `[${subject.code}] ${subject.name}` : subject.name) : "Subject"}
                      </Badge>
                    </div>
                  );
                })}
                {!classes.isLoading && !classes.data?.length && (
                  <p className="rounded-xl bg-muted/60 p-4 text-center text-sm text-muted-foreground">
                    No classes created yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Assign Portal Access */}
      <Card className="border-border/70 shadow-soft">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserPlus className="size-5" />
            </div>
            <div>
              <CardTitle className="font-display text-xl font-extrabold">Assign portal access</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Assignments determine who can publish to and retrieve from a class.
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={assignClass} onValueChange={setAssignClass}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose class" />
                </SelectTrigger>
                <SelectContent>
                  {classes.data?.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Teacher</Label>
              <Select value={teacherId} onValueChange={setTeacherId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose teacher" />
                </SelectTrigger>
                <SelectContent>
                  {teachers.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.name || user.email || `User #${user.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="mt-3 w-full rounded-xl bg-white/70"
                disabled={!assignClass || !teacherId || assignTeacher.isPending}
                onClick={() =>
                  assignTeacher.mutate({
                    classId: Number(assignClass),
                    teacherId: Number(teacherId),
                  })
                }
              >
                {assignTeacher.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <GraduationCap className="mr-2 size-4" />
                )}
                Assign teacher
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Student</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose student" />
                </SelectTrigger>
                <SelectContent>
                  {students.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.name || user.email || `User #${user.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="mt-3 w-full rounded-xl bg-white/70"
                disabled={!assignClass || !studentId || assignStudent.isPending}
                onClick={() =>
                  assignStudent.mutate({
                    classId: Number(assignClass),
                    studentId: Number(studentId),
                  })
                }
              >
                {assignStudent.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : (
                  <Users className="mr-2 size-4" />
                )}
                Assign student
              </Button>
            </div>
          </div>
          {selectedClass && (
            <div className="mt-6 rounded-2xl border border-teal/15 bg-teal/5 p-4 text-sm text-teal-dark">
              <p className="font-bold">{selectedClass.name}</p>
              <p className="mt-1 text-xs leading-5">
                Choose a teacher and student above to add them to this class. Existing assignments are kept idempotent.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Info Cards */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/70 bg-primary text-primary-foreground shadow-soft">
          <CardContent className="p-5">
            <Boxes className="size-5" />
            <p className="mt-5 font-display text-lg font-extrabold">Curriculum wide</p>
            <p className="mt-2 text-sm leading-6 text-primary-foreground/75">
              Subjects with official course codes are automatically available to all students and teachers.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-teal text-white shadow-soft">
          <CardContent className="p-5">
            <Users className="size-5" />
            <p className="mt-5 font-display text-lg font-extrabold">Permission by assignment</p>
            <p className="mt-2 text-sm leading-6 text-white/75">
              Teachers and students get access through explicit class membership, not open links.
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/70 bg-white/70 shadow-soft">
          <CardContent className="p-5">
            <Sparkles className="size-5 text-coral-dark" />
            <p className="mt-5 font-display text-lg font-extrabold">Personal study flexibility</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Students and teachers can also create their own personal subjects for private revision.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
