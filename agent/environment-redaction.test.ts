import assert from "node:assert/strict";
import test from "node:test";
import { normalizeDockerContainer, parseComposeServiceDetails } from "./docker-discovery.ts";

const sensitiveValue = "super-sensitive-value-9f0b";

test("redacts sensitive environment values by default", () => {
  const container = normalizeDockerContainer(
    { Id: "container-id", Names: ["/demo"], Image: "demo:latest", State: "running", Ports: [] },
    {
      Id: "container-id",
      Config: {
        Env: [
          "APP_MODE=production",
          `DATABASE_URL=postgres://user:${sensitiveValue}@example.test/db`,
          `ENCRYPTION_KEY=${sensitiveValue}`,
          "PUBLIC_PORT=8080",
        ],
      },
      State: { Status: "running" },
    },
  );

  const environment = container?.environment || [];
  const databaseUrl = environment.find((variable) => variable.name === "DATABASE_URL")?.value || "";
  assert.equal(databaseUrl.includes(sensitiveValue), false);
  assert.equal(environment.find((variable) => variable.name === "ENCRYPTION_KEY")?.value, "<redacted>");
  assert.equal(environment.find((variable) => variable.name === "APP_MODE")?.value, "production");
  assert.equal(environment.find((variable) => variable.name === "PUBLIC_PORT")?.value, "8080");
});

test("redacts sensitive values in Compose environment metadata", () => {
  const details = parseComposeServiceDetails(
    `services:\n  app:\n    environment:\n      DATABASE_URL: postgres://user:${sensitiveValue}@example.test/db\n      ENCRYPTION_KEY: ${sensitiveValue}\n      APP_MODE: production\n`,
    "app",
  );

  const databaseUrl = details.environment.find((variable) => variable.name === "DATABASE_URL")?.value || "";
  assert.equal(databaseUrl.includes(sensitiveValue), false);
  assert.equal(details.environment.find((variable) => variable.name === "ENCRYPTION_KEY")?.value, "<redacted>");
  assert.equal(details.environment.find((variable) => variable.name === "APP_MODE")?.value, "production");
});
