import { cn } from "@/lib/utils";

interface SettingRowProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingRow({ title, description, children, className }: SettingRowProps) {
  return (
    <div className={cn("flex items-center justify-between gap-6 py-4", className)}>
      <div className="space-y-1">
        <p className="text-[14px] text-foreground">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

interface SettingSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function SettingSection({ title, children, className }: SettingSectionProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <h2 className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{title}</h2>
      <div className="divide-y divide-border/20">{children}</div>
    </div>
  );
}
