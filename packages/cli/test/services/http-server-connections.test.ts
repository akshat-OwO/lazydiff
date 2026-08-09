import { strictEqual } from "node:assert";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { Socket } from "node:net";
import { createInterface } from "node:readline";
import { test } from "node:test";

const fixtureUrl = new URL(
  "../fixtures/http-server-shutdown.ts",
  import.meta.url
);

test("SIGINT promptly closes an active HTTP connection", async (context) => {
  const child = spawn(process.execPath, [fixtureUrl.pathname], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = "";
  child.stderr.setEncoding("utf-8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  const socket = new Socket();
  context.after(() => {
    lines.close();
    socket.destroy();
    if (child.exitCode === null) {
      child.kill("SIGKILL");
    }
  });

  const [portLine] = await once(lines, "line", {
    signal: AbortSignal.timeout(5000),
  });
  const port = Number(portLine);
  strictEqual(Number.isInteger(port), true, stderr);

  socket.connect(port);
  await once(socket, "connect", { signal: AbortSignal.timeout(5000) });

  const requestStarted = once(lines, "line", {
    signal: AbortSignal.timeout(5000),
  });
  socket.write(
    "POST / HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Length: 100\r\n\r\nx"
  );
  const [requestLine] = await requestStarted;
  strictEqual(requestLine, "request-started", stderr);

  const exited = once(child, "exit", {
    signal: AbortSignal.timeout(2000),
  });
  strictEqual(child.kill("SIGINT"), true, stderr);

  const [exitCode, signal] = await exited;
  strictEqual(exitCode, 130, stderr);
  strictEqual(signal, null, stderr);
  strictEqual(socket.destroyed, true, stderr);
});
