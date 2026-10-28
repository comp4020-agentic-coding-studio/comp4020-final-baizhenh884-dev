import type { TestProject } from "vitest/node";
import { warmUp } from "./warm-up";

declare module "vitest" {
  export interface ProvidedContext {
    baseUrl: string;
  }
}

// The spec checks a RUNNING app over HTTP, so it holds whatever the app is
// built with. CI builds the Dockerfile, starts the image and points APP_URL
// at it, so what passes there is what deploys. Locally, start your app however
// you run it, then `pnpm check`; APP_URL says where it's listening. It waits
// up to a minute, since some stacks take a while to boot or migrate.
export default async function setup(project: TestProject): Promise<void> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";

  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(baseUrl);
      break;
    } catch {
      // not up yet
    }
    if (attempt >= 300) {
      throw new Error(
        `nothing is answering at ${baseUrl}: start your app first, or set APP_URL to where it's listening`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  // A stopped Fly machine is slow to answer its first requests (fly.toml,
  // min_machines_running = 0). The cold start belongs here, not to whichever
  // check happens to run first: the first request may take up to the whole
  // 90 s, and the checks start once the page answers within a second three
  // times running. A site that never gets there is reported, not failed.
  const warm = await warmUp(baseUrl, { fastMs: 1_000, inARow: 3, budgetMs: 90_000 });
  console.log(`warm-up ${baseUrl}: ${warm.warm ? "warm" : "STILL SLOW"} after ${warm.times.map((t) => `${t}ms`).join(", ")}`);

  project.provide("baseUrl", baseUrl);
}
