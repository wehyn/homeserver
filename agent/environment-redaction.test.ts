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
          "DATABASE_URL=postgres://user:" + sensitiveValue + "@example.test/db",
          "ENCRYPTION_KEY=" + sensitiveValue,
          "APP_KEY=" + sensitiveValue,
          "LICENSE_KEY=" + sensitiveValue,
          "PUBLIC_PORT=8080",
          "WEBHOOK_URL=https://example.test/hook?token=" + sensitiveValue + "#fragment-secret",
        ],
      },
      State: { Status: "running" },
    },
  );

  const environment = container?.environment || [];
  for (const variable of environment) assert.equal(variable.value.includes(sensitiveValue), false, variable.name);
  assert.equal(environment.find((variable) => variable.name === "ENCRYPTION_KEY")?.value, "<redacted>");
  assert.equal(environment.find((variable) => variable.name === "APP_KEY")?.value, "<redacted>");
  assert.equal(environment.find((variable) => variable.name === "LICENSE_KEY")?.value, "<redacted>");
  assert.equal(environment.find((variable) => variable.name === "APP_MODE")?.value, "production");
  assert.equal(environment.find((variable) => variable.name === "PUBLIC_PORT")?.value, "8080");
});

test("redacts sensitive values in Compose environment metadata", () => {
  const details = parseComposeServiceDetails(
    "services:\n  app:\n    environment:\n      DATABASE_URL: postgres://user:" + sensitiveValue + "@example.test/db\n      SIGNING_KEY: " + sensitiveValue + "\n      WEBHOOK_URL: https://example.test/hook?token=" + sensitiveValue + "#fragment-secret\n      APP_MODE: production\n",
    "app",
  );

  for (const variable of details.environment) assert.equal(variable.value.includes(sensitiveValue), false, variable.name);
  assert.equal(details.environment.find((variable) => variable.name === "SIGNING_KEY")?.value, "<redacted>");
  assert.equal(details.environment.find((variable) => variable.name === "APP_MODE")?.value, "production");
});
