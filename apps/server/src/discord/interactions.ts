import { Elysia } from "elysia";
import nacl from "tweetnacl";
import { getServerEnv } from "@skowt-monorepo/env/server";
import { createLogger } from "@skowt-monorepo/observability/server";
import {
  db,
  account,
  user,
  game,
  category,
  gameToCategory,
  tag,
  eq,
  and,
  asc,
  like,
} from "@skowt-monorepo/db";
import { ingestImageToQueue } from "@skowt-monorepo/api/lib/ingest";
import { MIME_TO_EXTENSION, MAX_FILE_SIZE } from "@skowt-monorepo/api/lib/s3";
import { hasMinimumRole, parseUserRole } from "@skowt-monorepo/api/lib/roles";

const log = createLogger("discord-bot");

// interaction wire constants - https://discord.com/developers/docs/interactions
const INTERACTION = { PING: 1, COMMAND: 2, AUTOCOMPLETE: 4 } as const;
const RESPONSE = { PONG: 1, MESSAGE: 4, DEFERRED_MESSAGE: 5, AUTOCOMPLETE: 8 } as const;
const EPHEMERAL = 64;
const EMBED_VIOLET = 0xa79be0;

interface InteractionOption {
  name: string;
  value?: string | number | boolean;
  focused?: boolean;
}

interface DiscordAttachment {
  url: string;
  filename: string;
  size: number;
  content_type?: string;
}

interface Interaction {
  type: number;
  application_id: string;
  token: string;
  member?: { user?: { id: string } };
  user?: { id: string };
  data?: {
    name?: string;
    options?: InteractionOption[];
    resolved?: { attachments?: Record<string, DiscordAttachment> };
  };
}

function verifySignature(
  publicKeyHex: string,
  signatureHex: string,
  timestamp: string,
  body: string,
): boolean {
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + body),
      Buffer.from(signatureHex, "hex"),
      Buffer.from(publicKeyHex, "hex"),
    );
  } catch {
    return false;
  }
}

function optValue(
  options: InteractionOption[],
  name: string,
): string | number | boolean | undefined {
  return options.find((o) => o.name === name)?.value;
}

/*
 * the deferred reply is edited via the interaction-token webhook - no bot
 * token needed at runtime, the token in the URL is the authorization
 */
async function editReply(interaction: Interaction, payload: object): Promise<void> {
  const res = await fetch(
    `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    log.warn("Discord editReply failed", { status: res.status, body: await res.text() });
  }
}

async function handleAutocomplete(interaction: Interaction) {
  const options = interaction.data?.options ?? [];
  const focused = options.find((o) => o.focused);
  const q = String(focused?.value ?? "")
    .trim()
    .toLowerCase();
  let choices: Array<{ name: string; value: string }> = [];

  if (focused?.name === "game") {
    const rows = await db.query.game.findMany({
      where: q ? like(game.name, `%${q}%`) : undefined,
      orderBy: [asc(game.name)],
      limit: 25,
      columns: { id: true, name: true },
    });
    choices = rows.map((g) => ({ name: g.name, value: g.id }));
  } else if (focused?.name === "category") {
    const gameId = String(optValue(options, "game") ?? "");
    if (gameId) {
      const rows = await db
        .select({ id: category.id, name: category.name })
        .from(gameToCategory)
        .innerJoin(category, eq(gameToCategory.categoryId, category.id))
        .where(eq(gameToCategory.gameId, gameId));
      choices = rows
        .filter((c) => !q || c.name.toLowerCase().includes(q))
        .slice(0, 25)
        .map((c) => ({ name: c.name, value: c.id }));
    }
  }

  return { type: RESPONSE.AUTOCOMPLETE, data: { choices } };
}

async function processUpload(interaction: Interaction): Promise<void> {
  const discordUserId = interaction.member?.user?.id ?? interaction.user?.id;
  if (!discordUserId) {
    return editReply(interaction, { content: "Couldn't identify your Discord account." });
  }

  // the bot shares the site's identity: discord id -> linked skowt account
  const linked = await db.query.account.findFirst({
    where: and(eq(account.providerId, "discord"), eq(account.accountId, String(discordUserId))),
  });
  const skowtUser = linked
    ? await db.query.user.findFirst({ where: eq(user.id, linked.userId) })
    : null;
  if (!skowtUser) {
    return editReply(interaction, {
      content: "No skowt account is linked to your Discord. Log in at skowt.cc first.",
    });
  }
  if (!hasMinimumRole(parseUserRole(skowtUser.role), "contributor")) {
    return editReply(interaction, { content: "Contributor access required." });
  }

  const options = interaction.data?.options ?? [];
  const name = String(optValue(options, "name") ?? "");
  const gameId = String(optValue(options, "game") ?? "");
  const categoryId = String(optValue(options, "category") ?? "");
  const tagSlug = String(optValue(options, "tag") ?? "");
  const isSuggestive = optValue(options, "suggestive") === true;
  const attachmentId = String(optValue(options, "image") ?? "");
  const attachment = interaction.data?.resolved?.attachments?.[attachmentId];

  if (!attachment) {
    return editReply(interaction, { content: "No image attached." });
  }
  const mimeType = String(attachment.content_type ?? "");
  if (!MIME_TO_EXTENSION[mimeType]) {
    return editReply(interaction, {
      content: `Unsupported file type. Allowed: ${Object.keys(MIME_TO_EXTENSION).join(", ")}`,
    });
  }
  if (attachment.size > MAX_FILE_SIZE) {
    return editReply(interaction, {
      content: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    });
  }

  const fileRes = await fetch(attachment.url);
  if (!fileRes.ok) {
    return editReply(interaction, { content: "Couldn't fetch the attachment from Discord." });
  }
  const bytes = new Uint8Array(await fileRes.arrayBuffer());

  /*
   * tag is a required official/fanmade choice, sent as a slug so the command
   * registration is environment-independent; resolve to the row here
   */
  const tagRow = await db.query.tag.findFirst({ where: eq(tag.slug, tagSlug) });
  if (!tagRow) {
    return editReply(interaction, { content: `Unknown tag "${tagSlug}".` });
  }

  const result = await ingestImageToQueue({
    bytes,
    mimeType,
    name,
    gameId,
    categoryId,
    tagIds: [tagRow.id],
    isSuggestive,
    uploadedBy: skowtUser.id,
  });

  if (!result.ok) {
    return editReply(interaction, { content: `Upload rejected: ${result.reason}` });
  }

  const [gameRow, categoryRow] = await Promise.all([
    db.query.game.findFirst({ where: eq(game.id, gameId), columns: { name: true } }),
    db.query.category.findFirst({ where: eq(category.id, categoryId), columns: { name: true } }),
  ]);

  log.info("Discord upload queued", { assetId: result.assetId, uploadedBy: skowtUser.id });

  return editReply(interaction, {
    embeds: [
      {
        title: name,
        description: `${gameRow?.name ?? "Unknown game"} · ${categoryRow?.name ?? "Unknown category"}\nQueued for review.`,
        color: EMBED_VIOLET,
        thumbnail: { url: attachment.url },
      },
    ],
  });
}

/**
 * Discord slash-command endpoint (interactions over HTTP - no gateway
 * process). signature-verified with the bot application's ed25519 public
 * key; absent key = routes answer 503 and the feature is off. /upload
 * shares the site's identity (linked Discord account) and role policy, and
 * lands assets in the same moderation queue.
 */
export const discordInteractions = new Elysia({ name: "discord-interactions" }).post(
  "/discord/interactions",
  async ({ request }) => {
    const publicKey = getServerEnv().DISCORD_BOT_PUBLIC_KEY;
    if (!publicKey) {
      return new Response("Discord bot not configured", { status: 503 });
    }

    const signature = request.headers.get("x-signature-ed25519");
    const timestamp = request.headers.get("x-signature-timestamp");
    const body = await request.text();
    if (!signature || !timestamp || !verifySignature(publicKey, signature, timestamp, body)) {
      return new Response("invalid request signature", { status: 401 });
    }

    const interaction = JSON.parse(body) as Interaction;

    if (interaction.type === INTERACTION.PING) {
      return { type: RESPONSE.PONG };
    }

    if (interaction.type === INTERACTION.AUTOCOMPLETE) {
      return handleAutocomplete(interaction);
    }

    if (interaction.type === INTERACTION.COMMAND && interaction.data?.name === "upload") {
      /*
       * ack within Discord's 3s window, process in the background, then edit
       * the deferred (ephemeral) reply with the outcome
       */
      void processUpload(interaction).catch(async (error) => {
        log.error("Discord upload failed", { error });
        await editReply(interaction, {
          content: "Something went wrong on our side. Try again in a minute.",
        }).catch(() => {});
      });
      return { type: RESPONSE.DEFERRED_MESSAGE, data: { flags: EPHEMERAL } };
    }

    return { type: RESPONSE.MESSAGE, data: { content: "Unknown command.", flags: EPHEMERAL } };
  },
);
