import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

test("tests and scans the standalone gateway without cloud credentials", () => {
  const workflow = read(".github/workflows/subscription-gateway.yml");

  expect(workflow).toContain("bun install --frozen-lockfile");
  expect(workflow).toContain("bun run typecheck");
  expect(workflow).toContain("bun run test");
  expect(workflow).toContain("platforms: linux/amd64");
  expect(workflow).toContain("--severity CRITICAL");
  expect(workflow).not.toContain("AWS_ACCESS_KEY_ID");
});

test("uses protected OIDC deployment with signed digest images and SSM", () => {
  const workflow = read(".github/workflows/aws-deploy.yml");

  expect(workflow).toContain("environment: production");
  expect(workflow).toContain("id-token: write");
  expect(workflow).toContain("role-to-assume:");
  expect(workflow).toContain("cosign sign --yes");
  expect(workflow).toContain("deploy-via-ssm");
  expect(workflow).toContain("Deploy worker first");
  expect(workflow).not.toContain("AWS_ACCESS_KEY_ID");
  expect(workflow).not.toMatch(/image[^\n]*:latest/);
});

test("rolls a failed host start back without changing provider auth", () => {
  const deploy = read("deploy/aws/bin/deploy-via-ssm");

  expect(deploy).toContain("restored the prior image setting");
  expect(deploy).toContain("file://$old_secret");
  expect(deploy).toContain("secretsmanager put-secret-value");
  expect(deploy).not.toContain("/srv/openbot-auth");
  expect(deploy).not.toContain("aws ssm wait command-executed");
  expect(deploy).toContain("seq 1 180");
});

test("installs the staged host bundle and gates workers on liveness", () => {
  const install = read("deploy/aws/bin/install-host");

  expect(install).toContain('chmod 0755 "$deploy_root"/bin/*');
  expect(install).not.toContain('install -m 0755 "$deploy_root/bin/ecr-login"');
  expect(install).toContain("http://127.0.0.1:4210/health");
  expect(install).toContain("http://127.0.0.1:4212/health");
});

test("the AWS secret examples use the server token contract", () => {
  const control = JSON.parse(read("deploy/aws/control-secret.example.json"));

  expect(control.CODEX_AGENT_TOKEN).toBe("MATCH_CODEX_GATEWAY_TOKEN");
  expect(control.GROK_AGENT_TOKEN).toBe("MATCH_GROK_GATEWAY_TOKEN");
  expect(control).not.toHaveProperty("CODEX_AGENT_AG_UI_TOKEN");
  expect(control).not.toHaveProperty("GROK_AGENT_AG_UI_TOKEN");
});

test("publishes the gateway and uses the current fork package namespace", () => {
  const images = JSON.parse(read(".github/published-images.json")) as string[];
  const workflow = read(".github/workflows/publish-release.yml");

  expect(images).toContain("agent-subscription-gateway");
  expect(workflow).toContain("$" + "{GITHUB_REPOSITORY_OWNER,,}/openbot");
  expect(workflow).not.toContain("ghcr.io/copilotkit/openbot");
});
