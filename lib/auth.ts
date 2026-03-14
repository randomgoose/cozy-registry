import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { apiKey } from "@better-auth/api-key";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./db/schema";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://*.vercel.app",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      apiKey: schema.apiKey,
      apikey: schema.apiKey, // api-key plugin uses "apikey" as model name
    },
  }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
    figma: {
      clientId: process.env.FIGMA_CLIENT_ID as string,
      clientSecret: process.env.FIGMA_CLIENT_SECRET as string,
    },
  },
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
