import { defineConfig } from "drizzle-kit";

// Generates SQL migrations from src/lib/schema.ts into drizzle/; the app
// applies them when it opens the database (src/lib/db.ts).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/schema.ts",
  out: "./drizzle",
});
