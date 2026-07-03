import { IconExternalLink } from "nucleo-micro-bold";

export function Footer() {
  return (
    <footer className="mt-12 pb-20 md:pb-8">
      <div className="page-container">
        <div className="border-t border-border/20 pt-6">
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              &copy; 2022-2026 skowt.cc, built by{" "}
              <a
                href="https://dromzeh.dev"
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
              >
                dromzeh
                <IconExternalLink className="size-2.5" />
              </a>
            </p>
            <p>
              A free service by Antifield LTD. Not affiliated with any listed games or companies.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
