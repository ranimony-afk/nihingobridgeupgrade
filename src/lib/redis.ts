import Redis from "ioredis";
import { env, isFeatureConfigured } from "@/lib/env";
import { logError } from "@/lib/logger";

let redisClient: Redis | undefined;

export function getRedisClient(): Redis | null {
  if (!isFeatureConfigured("redis")) return null;

  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL!, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 1_500,
      retryStrategy: () => null,
    });

    redisClient.on("error", (error) => {
      logError("Redis client error", error, { component: "redis" });
    });
  }

  return redisClient;
}

export async function checkRedisHealth(): Promise<"ok" | "disabled" | "error"> {
  const client = getRedisClient();
  if (!client) return "disabled";

  try {
    if (client.status === "wait") await client.connect();
    const result = await Promise.race([
      client.ping(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Redis health check timed out")), 1_500);
      }),
    ]);

    return result === "PONG" ? "ok" : "error";
  } catch (error) {
    logError("Redis health check failed", error, { component: "redis" });
    return "error";
  }
}

export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = undefined;
  }
}
