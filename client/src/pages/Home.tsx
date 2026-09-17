import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { ArrowRight, BookOpen, Check, LayoutGrid, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { LoginModal } from "@/components/LoginModal";

const features = [
  { icon: Search, title: "Find the exact thread", copy: "Search subjects, titles, tags, and source material without opening every file." },
  { icon: Sparkles, title: "Ask with evidence", copy: "Get concise answers grounded in the notes you are authorized to access." },
  { icon: ShieldCheck, title: "Keep access clear", copy: "Private student notes and class resources stay inside role-based workspaces." },
];

export default function Home() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();
  const [loginOpen, setLoginOpen] = useState(false);

  useEffect(() => {
    if (user) setLocation("/dashboard");
  }, [user, setLocation]);

  if (loading || user) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex items-center gap-3 text-sm font-semibold text-muted-foreground">
          <div className="size-2 animate-pulse rounded-full bg-coral" />
          Preparing your workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} showBackButton={false} />

      <header className="relative z-10 mx-auto flex max-w-[1240px] items-center justify-between px-6 py-6 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift">
            <BookOpen className="size-5" />
          </div>
          <div>
            <p className="font-display text-lg font-extrabold tracking-tight">StudyNow</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Knowledge, organized.</p>
          </div>
        </div>
        <Button variant="outline" className="rounded-xl border-border/80 bg-white/80" onClick={() => setLoginOpen(true)}>
          Sign in <ArrowRight className="ml-2 size-4" />
        </Button>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1240px] items-center gap-14 px-6 pb-20 pt-10 lg:grid-cols-[1.02fr_0.98fr] lg:px-10 lg:pb-28 lg:pt-20">
          <div className="relative z-10 max-w-2xl">
            <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-teal/20 bg-teal/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.12em] text-teal-dark">
              <span className="size-1.5 rounded-full bg-teal" /> One clear place for every class
            </div>
            <h1 className="font-display text-[clamp(3rem,7vw,6.5rem)] font-black leading-[0.92] tracking-[-0.07em]">
              Make your notes <span className="text-primary">thinkable.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-muted-foreground">
              StudyNow brings private notes, teacher resources, and evidence-backed AI answers into one structured workspace built for the way students actually revise.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button size="lg" className="h-12 rounded-xl px-6 shadow-lift" onClick={() => setLoginOpen(true)}>
                Enter your workspace <ArrowRight className="ml-2 size-4" />
              </Button>
              <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-white/75 px-4 text-sm font-semibold text-muted-foreground">
                <Check className="size-4 text-teal" /> Admin-controlled access
              </div>
            </div>
            <div className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-border/70 pt-6">
              <div>
                <p className="font-display text-2xl font-extrabold">03</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">role-based portals</p>
              </div>
              <div>
                <p className="font-display text-2xl font-extrabold">01</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">searchable source of truth</p>
              </div>
              <div>
                <p className="font-display text-2xl font-extrabold">∞</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">ways to learn</p>
              </div>
            </div>
          </div>

          <div className="relative min-h-[430px] lg:min-h-[540px]" aria-label="StudyNow isometric workspace illustration">
            <div className="iso-grid absolute inset-4 rounded-[38px] opacity-80" />
            <div className="iso-plane iso-plane-coral absolute right-6 top-4 h-40 w-56 rounded-[28px] p-5 shadow-lift">
              <div className="flex items-center justify-between text-white">
                <span className="text-xs font-bold uppercase tracking-[0.16em]">01 / Source</span>
                <BookOpen className="size-5" />
              </div>
              <p className="mt-16 font-display text-2xl font-black text-white">Lecture notes</p>
            </div>
            <div className="iso-plane iso-plane-blue absolute left-5 top-32 h-52 w-72 rounded-[32px] p-6 shadow-lift">
              <div className="flex items-center justify-between text-white">
                <span className="text-xs font-bold uppercase tracking-[0.16em]">02 / Retrieve</span>
                <LayoutGrid className="size-5" />
              </div>
              <div className="mt-8 space-y-3">
                <div className="h-2 w-4/5 rounded-full bg-white/80" />
                <div className="h-2 w-3/5 rounded-full bg-white/45" />
                <div className="h-2 w-2/5 rounded-full bg-white/45" />
              </div>
              <p className="mt-7 font-display text-xl font-black text-white">Answer with context</p>
            </div>
            <div className="iso-plane iso-plane-teal absolute bottom-8 right-8 h-48 w-64 rounded-[30px] p-5 shadow-lift">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl bg-white/20">
                  <Sparkles className="size-5 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.15em] text-white/75">03 / Evidence</p>
                  <p className="font-display text-lg font-black text-white">Cited + visual</p>
                </div>
              </div>
              <div className="mt-8 flex items-center gap-2">
                <span className="h-9 flex-1 rounded-xl bg-white/20" />
                <span className="h-9 w-9 rounded-xl border border-white/30 bg-white/10" />
              </div>
            </div>
            <div className="absolute bottom-0 left-1/2 grid size-16 -translate-x-1/2 place-items-center rounded-2xl border border-border/70 bg-white/90 shadow-card">
              <BookOpen className="size-7 text-primary" />
            </div>
          </div>
        </section>

        <section className="border-y border-border/70 bg-white/55">
          <div className="mx-auto grid max-w-[1240px] gap-px px-6 lg:grid-cols-3 lg:px-10">
            {features.map(({ icon: Icon, title, copy }) => (
              <div key={title} className="border-border/70 py-9 lg:border-r lg:px-8 lg:first:pl-0 lg:last:border-r-0">
                <Icon className="size-5 text-primary" />
                <h2 className="mt-5 font-display text-lg font-extrabold tracking-tight">{title}</h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{copy}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-[1240px] px-6 py-16 text-center lg:px-10 lg:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-coral-dark">Designed for focus</p>
          <h2 className="mx-auto mt-4 max-w-2xl font-display text-3xl font-black tracking-tight sm:text-5xl">
            Structure the material. Keep the thinking yours.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-muted-foreground">
            Start with the notes you already have. StudyNow creates the quiet layer between scattered files and confident recall.
          </p>
          <Button variant="outline" className="mt-8 rounded-xl" onClick={() => setLoginOpen(true)}>
            Start organizing <ArrowRight className="ml-2 size-4" />
          </Button>
        </section>
      </main>

      <footer className="mx-auto flex max-w-[1240px] items-center justify-between border-t border-border/70 px-6 py-7 text-xs font-semibold text-muted-foreground lg:px-10">
        <span>© 2026 StudyNow</span>
        <span>Private by default · grounded by evidence</span>
      </footer>
    </div>
  );
}
