export interface ExportData {
  user:
    | {
        id: string;
        name: string;
        displayName: string | null;
        email: string;
        emailVerified: boolean;
        image: string | null;
        role: string;
        createdAt: string;
        updatedAt: string;
      }
    | undefined;
  savedAssets: Array<{
    createdAt: string;
    asset: {
      id: string;
      name: string;
      game: { name: string };
      category: { name: string };
    };
  }>;
  votes: Array<{
    createdAt: string;
    entry: { id: string; title: string };
  }>;
  createdEntries: Array<{
    id: string;
    type: string;
    title: string;
    description: string | null;
    status: string;
    voteCount: number;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    content: string;
    upvoteCount: number;
    createdAt: string;
    updatedAt: string;
    entry: { id: string; title: string };
  }>;
  upvotes: Array<{
    createdAt: string;
    comment: {
      id: string;
      content: string;
      entry: { title: string };
    };
  }>;
  exportedAt: string;
}

const SEPARATOR = "=".repeat(60);

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().split("T")[0];
}

function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function formatDataExport(data: ExportData): string {
  const lines: string[] = [];

  lines.push(SEPARATOR);
  lines.push("SKOWT.CC - DATA EXPORT");
  lines.push(SEPARATOR);
  lines.push("");
  lines.push(`Exported at: ${formatDateTime(data.exportedAt)}`);
  lines.push("");

  lines.push(SEPARATOR);
  lines.push("USER INFO");
  lines.push(SEPARATOR);
  if (data.user) {
    lines.push(`User ID: ${data.user.id}`);
    lines.push(`Username: ${data.user.name}`);
    lines.push(`Display Name: ${data.user.displayName || "(not set)"}`);
    lines.push(`Email: ${data.user.email}`);
    lines.push(`Email Verified: ${data.user.emailVerified ? "Yes" : "No"}`);
    lines.push(`Profile Image: ${data.user.image || "(none)"}`);
    lines.push(`Role: ${data.user.role}`);
    lines.push(`Account Created: ${formatDateTime(data.user.createdAt)}`);
    lines.push(`Last Updated: ${formatDateTime(data.user.updatedAt)}`);
  } else {
    lines.push("(user data unavailable)");
  }
  lines.push("");

  if (data.savedAssets.length > 0) {
    lines.push(SEPARATOR);
    lines.push(`SAVED ASSETS (${data.savedAssets.length})`);
    lines.push(SEPARATOR);
    data.savedAssets.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.asset.name} (${item.asset.game.name} / ${item.asset.category.name}) - saved on ${formatDate(item.createdAt)}`,
      );
    });
    lines.push("");
  }

  if (data.votes.length > 0) {
    lines.push(SEPARATOR);
    lines.push(`VOTES ON FEATURE REQUESTS (${data.votes.length})`);
    lines.push(SEPARATOR);
    data.votes.forEach((item, index) => {
      lines.push(`${index + 1}. "${item.entry.title}" - voted on ${formatDate(item.createdAt)}`);
    });
    lines.push("");
  }

  if (data.createdEntries.length > 0) {
    lines.push(SEPARATOR);
    lines.push(`FEATURE REQUESTS CREATED (${data.createdEntries.length})`);
    lines.push(SEPARATOR);
    data.createdEntries.forEach((item, index) => {
      lines.push(`${index + 1}. "${item.title}"`);
      lines.push(`   Type: ${item.type}`);
      lines.push(`   Status: ${item.status}`);
      lines.push(`   Vote Count: ${item.voteCount}`);
      if (item.description) {
        lines.push(`   Description: ${item.description}`);
      }
      lines.push(`   Created: ${formatDateTime(item.createdAt)}`);
      lines.push("");
    });
  }

  if (data.comments.length > 0) {
    lines.push(SEPARATOR);
    lines.push(`COMMENTS (${data.comments.length})`);
    lines.push(SEPARATOR);
    data.comments.forEach((item, index) => {
      lines.push(`${index + 1}. On "${item.entry.title}"`);
      lines.push(`   Content: ${item.content}`);
      lines.push(`   Upvotes: ${item.upvoteCount}`);
      lines.push(`   Created: ${formatDateTime(item.createdAt)}`);
      const createdTime = new Date(item.createdAt).getTime();
      const updatedTime = new Date(item.updatedAt).getTime();
      if (updatedTime !== createdTime) {
        lines.push(`   Last Edited: ${formatDateTime(item.updatedAt)}`);
      }
      lines.push("");
    });
  }

  if (data.upvotes.length > 0) {
    lines.push(SEPARATOR);
    lines.push(`COMMENT UPVOTES (${data.upvotes.length})`);
    lines.push(SEPARATOR);
    data.upvotes.forEach((item, index) => {
      const preview =
        item.comment.content.slice(0, 50) + (item.comment.content.length > 50 ? "..." : "");
      lines.push(
        `${index + 1}. "${preview}" (on "${item.comment.entry.title}") - upvoted on ${formatDate(item.createdAt)}`,
      );
    });
    lines.push("");
  }

  lines.push(SEPARATOR);
  lines.push("END OF EXPORT");
  lines.push(SEPARATOR);

  return lines.join("\n");
}
