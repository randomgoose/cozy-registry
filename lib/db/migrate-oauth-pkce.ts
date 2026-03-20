import "dotenv/config";
import postgres from "postgres";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const sql = postgres(databaseUrl);

  try {
    await sql`
      alter table oauth_authorization_code
      add column if not exists code_challenge text;
    `;

    await sql`
      alter table oauth_authorization_code
      add column if not exists code_challenge_method text;
    `;

    console.log("OAuth PKCE columns are ready.");
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
