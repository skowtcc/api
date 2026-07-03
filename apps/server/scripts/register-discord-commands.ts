/*
 * registers the /upload slash command, guild-scoped (instant, visible only in
 * that guild - register to a test guild first, NOID when ready)
 *
 *   DISCORD_BOT_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... bun scripts/register-discord-commands.ts
 *
 * the bot token is used ONLY here; the runtime endpoint needs just the
 * public key. requires the app installed in the guild with the
 * applications.commands scope
 */

const APPLICATION_ID = process.env.DISCORD_BOT_APPLICATION_ID;
const token = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !guildId || !APPLICATION_ID) {
  console.error(
    "usage: DISCORD_BOT_APPLICATION_ID=... DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... bun scripts/register-discord-commands.ts",
  );
  process.exit(1);
}

const OPTION = { STRING: 3, BOOLEAN: 5, ATTACHMENT: 11 } as const;

const uploadCommand = {
  name: "upload",
  type: 1,
  description: "Upload an asset to the skowt review queue",
  options: [
    {
      type: OPTION.ATTACHMENT,
      name: "image",
      description: "The image to upload",
      required: true,
    },
    {
      type: OPTION.STRING,
      name: "name",
      description: "Asset name (e.g. Raiden Shogun Character Sheet)",
      required: true,
      min_length: 3,
      max_length: 255,
    },
    {
      type: OPTION.STRING,
      name: "game",
      description: "Which game the asset is from",
      required: true,
      autocomplete: true,
    },
    {
      type: OPTION.STRING,
      name: "category",
      description: "Asset category (pick the game first)",
      required: true,
      autocomplete: true,
    },
    {
      type: OPTION.STRING,
      name: "tag",
      description: "Is this an official asset or fan-made?",
      required: true,
      choices: [
        { name: "Official", value: "official" },
        { name: "Fan-made", value: "fanmade" },
      ],
    },
    {
      type: OPTION.BOOLEAN,
      name: "suggestive",
      description: "Mark as suggestive content",
      required: false,
    },
  ],
};

const res = await fetch(
  `https://discord.com/api/v10/applications/${APPLICATION_ID}/guilds/${guildId}/commands`,
  {
    method: "PUT",
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([uploadCommand]),
  },
);

if (!res.ok) {
  console.error(`registration failed: ${res.status}`);
  console.error(await res.text());
  process.exit(1);
}

const commands = (await res.json()) as Array<{ name: string; id: string }>;
console.log(`registered ${commands.length} command(s) in guild ${guildId}:`);
for (const c of commands) console.log(`  /${c.name} (${c.id})`);

export {};
