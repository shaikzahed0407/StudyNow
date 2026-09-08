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
  ArchiveRestore,
  Bookmark,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderPlus,
  Heart,
  Inbox,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Upload,
  UploadCloud,
  Users,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const COLLECTION_COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Emerald
  "#8B5CF6", // Purple
  "#F59E0B", // Amber
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#EF4444", // Red
  "#6B7280", // Slate
];

export default function Notes() {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  // Active view: "all" | "favorites" | "uncategorized" | "trash" | "collection"
  const [activeView, setActiveView] = useState<
    "all" | "favorites" | "uncategorized" | "trash" | "collection"
  >("all");
  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  // Dialog States
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteType, setNoteType] = useState<"text" | "file">("text");
  const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<{
    id: number;
    name: string;
    color: string;
  } | null>(null);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [noteToShare, setNoteToShare] = useState<number | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [previewNoteId, setPreviewNoteId] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("preview");
      if (p) {
        const id = parseInt(p, 10);
        if (!isNaN(id) && id > 0) return id;
      }
    }
    return null;
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const p = params.get("preview");
      if (p) {
        const id = parseInt(p, 10);
        if (!isNaN(id) && id > 0) setPreviewNoteId(id);
      }
    }
  }, []);

  // Form States - Note
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteSource, setNoteSource] = useState("");
  const [noteTags, setNoteTags] = useState("");
  const [noteCollectionId, setNoteCollectionId] = useState<string>("none");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form States - Collection
  const [collectionName, setCollectionName] = useState("");
  const [collectionColor, setCollectionColor] = useState(COLLECTION_COLORS[0]);

  // Queries
  const { data: collections = [] } = trpc.collections.list.useQuery();
  const { data: groups = [] } = trpc.groups.list.useQuery();

  const notesQueryInput = useMemo(() => {
    if (activeView === "collection" && selectedCollectionId !== null) {
      return {
        collectionId: selectedCollectionId,
        search: search.trim() || undefined,
      };
    }
    return {
      filter: activeView as "all" | "favorites" | "uncategorized" | "trash",
      search: search.trim() || undefined,
    };
  }, [activeView, selectedCollectionId, search]);

  const { data: notes = [], isLoading: notesLoading } =
    trpc.notes.list.useQuery(notesQueryInput);

  const { data: previewNote, isLoading: previewLoading } = trpc.notes.get.useQuery(
    { noteId: previewNoteId! },
    { enabled: previewNoteId !== null }
  );

  // Mutations
  const createTextMutation = trpc.notes.createText.useMutation({
    onSuccess: () => {
      toast.success("Text note created successfully!");
      setNoteDialogOpen(false);
      resetNoteForm();
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to create note"),
  });

  const createFileMutation = trpc.notes.createFile.useMutation({
    onSuccess: () => {
      toast.success("File uploaded and processed!");
      setNoteDialogOpen(false);
      resetNoteForm();
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to upload file"),
  });

  const favoriteMutation = trpc.notes.favorite.useMutation({
    onSuccess: () => {
      utils.notes.list.invalidate();
    },
  });

  const moveToCollectionMutation = trpc.notes.moveToCollection.useMutation({
    onSuccess: () => {
      toast.success("Note moved");
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const trashMutation = trpc.notes.trash.useMutation({
    onSuccess: () => {
      toast.success("Note moved to Trash");
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const restoreMutation = trpc.notes.restore.useMutation({
    onSuccess: () => {
      toast.success("Note restored from Trash");
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const deletePermanentMutation = trpc.notes.delete.useMutation({
    onSuccess: () => {
      toast.success("Note permanently deleted");
      if (previewNoteId) setPreviewNoteId(null);
      utils.notes.list.invalidate();
      utils.collections.list.invalidate();
    },
  });

  const createCollectionMutation = trpc.collections.create.useMutation({
    onSuccess: () => {
      toast.success("Collection created!");
      setCollectionDialogOpen(false);
      setCollectionName("");
      utils.collections.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to create collection"),
  });

  const renameCollectionMutation = trpc.collections.rename.useMutation({
    onSuccess: () => {
      toast.success("Collection updated!");
      setCollectionDialogOpen(false);
      setEditingCollection(null);
      setCollectionName("");
      utils.collections.list.invalidate();
    },
    onError: (err) => toast.error(err.message || "Failed to update collection"),
  });

  const deleteCollectionMutation = trpc.collections.delete.useMutation({
    onSuccess: () => {
      toast.success("Collection deleted (notes moved to uncategorized)");
      if (activeView === "collection") {
        setActiveView("all");
        setSelectedCollectionId(null);
      }
      utils.collections.list.invalidate();
      utils.notes.list.invalidate();
    },
  });

  const shareMutation = trpc.sharing.shareToGroup.useMutation({
    onSuccess: (data) => {
      if (data.alreadyShared) {
        toast.info("This note is already shared with this group.");
      } else {
        toast.success("Note shared to study group!");
      }
      setShareDialogOpen(false);
      setNoteToShare(null);
      setSelectedGroupId(null);
    },
    onError: (err) => toast.error(err.message || "Failed to share note"),
  });

  const resetNoteForm = () => {
    setNoteTitle("");
    setNoteContent("");
    setNoteSource("");
    setNoteTags("");
    setNoteCollectionId("none");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim()) {
      toast.error("Please provide a note title");
      return;
    }

    const collId = noteCollectionId === "none" ? undefined : Number(noteCollectionId);

    if (noteType === "text") {
      if (!noteContent.trim()) {
        toast.error("Please provide note content");
        return;
      }
      createTextMutation.mutate({
        title: noteTitle.trim(),
        content: noteContent.trim(),
        source: noteSource.trim() || undefined,
        tags: noteTags.trim() || undefined,
        collectionId: collId,
      });
    } else {
      if (!file) {
        toast.error("Please select a file to upload");
        return;
      }
      const base64 = await fileToBase64(file);
      createFileMutation.mutate({
        title: noteTitle.trim(),
        source: noteSource.trim() || undefined,
        tags: noteTags.trim() || undefined,
        collectionId: collId,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        base64,
      });
    }
  };

  const handleSaveCollection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectionName.trim()) {
      toast.error("Please enter a collection name");
      return;
    }

    if (editingCollection) {
      renameCollectionMutation.mutate({
        collectionId: editingCollection.id,
        name: collectionName.trim(),
      });
    } else {
      createCollectionMutation.mutate({
        name: collectionName.trim(),
        color: collectionColor,
      });
    }
  };

  const openCreateCollection = () => {
    setEditingCollection(null);
    setCollectionName("");
    setCollectionColor(COLLECTION_COLORS[0]);
    setCollectionDialogOpen(true);
  };

  const openEditCollection = (coll: { id: number; name: string; color: string | null }) => {
    setEditingCollection({
      id: coll.id,
      name: coll.name,
      color: coll.color || COLLECTION_COLORS[0],
    });
    setCollectionName(coll.name);
    setCollectionColor(coll.color || COLLECTION_COLORS[0]);
    setCollectionDialogOpen(true);
  };

  const getFileIcon = (mimeType?: string | null) => {
    if (!mimeType) return FileText;
    if (mimeType.includes("pdf")) return FileText;
    if (mimeType.includes("image")) return FileImage;
    if (mimeType.includes("presentation") || mimeType.includes("powerpoint")) return FileSpreadsheet;
    if (mimeType.includes("word") || mimeType.includes("officedocument")) return FileCode;
    return File;
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Personal Note Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your private, Raindrop-style knowledge base. Organize by custom collections, mark favorites,
            and preview files seamlessly.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => {
              resetNoteForm();
              setNoteDialogOpen(true);
            }}
            className="rounded-xl font-bold shadow-lift gap-2"
          >
            <Plus className="size-4" /> Add Note
          </Button>
        </div>
      </div>

      {/* Main Grid: Raindrop-Style Sidebar + Notes Grid */}
      <div className="grid gap-6 md:grid-cols-12">
        {/* Left Sidebar: Raindrop Collections & Filter Tree */}
        <div className="md:col-span-4 lg:col-span-3 space-y-4">
          <Card className="rounded-3xl border-border/70 shadow-soft p-3 bg-card/60 backdrop-blur">
            <div className="space-y-1">
              <button
                onClick={() => {
                  setActiveView("all");
                  setSelectedCollectionId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeView === "all"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted/80 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Inbox className="size-4" />
                  <span>All Notes</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveView("favorites");
                  setSelectedCollectionId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeView === "favorites"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted/80 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Star className="size-4 text-amber-500 fill-amber-500" />
                  <span>Favorites</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveView("uncategorized");
                  setSelectedCollectionId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeView === "uncategorized"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-muted/80 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FileText className="size-4 text-muted-foreground" />
                  <span>Uncategorized</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setActiveView("trash");
                  setSelectedCollectionId(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  activeView === "trash"
                    ? "bg-destructive text-destructive-foreground shadow-sm"
                    : "hover:bg-muted/80 text-foreground"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Trash2 className="size-4 text-muted-foreground" />
                  <span>Trash</span>
                </div>
              </button>
            </div>

            <div className="my-3 border-t border-border/60 pt-3">
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  My Collections
                </span>
                <button
                  onClick={openCreateCollection}
                  className="size-6 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  title="Create new personal collection"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>

              <ScrollArea className="max-h-[300px] pr-1">
                {collections.length === 0 ? (
                  <p className="text-xs text-muted-foreground/70 px-3 py-2 italic">
                    No custom collections yet. Click '+' to group your study notes.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {collections.map((coll) => {
                      const isSelected =
                        activeView === "collection" && selectedCollectionId === coll.id;
                      return (
                        <div
                          key={coll.id}
                          className={`group flex items-center justify-between px-3 py-2 rounded-xl text-sm font-medium transition cursor-pointer ${
                            isSelected
                              ? "bg-primary/15 text-primary font-bold"
                              : "hover:bg-muted/60 text-foreground"
                          }`}
                          onClick={() => {
                            setActiveView("collection");
                            setSelectedCollectionId(coll.id);
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: coll.color || "#3B82F6" }}
                            />
                            <span className="truncate text-xs">{coll.name}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                              {coll.noteCount}
                            </span>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                asChild
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button className="opacity-0 group-hover:opacity-100 size-6 grid place-items-center rounded hover:bg-muted text-muted-foreground">
                                  <MoreVertical className="size-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36 rounded-xl">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditCollection(coll);
                                  }}
                                  className="text-xs gap-2"
                                >
                                  <Pencil className="size-3.5" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (confirm("Delete collection? Notes will become uncategorized.")) {
                                      deleteCollectionMutation.mutate({ collectionId: coll.id });
                                    }
                                  }}
                                  className="text-xs gap-2 text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="size-3.5" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </div>
          </Card>
        </div>

        {/* Right Area: Search, View Filter Header & Note Cards */}
        <div className="md:col-span-8 lg:col-span-9 space-y-4">
          {/* Search bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes by title, keywords, content, or tags..."
                className="pl-10 h-11 rounded-2xl bg-card/60 backdrop-blur border-border/70"
              />
            </div>
            {search && (
              <Button
                variant="ghost"
                onClick={() => setSearch("")}
                className="rounded-2xl h-11 text-xs"
              >
                Clear
              </Button>
            )}
          </div>

          {/* Notes Grid */}
          {notesLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-primary" />
            </div>
          ) : notes.length === 0 ? (
            <Card className="rounded-3xl border-dashed border-2 border-border/80 p-12 text-center bg-card/40">
              <div className="mx-auto size-12 grid place-items-center rounded-2xl bg-muted text-muted-foreground mb-4">
                {activeView === "trash" ? (
                  <Trash2 className="size-6" />
                ) : activeView === "favorites" ? (
                  <Star className="size-6" />
                ) : (
                  <FileText className="size-6" />
                )}
              </div>
              <h3 className="font-display text-lg font-bold">
                {activeView === "trash"
                  ? "Trash is empty"
                  : activeView === "favorites"
                  ? "No favorite notes yet"
                  : "No notes found"}
              </h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {activeView === "trash"
                  ? "Deleted notes will appear here. You can restore or permanently delete them."
                  : activeView === "favorites"
                  ? "Click the star icon on any note to pin it to your favorites."
                  : "Start uploading study slides, textbooks, or writing down summaries."}
              </p>
              {activeView !== "trash" && (
                <Button
                  onClick={() => {
                    resetNoteForm();
                    setNoteDialogOpen(true);
                  }}
                  className="mt-5 rounded-xl font-bold text-xs"
                >
                  <Plus className="size-3.5 mr-1.5" /> Create Your First Note
                </Button>
              )}
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {notes.map((note) => {
                const isTrash = Boolean(note.isTrash);
                const isFile = note.kind === "file";
                const collection = collections.find((c) => c.id === note.collectionId);

                return (
                  <Card
                    key={note.id}
                    onClick={() => setPreviewNoteId(note.id)}
                    className="group rounded-3xl border-border/70 hover:border-primary/40 hover:shadow-soft transition-all duration-200 bg-card/80 backdrop-blur flex flex-col overflow-hidden cursor-pointer"
                  >
                    <CardHeader className="p-4 pb-2 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="size-8 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                            {isFile ? <File className="size-4" /> : <FileText className="size-4" />}
                          </div>
                          <div className="min-w-0">
                            <CardTitle className="text-sm font-bold line-clamp-1 group-hover:text-primary transition-colors">
                              {note.title}
                            </CardTitle>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                              {isFile ? "Document" : "Text Note"}
                            </span>
                          </div>
                        </div>

                        {!isTrash && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              favoriteMutation.mutate({
                                noteId: note.id,
                              });
                            }}
                            className="size-8 grid place-items-center rounded-lg hover:bg-muted text-muted-foreground hover:text-amber-500 transition-colors"
                            title={note.isFavorite ? "Remove favorite" : "Add to favorites"}
                          >
                            <Star
                              className={`size-4 ${
                                note.isFavorite ? "text-amber-500 fill-amber-500" : ""
                              }`}
                            />
                          </button>
                        )}
                      </div>

                      {collection && (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ backgroundColor: collection.color || "#3B82F6" }}
                          />
                          <span className="text-[11px] font-semibold text-muted-foreground truncate">
                            {collection.name}
                          </span>
                        </div>
                      )}
                    </CardHeader>

                    <CardContent className="p-4 pt-1 flex-1">
                      <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
                        {note.content ? note.content.slice(0, 140) : "No excerpt available."}
                      </p>

                      {note.tags && (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {note.tags
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .slice(0, 3)
                            .map((tag) => (
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="text-[9px] px-1.5 py-0 rounded-md font-medium"
                              >
                                #{tag}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="p-3 pt-2 border-t border-border/50 flex items-center justify-between bg-muted/20">
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="size-3" />
                        <span>
                          {new Date(note.updatedAt || note.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {isTrash ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                restoreMutation.mutate({ noteId: note.id });
                              }}
                              className="h-7 text-xs rounded-lg px-2"
                            >
                              <ArchiveRestore className="size-3 mr-1" /> Restore
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm("Permanently delete this note? Cannot be undone.")) {
                                  deletePermanentMutation.mutate({ noteId: note.id });
                                }
                              }}
                              className="h-7 text-xs rounded-lg px-2"
                            >
                              Delete
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewNoteId(note.id);
                              }}
                              className="h-7 text-xs rounded-lg px-2 text-muted-foreground hover:text-foreground"
                            >
                              <Eye className="size-3 mr-1" /> Preview
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="size-7 rounded-lg text-muted-foreground hover:text-foreground"
                                >
                                  <MoreVertical className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 rounded-xl">
                                <DropdownMenuLabel className="text-xs">Note Actions</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setNoteToShare(note.id);
                                    setShareDialogOpen(true);
                                  }}
                                  className="text-xs gap-2"
                                >
                                  <Share2 className="size-3.5 text-primary" /> Share to Study Group
                                </DropdownMenuItem>

                                <DropdownMenuSeparator />

                                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                  Move to Collection
                                </DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() =>
                                    moveToCollectionMutation.mutate({
                                      noteId: note.id,
                                      collectionId: null,
                                    })
                                  }
                                  className="text-xs gap-2"
                                >
                                  <FileText className="size-3.5" /> Uncategorized
                                </DropdownMenuItem>
                                {collections.map((coll) => (
                                  <DropdownMenuItem
                                    key={coll.id}
                                    onClick={() =>
                                      moveToCollectionMutation.mutate({
                                        noteId: note.id,
                                        collectionId: coll.id,
                                      })
                                    }
                                    className="text-xs gap-2"
                                  >
                                    <span
                                      className="size-2 rounded-full"
                                      style={{ backgroundColor: coll.color || "#3B82F6" }}
                                    />
                                    <span>{coll.name}</span>
                                  </DropdownMenuItem>
                                ))}

                                <DropdownMenuSeparator />

                                <DropdownMenuItem
                                  onClick={() => trashMutation.mutate({ noteId: note.id })}
                                  className="text-xs gap-2 text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="size-3.5" /> Move to Trash
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ======================================================== */}
      {/* Dialog: Create Note (Text vs File Upload) */}
      {/* ======================================================== */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="max-w-xl rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-black">
              Add to Personal Library
            </DialogTitle>
            <DialogDescription>
              Write rich notes or upload slides and textbooks. Gemini extracts searchable content and
              visual diagrams.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={noteType}
            onValueChange={(val) => setNoteType(val as "text" | "file")}
            className="mt-3"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-xl h-10 p-1 bg-muted/60">
              <TabsTrigger
                value="text"
                className="rounded-lg font-bold text-xs flex items-center gap-1.5"
              >
                <FileText className="size-3.5" /> Text Note
              </TabsTrigger>
              <TabsTrigger
                value="file"
                className="rounded-lg font-bold text-xs flex items-center gap-1.5"
              >
                <UploadCloud className="size-3.5" /> Upload File (PDF, PPTX, DOCX)
              </TabsTrigger>
            </TabsList>

            <form onSubmit={handleCreateNote} className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title" className="text-xs font-bold">
                  Note Title
                </Label>
                <Input
                  id="title"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  placeholder="e.g. Distributed Consensus & Paxos Overview"
                  className="rounded-xl h-11"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="collection" className="text-xs font-bold">
                    Personal Collection
                  </Label>
                  <Select value={noteCollectionId} onValueChange={setNoteCollectionId}>
                    <SelectTrigger className="rounded-xl h-10 text-xs">
                      <SelectValue placeholder="Select collection" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {collections.map((coll) => (
                        <SelectItem key={coll.id} value={String(coll.id)}>
                          <div className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: coll.color || "#3B82F6" }}
                            />
                            <span>{coll.name}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tags" className="text-xs font-bold">
                    Tags (comma-separated)
                  </Label>
                  <Input
                    id="tags"
                    value={noteTags}
                    onChange={(e) => setNoteTags(e.target.value)}
                    placeholder="algorithms, exam-prep"
                    className="rounded-xl h-10 text-xs"
                  />
                </div>
              </div>

              {noteType === "text" ? (
                <div className="space-y-2">
                  <Label htmlFor="content" className="text-xs font-bold">
                    Note Content (Markdown supported)
                  </Label>
                  <Textarea
                    id="content"
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    placeholder="Write your study notes, definitions, formulas, or summaries..."
                    className="min-h-[160px] rounded-xl text-xs leading-5"
                    required
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label className="text-xs font-bold">Document File</Label>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-border/80 hover:border-primary rounded-2xl p-6 text-center cursor-pointer transition-colors bg-muted/20"
                  >
                    <Upload className="size-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-xs font-semibold text-foreground">
                      {file ? file.name : "Click to select PDF, PPTX, DOCX, or Image"}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Up to 25MB. Processed automatically with multimodal extraction.
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.pptx,.ppt,.docx,.doc,.txt,.md,.png,.jpg,.jpeg,.webp"
                      onChange={(e) => {
                        const selected = e.target.files?.[0];
                        if (selected) {
                          setFile(selected);
                          if (!noteTitle) {
                            setNoteTitle(selected.name.replace(/\.[^/.]+$/, ""));
                          }
                        }
                      }}
                    />
                  </div>
                </div>
              )}

              <DialogFooter className="pt-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNoteDialogOpen(false)}
                  className="rounded-xl text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createTextMutation.isPending || createFileMutation.isPending}
                  className="rounded-xl font-bold text-xs shadow-lift"
                >
                  {(createTextMutation.isPending || createFileMutation.isPending) && (
                    <Loader2 className="size-3.5 animate-spin mr-1.5" />
                  )}
                  Save Note
                </Button>
              </DialogFooter>
            </form>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Create/Edit Personal Collection */}
      {/* ======================================================== */}
      <Dialog open={collectionDialogOpen} onOpenChange={setCollectionDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 sm:p-8">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold">
              {editingCollection ? "Edit Collection" : "New Personal Collection"}
            </DialogTitle>
            <DialogDescription>
              Organize your notes into private custom collections.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveCollection} className="space-y-4 mt-3">
            <div className="space-y-2">
              <Label htmlFor="cName" className="text-xs font-bold">
                Collection Name
              </Label>
              <Input
                id="cName"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="e.g. Operating Systems, Final Exams, Biology 101"
                className="rounded-xl h-11"
                required
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold">Color Theme</Label>
              <div className="flex items-center gap-2.5 pt-1">
                {COLLECTION_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setCollectionColor(col)}
                    className={`size-7 rounded-full transition-transform ${
                      collectionColor === col ? "ring-2 ring-primary ring-offset-2 scale-110" : ""
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCollectionDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createCollectionMutation.isPending || renameCollectionMutation.isPending}
                className="rounded-xl font-bold text-xs"
              >
                {editingCollection ? "Update" : "Create"} Collection
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Dialog: Share Note to Study Group */}
      {/* ======================================================== */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-bold">
              Share to Study Group
            </DialogTitle>
            <DialogDescription>
              Select a group you belong to. All members of the group will be able to view, preview,
              and save reference copies into their personal library.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-3">
            {groups.length === 0 ? (
              <p className="text-xs text-muted-foreground italic py-4 text-center">
                You are not currently a member of any study groups. Join or create one first!
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {groups.map((grp) => (
                  <div
                    key={grp.id}
                    onClick={() => setSelectedGroupId(grp.id)}
                    className={`p-3 rounded-2xl border text-left cursor-pointer transition flex items-center justify-between ${
                      selectedGroupId === grp.id
                        ? "border-primary bg-primary/10"
                        : "border-border/70 hover:bg-muted/40"
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold text-foreground">{grp.name}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {grp.description || "No description"}
                      </p>
                    </div>
                    <Badge variant="outline" className="text-[10px] capitalize">
                      {grp.myRole || "Member"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                onClick={() => setShareDialogOpen(false)}
                className="rounded-xl text-xs"
              >
                Cancel
              </Button>
              <Button
                disabled={!selectedGroupId || shareMutation.isPending}
                onClick={() => {
                  if (noteToShare && selectedGroupId) {
                    shareMutation.mutate({ noteId: noteToShare, groupId: selectedGroupId });
                  }
                }}
                className="rounded-xl font-bold text-xs shadow-lift"
              >
                {shareMutation.isPending && <Loader2 className="size-3.5 animate-spin mr-1.5" />}
                Share Note
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      {/* ======================================================== */}
      {/* Multi-Format Preview Modal */}
      {/* ======================================================== */}
      <Dialog
        open={previewNoteId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewNoteId(null);
            if (typeof window !== "undefined" && window.location.search.includes("preview=")) {
              const url = new URL(window.location.href);
              url.searchParams.delete("preview");
              window.history.replaceState(null, "", url.pathname + (url.search ? url.search : ""));
            }
          }
        }}
      >
        <DialogContent className="max-w-3xl rounded-3xl p-6 max-h-[88vh] flex flex-col overflow-hidden">
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
                      Uploaded {new Date(previewNote.note.createdAt).toLocaleDateString()} •{" "}
                      {previewNote.files?.[0]?.mimeType || previewNote.note.kind}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {previewNote.files?.[0] && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs gap-1.5"
                          asChild
                        >
                          <a
                            href={`/api/notes/${previewNote.note.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="size-3.5" /> Full View
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl text-xs gap-1.5"
                          asChild
                        >
                          <a
                            href={`/api/notes/${previewNote.note.id}/file`}
                            download={previewNote.files[0].originalName}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <Download className="size-3.5" /> Download
                          </a>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </DialogHeader>

              <ScrollArea className="flex-1 pr-3 my-4">
                {/* Embedded File Previews */}
                {previewNote.files?.[0]?.mimeType?.includes("image") ? (
                  <div className="rounded-2xl overflow-hidden border border-border/60 mb-4 bg-muted/20 text-center">
                    <img
                      src={`/api/notes/${previewNote.note.id}/file`}
                      alt={previewNote.note.title}
                      className="max-h-[420px] w-auto mx-auto object-contain rounded-xl"
                      onError={(e) => {
                        if (previewNote.files?.[0]?.storageUrl) {
                          (e.target as HTMLImageElement).src = previewNote.files[0].storageUrl;
                        }
                      }}
                    />
                  </div>
                ) : previewNote.files?.[0]?.mimeType?.includes("pdf") ? (
                  <div className="rounded-2xl overflow-hidden border border-border/60 mb-4 h-[460px] bg-muted/10 relative">
                    <object
                      data={`/api/notes/${previewNote.note.id}/file#toolbar=0`}
                      type="application/pdf"
                      className="w-full h-full"
                    >
                      <iframe
                        src={`${previewNote.files[0]?.storageUrl || `/api/notes/${previewNote.note.id}/file`}#toolbar=0`}
                        className="w-full h-full"
                        title={previewNote.note.title}
                      >
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          <p className="mb-2">Document viewer</p>
                          <a
                            href={`/api/notes/${previewNote.note.id}/file`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-primary underline font-medium"
                          >
                            Open document in new tab
                          </a>
                        </div>
                      </iframe>
                    </object>
                  </div>
                ) : null}

                {/* Content Streamdown Preview */}
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-6 text-foreground bg-muted/30 p-4 rounded-2xl border border-border/50">
                  <Streamdown>{previewNote.note.content || "No text content available."}</Streamdown>
                </div>

                {/* Visual References / Diagrams */}
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
