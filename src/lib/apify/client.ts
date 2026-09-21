const APIFY_API_BASE = "https://api.apify.com/v2";

function token(): string {
  const t = process.env.APIFY_API_TOKEN;
  if (!t) throw new Error("APIFY_API_TOKEN is not set");
  return t;
}

export interface ApifyRunHandle {
  runId: string;
  datasetId: string;
  status: string;
}

/**
 * Starts an actor run asynchronously and returns immediately with the run
 * handle. We poll for completion separately (see getRunStatus) instead of
 * using Apify's run-sync endpoint, because ad-library scrapes can take
 * longer than a serverless function is allowed to stay open.
 */
export async function startActorRun(actorId: string, input: Record<string, unknown>): Promise<ApifyRunHandle> {
  const res = await fetch(
    `${APIFY_API_BASE}/acts/${encodeURIComponent(actorId)}/runs?token=${token()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify run start failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  return {
    runId: json.data.id,
    datasetId: json.data.defaultDatasetId,
    status: json.data.status,
  };
}

export interface ApifyRunStatus {
  status: "READY" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED-OUT" | "ABORTED";
  datasetId: string;
}

export async function getRunStatus(runId: string): Promise<ApifyRunStatus> {
  const res = await fetch(`${APIFY_API_BASE}/actor-runs/${runId}?token=${token()}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify run status check failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return {
    status: json.data.status,
    datasetId: json.data.defaultDatasetId,
  };
}

export async function getDatasetItems<T = Record<string, unknown>>(datasetId: string): Promise<T[]> {
  const res = await fetch(
    `${APIFY_API_BASE}/datasets/${datasetId}/items?token=${token()}&clean=true&format=json`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apify dataset fetch failed (${res.status}): ${text}`);
  }
  return res.json();
}
