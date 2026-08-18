const baseUrl = (process.env.SMOKE_TEST_URL ?? process.argv[2] ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const healthcheckToken = process.env.HEALTHCHECK_TOKEN;
const endpoints = ["/api/health/live", "/api/health/ready", "/api/health"];

async function probe(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: healthcheckToken ? { Authorization: `Bearer ${healthcheckToken}` } : undefined,
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    throw new Error(`${path} failed with status ${response.status}: ${JSON.stringify(body)}`);
  }

  console.log(`✓ ${path} responded healthy`);
}

try {
  for (const endpoint of endpoints) {
    await probe(endpoint);
  }
  console.log(`Smoke test passed for ${baseUrl}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
