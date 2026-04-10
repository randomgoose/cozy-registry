const INTERNAL_WORKER_SECRET_HEADER = "x-cozy-internal-job-secret";
const INTERNAL_WORKER_USER_ID_HEADER = "x-cozy-request-user-id";

export function getInternalWorkerAuth(request: Request): {
  isAuthorized: boolean;
  requestUserId: string | null;
} {
  const configuredSecret =
    process.env.COZY_INTERNAL_JOB_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  if (!configuredSecret) {
    return { isAuthorized: false, requestUserId: null };
  }

  const providedSecret =
    request.headers.get(INTERNAL_WORKER_SECRET_HEADER)?.trim() || "";
  if (!providedSecret || providedSecret !== configuredSecret) {
    return { isAuthorized: false, requestUserId: null };
  }

  const requestUserId =
    request.headers.get(INTERNAL_WORKER_USER_ID_HEADER)?.trim() || null;
  return { isAuthorized: true, requestUserId };
}

export function getInternalWorkerHeaders(input: {
  requestUserId?: string | null;
}): Record<string, string> {
  const secret =
    process.env.COZY_INTERNAL_JOB_SECRET?.trim() ||
    process.env.INTERNAL_JOB_SECRET?.trim() ||
    "";
  if (!secret) return {};

  const headers: Record<string, string> = {
    [INTERNAL_WORKER_SECRET_HEADER]: secret,
  };
  const requestUserId = input.requestUserId?.trim();
  if (requestUserId) {
    headers[INTERNAL_WORKER_USER_ID_HEADER] = requestUserId;
  }
  return headers;
}

