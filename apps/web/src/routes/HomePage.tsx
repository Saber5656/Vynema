import { useQuery } from "@tanstack/react-query";
import type { HealthResponse } from "@vynema/shared";

import { ApiError, apiFetch } from "../lib/api";

export function HomePage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiFetch<HealthResponse>("/api/health"),
  });

  if (health.isPending) {
    return (
      <section aria-labelledby="health-heading">
        <h2 id="health-heading">Local API health</h2>
        <p role="status">Checking API health…</p>
      </section>
    );
  }

  if (health.isError) {
    const message =
      health.error instanceof ApiError
        ? health.error.message
        : "The local API could not be reached.";

    return (
      <section aria-labelledby="health-heading">
        <h2 id="health-heading">Local API health</h2>
        <p role="alert">API unavailable: {message}</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="health-heading">
      <h2 id="health-heading">Local API health</h2>
      <p role="status">API connected</p>
      <dl>
        <dt>Status</dt>
        <dd>{health.data.status}</dd>
        <dt>Environment</dt>
        <dd>{health.data.environment}</dd>
      </dl>
    </section>
  );
}
