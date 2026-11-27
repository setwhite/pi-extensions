// @ts-nocheck
// e2e fixture：迷你版 herdr pi 集成，让子 pane 走和生产环境一样的 hook 上报。
// 生产环境里这个文件由 herdr 装在 ~/.pi/agent/extensions/herdr-agent-state.ts；
// 没有它时 herdr 靠屏幕检测推进状态，和真机跑的不是同一条路径。
import net from "node:net";

const BACKSLASH = String.fromCharCode(92);
const PIPE_PREFIX = `${BACKSLASH}${BACKSLASH}.${BACKSLASH}pipe${BACKSLASH}`;
const socketPath = process.env.HERDR_SOCKET_PATH;
const endpoint = process.platform === "win32" && socketPath ? PIPE_PREFIX + socketPath : socketPath;
const paneId = process.env.HERDR_PANE_ID;
const source = "herdr:pi";
const enabled = process.env.HERDR_ENV === "1" && Boolean(socketPath) && Boolean(paneId);

let reportSeq = Date.now() * 1000;

function nextSeq() {
  reportSeq += 1;
  return reportSeq;
}

function report(method, params) {
  if (!enabled) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve();
    };
    const socket = net.createConnection(endpoint);
    socket.on("error", finish);
    socket.on("data", finish);
    socket.on("connect", () => {
      const id = `e2e:${Math.random().toString(36).slice(2)}`;
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    const timer = setTimeout(finish, 1500);
    timer.unref?.();
  });
}

function reportState(state) {
  return report("pane.report_agent", { pane_id: paneId, source, agent: "pi", state, seq: nextSeq() });
}

function reportSession(ctx) {
  const file = ctx?.sessionManager?.getSessionFile?.();
  if (typeof file !== "string" || file === "") {
    return Promise.resolve();
  }
  return report("pane.report_agent_session", {
    pane_id: paneId,
    source,
    agent: "pi",
    seq: nextSeq(),
    agent_session_path: file,
  });
}

export default function (pi) {
  if (!enabled) {
    return;
  }

  pi.on("session_start", async (_event, ctx) => {
    if (ctx?.mode !== "tui") {
      return;
    }
    await reportSession(ctx);
    await reportState("idle");
  });

  pi.on("agent_start", (_event, ctx) => {
    void reportSession(ctx);
    void reportState("working");
  });

  pi.on("agent_settled", (_event, ctx) => {
    if (ctx?.isIdle?.() !== true) {
      return;
    }
    void reportState("idle");
  });
}
