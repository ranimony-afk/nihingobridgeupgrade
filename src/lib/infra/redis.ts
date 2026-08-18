import { logger } from "./logger";

type RedisLike = {
  ping: () => Promise<string>;
  incr: (key: string) => Promise<number>;
  pexpire: (key: string, ms: number) => Promise<number>;
  pttl: (key: string) => Promise<number>;
  quit: () => Promise<string>;
};

const globalRedis = globalThis as typeof globalThis & { __nbRedis?: RedisLike | null; __nbRedisTried?: boolean };

export async function getRedis(): Promise<RedisLike | null> {
  if (globalRedis.__nbRedis) return globalRedis.__nbRedis;
  if (globalRedis.__nbRedisTried && globalRedis.__nbRedis === null) return null;

  const url = process.env.REDIS_URL;
  if (!url) {
    globalRedis.__nbRedis = null;
    globalRedis.__nbRedisTried = true;
    return null;
  }

  try {
    const { default: Redis } = await import("ioredis");
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 1500,
    });
    await client.connect();
    globalRedis.__nbRedis = client;
    globalRedis.__nbRedisTried = true;
    return client;
  } catch (error) {
    logger.warn("redis.unavailable", { msg: error instanceof Error ? error.message : "connect failed" });
    globalRedis.__nbRedis = null;
    globalRedis.__nbRedisTried = true;
    return null;
  }
}

export async function pingRedis() {
  const client = await getRedis();
  if (!client) return { configured: Boolean(process.env.REDIS_URL), ok: false, status: process.env.REDIS_URL ? "down" : "not_configured" };
  try {
    const pong = await client.ping();
    return { configured: true, ok: pong === "PONG", status: pong === "PONG" ? "up" : "down" };
  } catch {
    return { configured: true, ok: false, status: "down" };
  }
}
