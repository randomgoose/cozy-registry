import { cache } from "react";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";

export const getCachedAuthSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
