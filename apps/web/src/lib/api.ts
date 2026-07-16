import type { ApiErrorBody } from "@vynema/shared";

export type ApiPath = `/api/${string}`;

type ApiErrorDetails = {
  status: number;
  code: string;
  message: string;
  requestId: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string;

  constructor({ status, code, message, requestId }: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!isRecord(value) || !isRecord(value.error)) {
    return false;
  }

  return (
    typeof value.error.code === "string" &&
    typeof value.error.message === "string" &&
    typeof value.error.requestId === "string"
  );
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new ApiError({
      status: response.status,
      code: response.ok ? "invalid_response" : `http_${response.status}`,
      message: response.ok
        ? "The API returned an invalid JSON response."
        : `The API request failed with status ${response.status}.`,
      requestId: "",
    });
  }
}

export async function apiFetch<T>(path: ApiPath, init: RequestInit = {}): Promise<T> {
  if (!path.startsWith("/api/")) {
    throw new TypeError("API paths must be same-origin paths under /api/.");
  }

  const headers = new Headers(init.headers);
  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const body = await parseJson(response);

  if (!response.ok) {
    if (isApiErrorBody(body)) {
      throw new ApiError({ status: response.status, ...body.error });
    }

    throw new ApiError({
      status: response.status,
      code: `http_${response.status}`,
      message: `The API request failed with status ${response.status}.`,
      requestId: "",
    });
  }

  return body as T;
}
