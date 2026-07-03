import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconPlus } from "nucleo-micro-bold";
import { cn } from "@/lib/utils";

const TYPE_OPTIONS = [
  { value: "game", label: "New Game" },
  { value: "game_category", label: "Game Category" },
  { value: "other", label: "Other" },
] as const;

type RequestEntryType = (typeof TYPE_OPTIONS)[number]["value"];

interface SubmitRequestDialogProps {
  children?: React.ReactNode;
}

export function SubmitRequestDialog({ children }: SubmitRequestDialogProps) {
  const [open, setOpen] = useState(false);
  const [selectedType, setSelectedType] = useState<RequestEntryType>("other");
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptics();

  const { data: filters } = useQuery(trpc.asset.getFilters.queryOptions());

  const createMutation = useMutation(
    trpc.request.create.mutationOptions({
      onSuccess: (data) => {
        triggerHaptic(HAPTIC.SUCCESS);
        queryClient.invalidateQueries({ queryKey: trpc.request.list.queryKey() });
        setOpen(false);
        form.reset();
        if (data) {
          navigate({ to: "/request/$id", params: { id: data.id } });
        }
      },
      onError: () => {
        triggerHaptic(HAPTIC.ERROR);
      },
    }),
  );

  const form = useForm({
    defaultValues: {
      type: "other" as RequestEntryType,
      title: "",
      description: "",
      gameId: "",
    },
    onSubmit: async ({ value }) => {
      createMutation.mutate({
        type: value.type,
        title: value.title,
        description: value.description || undefined,
        gameId: value.type === "game_category" ? value.gameId : undefined,
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? (
          <Button size="sm" className="gap-1.5">
            <IconPlus className="size-4" />
            Submit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-display">Submit a Request</DialogTitle>
          <DialogDescription>
            Suggest a new game, category, or feature for the community to vote on.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
        >
          <DialogBody className="space-y-4">
            <form.Field name="type">
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor="type"
                    className="text-xs text-foreground/70 uppercase tracking-wide"
                  >
                    Type
                  </label>
                  <Select
                    value={field.state.value}
                    onValueChange={(value) => {
                      field.handleChange(value as RequestEntryType);
                      setSelectedType(value as RequestEntryType);
                    }}
                  >
                    <SelectTrigger id="type" size="md">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </form.Field>

            {selectedType === "game_category" && (
              <form.Field name="gameId">
                {(field) => (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="gameId"
                      className="text-xs text-foreground/70 uppercase tracking-wide"
                    >
                      Game
                    </label>
                    <Select value={field.state.value} onValueChange={field.handleChange}>
                      <SelectTrigger id="gameId" size="md">
                        <SelectValue placeholder="Select game" />
                      </SelectTrigger>
                      <SelectContent>
                        {filters?.games.map((game) => (
                          <SelectItem key={game.id} value={game.id}>
                            {game.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </form.Field>
            )}

            <form.Field
              name="title"
              validators={{
                onChange: ({ value }) =>
                  value.length < 1
                    ? "Title is required"
                    : value.length > 200
                      ? "Title must be 200 characters or less"
                      : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor="title"
                    className="text-xs text-foreground/70 uppercase tracking-wide"
                  >
                    Title
                  </label>
                  <Input
                    id="title"
                    placeholder="e.g. Add Wuthering Waves support"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    className={cn(
                      "h-10",
                      field.state.meta.errors.length > 0 && "border-destructive",
                    )}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </form.Field>

            <form.Field
              name="description"
              validators={{
                onChange: ({ value }) =>
                  value.length > 2000 ? "Description must be 2000 characters or less" : undefined,
              }}
            >
              {(field) => (
                <div className="space-y-1.5">
                  <label
                    htmlFor="description"
                    className="text-xs text-foreground/70 uppercase tracking-wide"
                  >
                    Description{" "}
                    <span className="normal-case text-muted-foreground">(optional)</span>
                  </label>
                  <Textarea
                    id="description"
                    placeholder="Provide more details about your request..."
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    onBlur={field.handleBlur}
                    rows={3}
                    className={cn(field.state.meta.errors.length > 0 && "border-destructive")}
                  />
                  {field.state.meta.errors.length > 0 && (
                    <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                  )}
                </div>
              )}
            </form.Field>

            {createMutation.isError && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-xs text-destructive">
                  {createMutation.error?.message || "Failed to submit. Please try again."}
                </p>
              </div>
            )}
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={createMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" data-haptic="action" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
