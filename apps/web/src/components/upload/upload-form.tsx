import { useState, useMemo } from "react";
import { useForm } from "@tanstack/react-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { SettingRow } from "@/components/ui/setting-row";
import {
  DropDrawer,
  DropDrawerTrigger,
  DropDrawerContent,
  DropDrawerGroup,
  DropDrawerItem,
} from "@/components/dropdrawer";
import { useFilters, getCategoriesForSelectedGames } from "@/hooks/use-filters";
import {
  IconChevronDown,
  IconCheck,
  IconXmark,
  IconPlus,
  IconPhoto,
  IconGrid2,
  IconTagFilled,
} from "nucleo-micro-bold";
import { GamepadGlyph } from "@/components/site-stats-hero";
import { cn } from "@/lib/utils";
import { formatFileSize, generateFileId } from "./types";
import { useUpload } from "@/hooks/use-upload";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";

interface UploadFormProps {
  /** whether the server will honour skip-approval for this user (staff+) */
  canSkipApproval: boolean;
  onSuccess: () => void;
}

const ACCENT = "var(--chip-violet)";

// same tone-per-kind as the browse filter pills so the two surfaces read alike
const TONE = {
  game: ACCENT,
  category: "oklch(0.83 0.10 200)", // teal
  tag: "oklch(0.84 0.10 80)", // amber
} as const;

export function UploadForm({ canSkipApproval, onSuccess }: UploadFormProps) {
  const { games, tags } = useFilters();
  const { triggerHaptic } = useHaptics();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [isSuggestive, setIsSuggestive] = useState(false);
  const [skipApproval, setSkipApproval] = useState(canSkipApproval);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  /* generateFileId is time-seeded, so the id must be minted once at submit and
     remembered - recomputing it at render time never matches the in-flight
     upload and the progress bar would never show */
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const {
    uploadFiles: doUpload,
    isUploading,
    getProgress,
    reset,
  } = useUpload({
    onSuccess: () => {
      triggerHaptic(HAPTIC.SUCCESS);
      setFile(null);
      setActiveFileId(null);
      setSelectedTags([]);
      setIsSuggestive(false);
      form.reset();
      reset();
      onSuccess();
    },
    onError: () => {
      triggerHaptic(HAPTIC.ERROR);
    },
  });

  const form = useForm({
    defaultValues: {
      title: "",
      gameId: "",
      categoryId: "",
    },
    onSubmit: async ({ value }) => {
      if (!file) return;
      const fileId = generateFileId(file.name);
      setActiveFileId(fileId);
      await doUpload(
        [
          {
            file,
            id: fileId,
            metadata: {
              title: value.title,
              gameId: value.gameId,
              categoryId: value.categoryId,
              tags: selectedTags,
              isSuggestive,
            },
          },
        ],
        { skipApproval: canSkipApproval && skipApproval },
      );
    },
  });

  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
    if (dropped) {
      triggerHaptic(HAPTIC.SUCCESS);
      setFile(dropped);
      setActiveFileId(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected?.type.startsWith("image/")) {
      triggerHaptic(HAPTIC.SUCCESS);
      setFile(selected);
      setActiveFileId(null);
    }
    e.target.value = "";
  };

  const toggleTag = (tagSlug: string) => {
    setSelectedTags((current) => {
      if (current.includes(tagSlug)) {
        return current.filter((t) => t !== tagSlug);
      }
      let newTags = [...current];
      if (tagSlug === "official") {
        newTags = newTags.filter((t) => t !== "fanmade");
      } else if (tagSlug === "fanmade") {
        newTags = newTags.filter((t) => t !== "official");
      }
      newTags.push(tagSlug);
      return newTags;
    });
  };

  const uploadProgress = activeFileId ? getProgress(activeFileId) : undefined;

  const labelClass = "text-sm text-muted-foreground";

  const willSkipQueue = canSkipApproval && skipApproval;

  const dropzone = (
    <div className="space-y-2">
      {file && previewUrl ? (
        <>
          <div className="relative rounded-2xl bg-card shadow-md aspect-square overflow-hidden flex items-center justify-center">
            <img
              src={previewUrl}
              alt={file.name}
              className="max-w-full max-h-full object-contain"
            />
            <button
              type="button"
              onClick={() => setFile(null)}
              className="absolute top-3 right-3 size-7 rounded-lg bg-black/50 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/70 transition-colors duration-150"
            >
              <IconXmark className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center justify-between gap-3 px-1">
            <p className="text-sm text-foreground truncate">{file.name}</p>
            <p className="text-xs text-muted-foreground tabular-nums shrink-0">
              {formatFileSize(file.size)}
            </p>
          </div>
          {uploadProgress?.status === "uploading" && (
            <div className="h-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${uploadProgress.progress}%`,
                  background: ACCENT,
                }}
              />
            </div>
          )}
        </>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className="group relative rounded-2xl bg-card shadow-md aspect-square overflow-hidden flex flex-col items-center justify-center"
          style={
            dragActive
              ? { background: `color-mix(in oklch, ${ACCENT} 7%, var(--card))` }
              : undefined
          }
        >
          {/* inset dashed ring marks the drop target inside the asset-page frame */}
          <div
            className={cn(
              "absolute inset-3 rounded-xl border border-dashed pointer-events-none transition-colors duration-150",
              !dragActive && "border-foreground/15 group-hover:border-foreground/30",
            )}
            style={dragActive ? { borderColor: ACCENT } : undefined}
          />
          <input
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="absolute inset-0 size-full opacity-0 cursor-pointer"
            aria-label="Select a file to upload"
          />
          <div className="flex flex-col items-center gap-2.5 text-center">
            <IconPhoto
              className={cn(
                "size-6 transition-colors duration-150",
                !dragActive && "text-foreground/50",
              )}
              style={dragActive ? { color: ACCENT } : undefined}
            />
            <div>
              <p className="text-sm text-foreground">
                {dragActive ? "Drop image here" : "Drop an image to upload"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">or click to browse</p>
            </div>
          </div>
        </div>
      )}
      {uploadProgress?.status === "error" && (
        <p className="text-xs text-destructive">{uploadProgress.error || "Upload failed"}</p>
      )}
    </div>
  );

  const titleField = (
    <form.Field
      name="title"
      validators={{
        onChange: ({ value }) =>
          value.length < 3
            ? "Title must be at least 3 characters"
            : value.length > 255
              ? "Title must be 255 characters or less"
              : undefined,
      }}
    >
      {(field) => (
        <div className="space-y-1.5">
          <label htmlFor="title" className={labelClass}>
            Title
          </label>
          <Input
            id="title"
            placeholder="e.g. Raiden Shogun Character Sheet"
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            onBlur={field.handleBlur}
            className={cn(field.state.meta.errors.length > 0 && "border-destructive")}
          />
          {field.state.meta.errors.length > 0 && (
            <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
          )}
        </div>
      )}
    </form.Field>
  );

  const gameAndCategoryFields = (
    <div className="grid grid-cols-2 gap-3">
      <form.Field
        name="gameId"
        validators={{
          onChange: ({ value }) => (!value ? "Game is required" : undefined),
        }}
      >
        {(field) => {
          const selectedGameName = games.find((g) => g.id === field.state.value)?.name;
          return (
            <div className="space-y-1.5">
              <DropDrawer open={gameOpen} onOpenChange={setGameOpen}>
                <DropDrawerTrigger
                  className={cn(
                    "surface-raised-pressable flex h-9 w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                    field.state.meta.errors.length > 0 && "ring-1 ring-destructive/60",
                  )}
                >
                  <GamepadGlyph className="size-4 shrink-0" style={{ color: TONE.game }} />
                  <span
                    className={cn(
                      "truncate",
                      selectedGameName ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {selectedGameName || "Game"}
                  </span>
                  <IconChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
                </DropDrawerTrigger>
                <DropDrawerContent
                  align="start"
                  className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                  <DropDrawerGroup>
                    {games.map((game) => (
                      <DropDrawerItem
                        key={game.id}
                        onClick={() => {
                          field.handleChange(game.id);
                          form.setFieldValue("categoryId", "");
                          setGameOpen(false);
                        }}
                        icon={
                          field.state.value === game.id ? (
                            <IconCheck className="size-4" />
                          ) : undefined
                        }
                      >
                        {game.name}
                      </DropDrawerItem>
                    ))}
                  </DropDrawerGroup>
                </DropDrawerContent>
              </DropDrawer>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          );
        }}
      </form.Field>

      <form.Field
        name="categoryId"
        validators={{
          onChange: ({ value }) => (!value ? "Category is required" : undefined),
        }}
      >
        {(field) => {
          const currentGameId = form.getFieldValue("gameId");
          const categories = currentGameId
            ? getCategoriesForSelectedGames(games, [currentGameId])
            : [];
          const selectedCategoryName = categories.find((c) => c.id === field.state.value)?.name;

          return (
            <div className="space-y-1.5">
              <DropDrawer open={categoryOpen} onOpenChange={setCategoryOpen}>
                <DropDrawerTrigger
                  disabled={!currentGameId}
                  className={cn(
                    "surface-raised-pressable flex h-9 w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium",
                    "disabled:pointer-events-none disabled:opacity-50",
                    field.state.meta.errors.length > 0 && "ring-1 ring-destructive/60",
                  )}
                >
                  <IconGrid2 className="size-4 shrink-0" style={{ color: TONE.category }} />
                  <span
                    className={cn(
                      "truncate",
                      selectedCategoryName ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {selectedCategoryName || "Category"}
                  </span>
                  <IconChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
                </DropDrawerTrigger>
                <DropDrawerContent
                  align="start"
                  className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
                >
                  <DropDrawerGroup>
                    {categories.map((category) => (
                      <DropDrawerItem
                        key={category.id}
                        onClick={() => {
                          field.handleChange(category.id);
                          setCategoryOpen(false);
                        }}
                        icon={
                          field.state.value === category.id ? (
                            <IconCheck className="size-4" />
                          ) : undefined
                        }
                      >
                        {category.name}
                      </DropDrawerItem>
                    ))}
                  </DropDrawerGroup>
                </DropDrawerContent>
              </DropDrawer>
              {field.state.meta.errors.length > 0 && (
                <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
              )}
            </div>
          );
        }}
      </form.Field>
    </div>
  );

  const tagsField = (
    <div className="space-y-1.5">
      <DropDrawer open={tagsOpen} onOpenChange={setTagsOpen}>
        <DropDrawerTrigger
          className={cn(
            "surface-raised-pressable flex h-9 w-full items-center gap-1.5 rounded-md px-3 text-sm font-medium",
          )}
        >
          <IconTagFilled className="size-4 shrink-0" style={{ color: TONE.tag }} />
          <span
            className={cn(
              "truncate",
              selectedTags.length > 0 ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {selectedTags.length > 0
              ? selectedTags
                  .map((slug) => tags.find((t) => t.slug === slug)?.name ?? slug)
                  .join(", ")
              : "Tags"}
          </span>
          <IconChevronDown className="ml-auto size-3.5 opacity-60 shrink-0" />
        </DropDrawerTrigger>
        <DropDrawerContent
          align="start"
          className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
        >
          <DropDrawerGroup>
            {tags
              .filter((t) => t.slug === "official" || t.slug === "fanmade")
              .map((tag) => {
                const isSelected = selectedTags.includes(tag.slug);
                const otherSlug = tag.slug === "official" ? "fanmade" : "official";
                const otherSelected = selectedTags.includes(otherSlug);
                return (
                  <DropDrawerItem
                    key={tag.id}
                    disabled={otherSelected && !isSelected}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleTag(tag.slug);
                    }}
                    icon={
                      isSelected ? <IconCheck className="size-4" /> : <span className="size-4" />
                    }
                  >
                    {tag.name}
                  </DropDrawerItem>
                );
              })}
          </DropDrawerGroup>
          <DropDrawerGroup>
            {tags
              .filter((t) => t.slug !== "official" && t.slug !== "fanmade")
              .map((tag) => {
                const isSelected = selectedTags.includes(tag.slug);
                return (
                  <DropDrawerItem
                    key={tag.id}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleTag(tag.slug);
                    }}
                    icon={
                      isSelected ? <IconCheck className="size-4" /> : <span className="size-4" />
                    }
                  >
                    {tag.name}
                  </DropDrawerItem>
                );
              })}
          </DropDrawerGroup>
        </DropDrawerContent>
      </DropDrawer>
    </div>
  );

  const suggestiveField = (
    <SettingRow
      title="Suggestive content"
      description="Hidden while browsing unless viewers opt in."
      className="py-3"
    >
      <Checkbox
        checked={isSuggestive}
        onCheckedChange={(checked) => setIsSuggestive(checked === true)}
      />
    </SettingRow>
  );

  const skipApprovalField = canSkipApproval ? (
    <SettingRow
      title="Skip approval"
      description="Goes live the moment the upload finishes. No review."
      className="py-3"
    >
      <Checkbox
        checked={skipApproval}
        onCheckedChange={(checked) => setSkipApproval(checked === true)}
      />
    </SettingRow>
  ) : null;

  const actions = (
    <>
      <Button type="submit" data-haptic="action" disabled={!file || isUploading} className="w-full">
        {isUploading ? (
          <>
            <svg
              className="animate-spin size-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            Uploading...
          </>
        ) : (
          <>
            <IconPlus className="size-4" />
            Upload
          </>
        )}
      </Button>
      <p className="text-xs text-muted-foreground text-center">
        {willSkipQueue
          ? "Publishes instantly as approved."
          : "Uploads are reviewed periodically before going live."}
      </p>
    </>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        e.stopPropagation();
        form.handleSubmit();
      }}
    >
      <div className="flex flex-col lg:flex-row gap-8 lg:gap-10 items-start">
        <div className="w-full lg:w-1/2 shrink-0 lg:sticky lg:top-24">{dropzone}</div>
        <div className="w-full lg:w-1/2 min-w-0 space-y-4">
          {titleField}
          {gameAndCategoryFields}
          {tagsField}
          <div className="divide-y divide-border/20">
            {suggestiveField}
            {skipApprovalField}
          </div>
          {actions}
        </div>
      </div>
    </form>
  );
}
