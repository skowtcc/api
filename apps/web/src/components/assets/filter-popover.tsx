import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandCheck,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { IconChevronDown } from "nucleo-micro-bold";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/utils";

interface FilterOption {
  value: string;
  label: string;
  iconUrl?: string;
  /** tiny trailing badge, e.g. "NEW" on recently added games */
  badge?: string;
}

// pastel green from the stat band's "games" chip - matches RecentDropsRow
const BADGE_COLOR = "oklch(0.85 0.10 162)";

interface FilterPopoverProps {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (value: string) => void;
  /** leading icon, tinted with the filter kind's tone - separates the content
   *  filters visually from the sort/layout controls beside them */
  icon?: React.ReactNode;
}

/**
 * A compact, searchable multi-select filter (desktop). The popover stays open
 * across selections, and a count badge shows how many are active. Scales to
 * dozens of options without dumping a pill-wall into the page.
 */
export function FilterPopover({ label, options, selected, onToggle, icon }: FilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const count = selected.length;

  /* float selected options to the top so active filters are always visible
     first without scrolling (stable sort keeps original order within each group) */
  const ordered = [...options].sort(
    (a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "surface-raised-pressable inline-flex items-center gap-1.5 px-3 h-9 rounded-md text-sm font-medium",
            count > 0 ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {icon}
          {label}
          {count > 0 && (
            <Chip className="justify-center min-w-[1.25rem] h-5 px-1 text-xs font-semibold tabular-nums">
              {count}
            </Chip>
          )}
          <IconChevronDown className="size-3.5 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command className="bg-transparent">
          <CommandInput placeholder={`Search ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No {label.toLowerCase()} found.</CommandEmpty>
            <CommandGroup>
              {ordered.map((opt) => (
                <CommandItem key={opt.value} value={opt.label} onSelect={() => onToggle(opt.value)}>
                  {opt.iconUrl && (
                    <img
                      src={opt.iconUrl}
                      alt=""
                      className="size-4 rounded-sm object-cover shrink-0"
                    />
                  )}
                  <span className="truncate">{opt.label}</span>
                  {opt.badge && (
                    <span
                      className="rounded px-1 py-px text-[10px] font-bold tracking-wide shrink-0"
                      style={{
                        color: BADGE_COLOR,
                        background: `color-mix(in oklch, ${BADGE_COLOR} 22%, transparent)`,
                      }}
                    >
                      {opt.badge}
                    </span>
                  )}
                  {selected.includes(opt.value) && <CommandCheck />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
