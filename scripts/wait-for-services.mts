#!/usr/bin/env bun

const SERVICES = {
  redis: {
    name: "Redis",
    port: 6383,
    check: async () => {
      return new Promise((resolve) => {
        const _socket = Bun.connect({
          hostname: "localhost",
          port: 6383,
          socket: {
            data(socket, data) {
              const response = data.toString();
              socket.end();
              resolve(response.includes("PONG"));
            },
            open(socket) {
              socket.write("PING\r\n");
            },
            error() {
              resolve(false);
            },
            close() {},
          },
        });
        setTimeout(() => resolve(false), 2000);
      });
    },
  },
  libsql: {
    name: "LibSQL",
    port: 8082,
    check: async () => {
      const res = await fetch("http://localhost:8082/health");
      return res.ok;
    },
  },
  localstack: {
    name: "LocalStack (bucket ready)",
    port: 9004,
    check: async () => {
      const res = await fetch("http://localhost:9004/skowt-assets", { method: "HEAD" });
      return res.ok;
    },
  },
};

const MAX_RETRIES = 30;
const RETRY_DELAY = 1000;

async function waitForService(
  key: string,
  service: (typeof SERVICES)[keyof typeof SERVICES],
): Promise<boolean> {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const healthy = await service.check();
      if (healthy) {
        console.log(`✅ ${service.name} is ready`);
        return true;
      }
    } catch {
      // Service not ready yet
    }

    if (i < MAX_RETRIES - 1) {
      process.stdout.write(`⏳ Waiting for ${service.name}... (${i + 1}/${MAX_RETRIES})\r`);
      await Bun.sleep(RETRY_DELAY);
    }
  }

  console.log(`❌ ${service.name} failed to start after ${MAX_RETRIES} attempts`);
  return false;
}

async function main() {
  console.log("🐳 Waiting for Docker services...\n");

  const results = await Promise.all(
    Object.entries(SERVICES).map(([key, service]) => waitForService(key, service)),
  );

  const allHealthy = results.every(Boolean);

  if (allHealthy) {
    console.log("\n✨ All services ready!\n");
    process.exit(0);
  } else {
    console.log("\n💥 Some services failed. Run: docker-compose -f docker-compose.dev.yml logs\n");
    process.exit(1);
  }
}

main();
