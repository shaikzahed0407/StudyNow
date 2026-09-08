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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  BookOpen,
  Check,
  ExternalLink,
  Globe,
  GraduationCap,
  Link2,
  Linkedin,
  Loader2,
  Save,
  Shield,
  Sparkles,
  User as UserIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  const { data: profile, isLoading } = trpc.profiles.getProfile.useQuery();

  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [github, setGithub] = useState("");
  const [linkedin, setLinkedin] = useState("");

  useEffect(() => {
    if (profile) {
      setName(profile.name || "");
      setAvatarUrl(profile.avatarUrl || "");
      setBio(profile.bio || "");

      if (profile.externalLinks) {
        try {
          const links = JSON.parse(profile.externalLinks);
          setWebsite(links.website || "");
          setGithub(links.github || "");
          setLinkedin(links.linkedin || "");
        } catch {
          // If plain string, fallback
        }
      }
    }
  }, [profile]);

  const updateMutation = trpc.profiles.updateProfile.useMutation({
    onSuccess: async () => {
      await utils.profiles.getProfile.invalidate();
      await utils.auth.me.invalidate();
      toast.success("Profile updated successfully!");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to update profile");
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Name cannot be empty");
      return;
    }

    const linksObj = {
      website: website.trim(),
      github: github.trim(),
      linkedin: linkedin.trim(),
    };

    updateMutation.mutate({
      name: name.trim(),
      avatarUrl: avatarUrl.trim() || undefined,
      bio: bio.trim() || undefined,
      externalLinks: JSON.stringify(linksObj),
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-tight">Your Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your personal details, public bio, and connected external links.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* Left Column: Live Public Profile Card Preview */}
        <div className="space-y-6">
          <Card className="rounded-3xl border-border/70 shadow-soft overflow-hidden bg-card/70 backdrop-blur">
            <div className="h-24 bg-gradient-to-r from-primary/20 via-primary/10 to-accent/30" />
            <CardContent className="relative pt-0 pb-6 px-6 text-center">
              <div className="-mt-12 mb-3 flex justify-center">
                <Avatar className="size-24 border-4 border-card shadow-soft">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt={name} />
                  ) : null}
                  <AvatarFallback className="bg-primary/15 text-2xl font-black text-primary">
                    {name?.slice(0, 1).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </div>

              <h2 className="text-xl font-bold tracking-tight">{name || "StudyNow User"}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{profile?.email || "No email"}</p>

              <div className="mt-3 flex justify-center gap-1.5">
                <Badge
                  variant={
                    profile?.role === "admin"
                      ? "destructive"
                      : profile?.role === "teacher"
                      ? "default"
                      : "secondary"
                  }
                  className="capitalize font-bold text-xs"
                >
                  {profile?.role || "student"}
                </Badge>
                {profile?.role === "teacher" && (
                  <Badge
                    variant={profile?.teacherApproval === "approved" ? "outline" : "secondary"}
                    className="text-[10px]"
                  >
                    {profile?.teacherApproval === "approved" ? "Approved" : "Pending Review"}
                  </Badge>
                )}
              </div>

              {bio ? (
                <p className="mt-4 text-xs leading-5 text-muted-foreground line-clamp-4 text-left bg-muted/40 p-3 rounded-xl">
                  {bio}
                </p>
              ) : (
                <p className="mt-4 text-xs italic text-muted-foreground/60">
                  No bio added yet. Add a short summary to help group peers know your study interests.
                </p>
              )}

              {(website || github || linkedin) && (
                <div className="mt-4 flex justify-center gap-3 text-muted-foreground">
                  {website && (
                    <a
                      href={website.startsWith("http") ? website : `https://${website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                      title="Website"
                    >
                      <Globe className="size-4" />
                    </a>
                  )}
                  {github && (
                    <a
                      href={
                        github.startsWith("http")
                          ? github
                          : `https://github.com/${github.replace(/^@/, "")}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                      title="GitHub"
                    >
                      <Link2 className="size-4" />
                    </a>
                  )}
                  {linkedin && (
                    <a
                      href={linkedin.startsWith("http") ? linkedin : `https://linkedin.com/in/${linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors"
                      title="LinkedIn"
                    >
                      <Linkedin className="size-4" />
                    </a>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Edit Details Form */}
        <div className="md:col-span-2">
          <Card className="rounded-3xl border-border/70 shadow-soft">
            <form onSubmit={handleSave}>
              <CardHeader>
                <CardTitle className="font-display text-xl font-bold">Edit Profile Details</CardTitle>
                <CardDescription>
                  This information will be displayed when other members view your profile inside study groups.
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="font-semibold text-sm">
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    className="rounded-xl h-11"
                    maxLength={100}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="avatarUrl" className="font-semibold text-sm">
                    Avatar Image URL
                  </Label>
                  <Input
                    id="avatarUrl"
                    value={avatarUrl}
                    onChange={(e) => setAvatarUrl(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="rounded-xl h-11"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Provide an image link to personalize your profile across all study groups.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="bio" className="font-semibold text-sm">
                    Bio & Study Interests
                  </Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Computer Science undergraduate passionate about distributed systems and machine learning..."
                    className="rounded-xl min-h-[100px] resize-none"
                    maxLength={1000}
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>Markdown or plain text</span>
                    <span>{bio.length}/1000</span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="font-semibold text-sm text-foreground">External Links & Socials</h3>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="website" className="text-xs text-muted-foreground">
                        Website / Portfolio
                      </Label>
                      <Input
                        id="website"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                        placeholder="https://mywebsite.com"
                        className="rounded-xl h-10 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="github" className="text-xs text-muted-foreground">
                        GitHub Username / Link
                      </Label>
                      <Input
                        id="github"
                        value={github}
                        onChange={(e) => setGithub(e.target.value)}
                        placeholder="username"
                        className="rounded-xl h-10 text-xs"
                      />
                    </div>

                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="linkedin" className="text-xs text-muted-foreground">
                        LinkedIn Profile URL
                      </Label>
                      <Input
                        id="linkedin"
                        value={linkedin}
                        onChange={(e) => setLinkedin(e.target.value)}
                        placeholder="https://linkedin.com/in/..."
                        className="rounded-xl h-10 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              <CardFooter className="flex justify-end gap-3 border-t border-border/60 pt-5">
                <Button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="rounded-xl font-bold px-6 shadow-lift"
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin mr-2" />
                  ) : (
                    <Save className="size-4 mr-2" />
                  )}
                  Save Profile Changes
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
