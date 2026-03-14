import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apiKey: schema.apiKey,
    },
  }),
  emailAndPassword: { enabled: true },
  plugins: [
    apiKey({
      defaultPrefix: "vbr_",
      apiKeyHeaders: ["x-api-key"],
      customAPIKeyGetter: (ctx) => {
        const req = ctx.request;
        if (!req) return null;
        const authHeader = req.headers.get("authorization");
        if (authHeader?.startsWith("Bearer ")) {
          return authHeader.slice(7);
        }
        return req.headers.get("x-api-key");
      },
    }),
    nextCookies(),
  ],
});
