import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTRPC } from "@/utils/trpc";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ContributorCard } from "@/components/contributors/contributor-card";
import { roleConfig, type UserRole } from "@/constants/roles";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/contributors")({
  component: ContributorsComponent,
  pendingComponent: ContributorsSkeleton,
  head: () => ({
    meta: [
      { title: "Contributors - skowt.cc" },
      {
        name: "description",
        content: "Appreciation list of everyone who makes skowt.cc possible.",
      },
      { name: "og:title", content: "Contributors - skowt.cc" },
      {
        name: "og:description",
        content: "Appreciation list of everyone who makes skowt.cc possible.",
      },
    ],
  }),
});

type Contributor = {
  id: string;
  name: string;
  displayName: string | null;
  image: string | null;
  role: string;
};

type RoleGroup = {
  role: Exclude<UserRole, "user">;
  label: string;
  contributors: Contributor[];
};

const ROLE_ORDER: Exclude<UserRole, "user">[] = ["developer", "staff", "contributor"];

function ContributorsSkeleton() {
  return (
    <div className="space-y-14">
      {[1, 4, 6].map((count, i) => (
        <div key={i}>
          <div className="flex items-center gap-2.5 mb-5">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-5 w-8" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: count }).map((_, j) => (
              <div key={j} className="flex flex-col items-center gap-3 p-5 rounded-xl glass-panel">
                <Skeleton className="size-12 rounded-full" />
                <div className="flex flex-col items-center gap-1">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface RoleSectionProps {
  group: RoleGroup;
}

function RoleSection({ group }: RoleSectionProps) {
  const config = roleConfig[group.role];

  return (
    <section>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="flex items-center gap-2">
          <config.icon className={cn("size-[18px]", config.className)} />
          <h2 className="text-display text-xl text-foreground">{config.label}</h2>
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          ({group.contributors.length})
        </span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {group.contributors.map((contributor) => (
          <ContributorCard key={contributor.id} contributor={contributor} />
        ))}
      </div>
    </section>
  );
}

function ContributorsComponent() {
  const trpc = useTRPC();

  const { data: contributors } = useSuspenseQuery(trpc.user.getContributors.queryOptions());

  const groupedContributors = useMemo(() => {
    if (!contributors) return [];

    const groups: RoleGroup[] = [];

    for (const role of ROLE_ORDER) {
      const roleContributors = contributors.filter((c) => c.role === role);
      if (roleContributors.length > 0) {
        groups.push({
          role,
          label: roleConfig[role].label,
          contributors: roleContributors,
        });
      }
    }

    return groups;
  }, [contributors]);

  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title="Contributors"
        description="Appreciation list of everyone who makes skowt.cc possible <3"
        className="mb-8"
      />

      {groupedContributors.length > 0 ? (
        <div className="space-y-10">
          {groupedContributors.map((group) => (
            <RoleSection key={group.role} group={group} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No contributors found.</p>
      )}
    </div>
  );
}
