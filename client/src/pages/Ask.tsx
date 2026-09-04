import { AIChatBox, Message } from "@/components/AIChatBox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, BookOpen, CheckCircle2, FileText, History, Image as ImageIcon, LockKeyhole, Plus, Sparkles, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function Ask() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [scope, setScope] = useState<string>("all");
  const [sources, setSources] = useState<Array<{ title: string; pageRef: string; visualUrl: string | null; visualIsImage: boolean; visualCaption: string | null }>>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);

  const subjects = trpc.subjects.list.useQuery();
  const groups = trpc.groups.list.useQuery();
  const history = trpc.ai.history.useQuery();
  const conversation = trpc.ai.conversation.useQuery({ conversationId: conversationId || 0 }, { enabled: Boolean(conversationId) });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gId = params.get("groupId");
    if (gId) {
      setScope(`group_${gId}`);
    }
  }, []);

  const ask = trpc.ai.ask.useMutation({
    onSuccess: (response) => {
      setConversationId(response.conversationId);
      setMessages((current) => [...current, { role: "assistant", content: response.answer }]);
      setSources(response.sources);
      history.refetch();
    },
    onError: (error) => {
      toast.error(error.message);
      setMessages((current) => current.slice(0, -1));
    },
  });

  const selectedLabel = useMemo(() => {
    if (scope === "all") return "All personal & class notes";
    if (scope.startsWith("group_")) {
      const gId = Number(scope.replace("group_", ""));
      const found = groups.data?.find((g) => g.id === gId);
      return found ? `Study Group: ${found.name}` : "Study Group";
    }
    const found = subjects.data?.find((item) => String(item.id) === scope);
    if (!found) return "Selected subject";
    return found.code ? `[${found.code}] ${found.name}` : found.name;
  }, [scope, subjects.data, groups.data]);

  useEffect(() => {
    if (!conversationId || !conversation.data) return;
    setMessages(conversation.data.flatMap((item) => [{ role: "user" as const, content: item.question }, { role: "assistant" as const, content: item.answer }]));
    setSources([]);
  }, [conversationId, conversation.data]);

  const send = (content: string) => {
    setMessages((current) => [...current, { role: "user", content }]);
    const isGroup = scope.startsWith("group_");
    const groupId = isGroup ? Number(scope.replace("group_", "")) : undefined;
    const subjectId = !isGroup && scope !== "all" ? Number(scope) : undefined;

    ask.mutate({
      question: content,
      subjectId,
      groupId,
      conversationId: conversationId || undefined,
    });
  };

  return (
    <div className="mx-auto max-w-[1320px] space-y-7">
      <section className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-coral-dark">
            <Sparkles className="size-4" /> Grounded study assistant
          </div>
          <h1 className="font-display text-3xl font-black tracking-tight sm:text-5xl">Ask your notes</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
            Ask a specific question and StudyNow will retrieve only notes from your chosen scope or study group.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl border border-teal/15 bg-teal/5 px-4 py-3 text-xs font-bold text-teal-dark">
          <LockKeyhole className="size-4" /> Authorized notes only
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <Card className="border-border/70 bg-card shadow-soft">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Search scope</p>
                <p className="mt-1 text-sm font-bold">{selectedLabel}</p>
              </div>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="w-full rounded-xl bg-white sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All my notes</SelectItem>
                  {Boolean(groups.data?.length) && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Study Groups
                      </div>
                      {groups.data?.map((g) => (
                        <SelectItem key={`g_${g.id}`} value={`group_${g.id}`}>
                          Group: {g.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {Boolean(subjects.data?.length) && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Subjects
                      </div>
                      {subjects.data?.map((subject) => (
                        <SelectItem key={subject.id} value={String(subject.id)}>
                          {subject.isGlobal ? "★ " : ""}{subject.code ? `[${subject.code}] ${subject.name}` : subject.name}
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          <AIChatBox
            messages={messages}
            onSendMessage={send}
            isLoading={ask.isPending}
            height="560px"
            placeholder="Ask about a definition, formula, diagram, or process…"
            emptyStateMessage="Your evidence-backed study session starts here"
            suggestedPrompts={[
              "Summarize the key ideas in this material",
              "What should I review before the exam?",
              "Explain the most difficult concept step by step",
            ]}
          />
        </div>

        <aside className="space-y-4">
          <Card className="border-border/70 bg-white/70 shadow-soft">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <History className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-lg font-extrabold">Study sessions</CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">Pick up where you left off</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="rounded-lg px-2"
                  onClick={() => {
                    setConversationId(null);
                    setMessages([]);
                    setSources([]);
                  }}
                >
                  <Plus className="mr-1 size-3.5" />New
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {history.isLoading ? (
                <p className="text-xs text-muted-foreground">Loading sessions…</p>
              ) : history.data?.length ? (
                <div className="space-y-2">
                  {history.data.slice(0, 5).map((item) => (
                    <Button
                      key={item.id}
                      variant={conversationId === item.id ? "secondary" : "ghost"}
                      className="h-auto w-full justify-start rounded-xl px-3 py-2 text-left"
                      onClick={() => {
                        setConversationId(item.id);
                        setMessages([]);
                      }}
                    >
                      <span className="line-clamp-2 text-xs font-bold">{item.title || "Untitled study session"}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-xs leading-5 text-muted-foreground">Your next question will create a saved session.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-white/70 shadow-soft">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-coral/10 text-coral-dark">
                  <CheckCircle2 className="size-5" />
                </div>
                <div>
                  <CardTitle className="font-display text-lg font-extrabold">Evidence first</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">How answers stay grounded</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-muted-foreground">
              <p><strong className="text-foreground">1. Retrieve.</strong> Relevant chunks are pulled from your selected notes or group pool.</p>
              <p><strong className="text-foreground">2. Explain.</strong> The AI answers exclusively from those notes.</p>
              <p><strong className="text-foreground">3. Cite.</strong> Each answer cites the exact note and section references.</p>
            </CardContent>
          </Card>
        </aside>
      </section>

      {sources.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">Retrieved evidence</p>
              <h2 className="mt-1 font-display text-2xl font-extrabold">Sources behind the answer</h2>
            </div>
            <Badge variant="outline" className="rounded-full">{sources.length} cited</Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((source, index) => (
              <Card key={`${source.title}-${index}`} className="overflow-hidden border-border/70 bg-card shadow-soft">
                <CardContent className="p-0">
                  {source.visualUrl && source.visualIsImage ? (
                    <img src={source.visualUrl} alt={source.visualCaption || `Visual from ${source.title}`} className="h-36 w-full object-cover" />
                  ) : (
                    <div className="grid h-24 place-items-center bg-muted/60">
                      {source.visualUrl ? (
                        <a href={source.visualUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-xs font-bold text-primary hover:bg-muted">
                          <ImageIcon className="size-4" />Open visual source
                        </a>
                      ) : (
                        <ImageIcon className="size-6 text-muted-foreground/60" />
                      )}
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary"><FileText className="size-4" /></div>
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Source {index + 1}</span>
                    </div>
                    <p className="mt-4 line-clamp-2 font-bold">{source.title}</p>
                    <p className="mt-1 text-xs font-semibold text-primary">{source.pageRef}</p>
                    {source.visualCaption && <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.visualCaption}</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
