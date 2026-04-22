#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "fs";
import { join, basename, dirname } from "path";
import { homedir, platform } from "os";

interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

interface AgentSession {
  id: string;
  agent: "cursor" | "claude-code" | "opencode";
  project_name: string;
  project_path: string;
  start_time: string;
  end_time: string;
  duration: number;
  message_count: number;
  tool_calls: number;
  messages: AgentMessage[];
}

interface Output {
  date: string;
  time_range: { start: string; end: string };
  sessions: AgentSession[];
  by_agent: { cursor: number; "claude-code": number; opencode: number };
  total: number;
}

function formatTime(ts: string | number | undefined): string {
  if (!ts) return "";
  const d = new Date(typeof ts === "string" ? parseInt(ts) : ts);
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function extractTextContent(content: any): string {
  // Handle string content (direct user input)
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((c: any) => {
      if (c.type === "text") return c.text || "";
      // if (c.type === "tool_result") return `[tool_result] ${c.content || ""}`;
      // if (c.type === "tool_use" || c.type === "tool") return `[tool: ${c.name || "unknown"}]`;
      // if (c.type === "thinking") return `[thinking] ${c.thinking || ""}`;
      // if (c.name) return `[tool: ${c.name}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function getDateDir(date: string): string {
  return join(homedir(), ".x-agent-sessions", date);
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function getCursorProjectsPath(): string {
  return join(homedir(), ".cursor", "projects");
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonlFiles(full));
      } else if (entry.name.endsWith(".jsonl")) {
        files.push(full);
      }
    }
  } catch { }
  return files.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
}

function getCursorWorkspaceMap(): Map<string, string> {
  const map = new Map<string, string>();
  const isMac = platform() === "darwin";
  const storagePath = isMac
    ? join(homedir(), "Library", "Application Support", "Cursor", "User", "workspaceStorage")
    : join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), "Cursor", "User", "workspaceStorage");

  if (!existsSync(storagePath)) return map;

  try {
    function scanDir(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(full);
        } else if (entry.name === "workspace.json") {
          try {
            const content = JSON.parse(readFileSync(full, "utf-8"));
            if (content.folder && content.folder.startsWith("file://")) {
              let folderPath = content.folder.slice(7);
              if (platform() === "win32") {
                folderPath = folderPath.replace(/[a-zA-Z]:[\/\\]/, "").split(/[\/\\]/).join("-").replace(/\./g, "").replace(/_/g, "-") || "";
              } else {
                folderPath = folderPath.slice(1).split("/").join("-").replace(/\./g, "").replace(/_/g, "-");
              }
              map.set(folderPath, decodeURIComponent(content.folder.replace("file://", "")));
            }
          } catch { }
        }
      }
    }
    scanDir(storagePath);
  } catch { }
  return map;
}

interface CursorStats {
  userMsg: number;
  toolCalls: number;
  minT: number;
  maxT: number;
}

function getCursorStats(messages: any[]): CursorStats {
  let userMsg = 0, toolCalls = 0, minT = 0, maxT = 0;

  for (const m of messages) {
    const content = m.message?.content || m.content || [];

    if (m.role === "user") {
      const hasText = content.some?.((c: any) => c.type === "text" && c.text);
      if (hasText) userMsg++;
    }
    for (const c of content) {
      if (c.type === "tool_use" || c.type === "tool" || c.type === "tool_call" || c.type === "tool-call") {
        toolCalls++;
      }
      if (c.name) toolCalls++;
    }
    if (m.timestamp) {
      const t = new Date(m.timestamp).getTime();
      if (t > 0 && !isNaN(t)) {
        if (!minT || t < minT) minT = t;
        if (t > maxT) maxT = t;
      }
    }
  }
  return { userMsg, toolCalls, minT, maxT };
}

function parseCursorSession(filePath: string, workspaceMap: Map<string, string>): AgentSession | null {
  try {
    const lines = readFileSync(filePath, "utf-8")
      .split("\n")
      .filter((v) => v.trim())
      .map((v) => JSON.parse(v));

    if (lines.length === 0) return null;

    const messages = lines.filter((l: any) => l.role === "user" || l.role === "assistant");
    const stats = getCursorStats(messages);

    if (stats.userMsg < 1) return null;

    let startTime = "";
    let endTime = "";
    let duration = 0;

    if (stats.minT > 0 && stats.maxT > 0) {
      startTime = formatTime(stats.minT);
      endTime = formatTime(stats.maxT);
      duration = Math.round((stats.maxT - stats.minT) / 1000);
    } else {
      const fileStat = statSync(filePath);
      const fileTime = fileStat.mtime.getTime();
      startTime = formatTime(fileTime);
      endTime = formatTime(fileTime);
    }

    const relativePath = filePath.replace(getCursorProjectsPath(), "");
    const parts = relativePath.split("/").filter(Boolean);
    const projectName = parts[0] || "unknown";
    const projectPath = workspaceMap.get(basename(dirname(filePath))) || dirname(filePath);

    return {
      id: `cursor-${basename(filePath, ".jsonl")}`,
      agent: "cursor",
      project_name: projectName,
      project_path: projectPath,
      start_time: startTime,
      end_time: endTime,
      duration,
      message_count: messages.length,
      tool_calls: stats.toolCalls,
      messages: messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: extractTextContent(m.message?.content || m.content || []),
        timestamp: m.timestamp || "",
      })),
    };
  } catch {
    return null;
  }
}

function collectCursorSessions(date: string): AgentSession[] {
  const projectsPath = getCursorProjectsPath();
  if (!existsSync(projectsPath)) return [];

  const workspaceMap = getCursorWorkspaceMap();
  const jsonlFiles = findJsonlFiles(projectsPath);
  const sessions: AgentSession[] = [];

  for (const file of jsonlFiles) {
    const session = parseCursorSession(file, workspaceMap);
    if (session && session.start_time.startsWith(date)) {
      sessions.push(session);
    }
  }
  return sessions;
}

function getClaudeCodeProjectsPath(): string {
  return join(homedir(), ".claude", "transcripts");
}

function getClaudeCodeProjectsWorkdirPath(): string {
  return join(homedir(), ".claude", "projects");
}

function comboMessages(msgs: any[]): AgentMessage[] {
  return msgs.map((m: any) => ({
    role: m.type as "user" | "assistant",
    content: extractTextContent(m.message?.content || []),
    timestamp: m.timestamp || "",
  })).filter((m: any) => m.content);
}

function collectClaudeCodeSessions(date: string): AgentSession[] {
  const sessions: AgentSession[] = [];

  // Scan transcripts directory
  const transcriptsPath = getClaudeCodeProjectsPath();
  if (existsSync(transcriptsPath)) {
    const jsonlFiles = findJsonlFiles(transcriptsPath);
    for (const file of jsonlFiles) {
      try {
        const lines = readFileSync(file, "utf-8")
          .split("\n")
          .filter((v) => v.trim())
          .map((v) => JSON.parse(v));

        if (lines.length === 0) continue;
        const messages = lines.filter((l: any) => l.type === "user" || l.type === "assistant");
        const userMsg = messages.filter((m: any) => m.type === "user").length;
        if (userMsg < 1) continue;

        let startTime = "";
        let endTime = "";
        const firstTs = lines.find((l: any) => l.timestamp)?.timestamp;
        const lastTs = [...lines].reverse().find((l: any) => l.timestamp)?.timestamp;
        if (firstTs) startTime = formatTime(new Date(firstTs).getTime());
        if (lastTs) endTime = formatTime(new Date(lastTs).getTime());
        if (!startTime || !startTime.startsWith(date)) continue;

        sessions.push({
          id: `claude-code-${basename(file, ".jsonl")}`,
          agent: "claude-code",
          project_name: "unknown",
          project_path: dirname(file),
          start_time: startTime,
          end_time: endTime || startTime,
          duration: endTime ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000) : 0,
          message_count: messages.length,
          tool_calls: lines.filter((l: any) => l.type === "tool_use").length,
          messages: comboMessages(messages),
        });
      } catch { }
    }
  }

  // Scan projects/*-workdir/ directory (Claude Code session format)
  // Also scan projects/*/ directory for direct .jsonl file storage
  const projectsPath = getClaudeCodeProjectsWorkdirPath();
  if (existsSync(projectsPath)) {
    try {
      for (const entry of readdirSync(projectsPath, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;

        const dirPath = join(projectsPath, entry.name);
        let jsonlFiles: string[] = [];

        // Check if it's a workdir directory
        if (entry.name.endsWith("-workdir")) {
          jsonlFiles = readdirSync(dirPath).filter((f: string) => f.endsWith(".jsonl")).map(f => join(dirPath, f));
        } else {
          // Check for direct .jsonl files in the directory
          const directFiles = readdirSync(dirPath).filter((f: string) => f.endsWith(".jsonl"));
          if (directFiles.length > 0) {
            jsonlFiles = directFiles.map(f => join(dirPath, f));
          }
          // Also check subdirs for workdir-like structures
          const subdirs = readdirSync(dirPath, { withFileTypes: true })
            .filter(e => e.isDirectory() && e.name.endsWith("-workdir"))
            .map(e => join(dirPath, e.name));
          for (const subdir of subdirs) {
            jsonlFiles.push(...readdirSync(subdir).filter((f: string) => f.endsWith(".jsonl")).map(f => join(subdir, f)));
          }
        }

        for (const filePath of jsonlFiles) {
          try {
            const lines = readFileSync(filePath, "utf-8")
              .split("\n")
              .filter((v) => v.trim())
              .map((v) => JSON.parse(v));

            if (lines.length === 0) continue;

            // Find user/assistant messages - format is {type, ...} not {role}
            const messages = lines.filter((l: any) => l.type === "user" || l.type === "assistant");
            const userMsg = messages.filter((m: any) => m.type === "user").length;
            if (userMsg < 1) continue;

            let startTime = "";
            let endTime = "";
            const firstTs = lines.find((l: any) => l.timestamp)?.timestamp;
            const lastTs = [...lines].reverse().find((l: any) => l.timestamp)?.timestamp;
            if (firstTs) startTime = formatTime(new Date(firstTs).getTime());
            if (lastTs) endTime = formatTime(new Date(lastTs).getTime());
            if (!startTime || !startTime.startsWith(date)) continue;

            sessions.push({
              id: `claude-code-${basename(filePath, ".jsonl")}`,
              agent: "claude-code",
              project_name: entry.name,
              project_path: dirPath,
              start_time: startTime,
              end_time: endTime || startTime,
              duration: endTime ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 1000) : 0,
              message_count: messages.length,
              tool_calls: lines.filter((l: any) => l.type === "tool_use").length,
              messages: comboMessages(messages),
            });
          } catch { }
        }
      }
    } catch { }
  }

  return sessions;
}

function getOpenCodeStoragePath(): string {
  return join(homedir(), ".local", "share", "opencode", "storage");
}

function findJsonFiles(dir: string, ext?: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...findJsonFiles(full, ext));
      } else if (!ext || entry.name.endsWith(ext)) {
        files.push(full);
      }
    }
  } catch { }
  return files;
}

function collectOpenCodeSessions(date: string): AgentSession[] {
  const storagePath = getOpenCodeStoragePath();
  if (!existsSync(storagePath)) return [];

  const sessionDir = join(storagePath, "session");
  if (!existsSync(sessionDir)) return [];

  const sessionFiles = findJsonFiles(sessionDir, ".json");
  const sessions: AgentSession[] = [];

  for (const file of sessionFiles) {
    try {
      const session = JSON.parse(readFileSync(file, "utf-8"));
      const sessionId = session.id || basename(file, ".json");
      const createdAt = session.time?.created;
      if (!createdAt) continue;

      const sessionDate = formatTime(createdAt).split(" ")[0];
      if (sessionDate !== date) continue;

      const messageDir = join(storagePath, "message", sessionId);
      const messageFiles = existsSync(messageDir) ? findJsonFiles(messageDir, ".json") : [];
      let messageCount = 0;
      let userMsgCount = 0;
      const extractedMessages: AgentMessage[] = [];

      for (const mf of messageFiles) {
        try {
          const msg = JSON.parse(readFileSync(mf, "utf-8"));
          messageCount++;
          if (msg.role === "user") {
            userMsgCount++;
            extractedMessages.push({
              role: "user",
              content: msg.summary?.title || "",
              timestamp: msg.time?.created ? new Date(msg.time.created).toISOString() : "",
            });
          } else if (msg.role === "assistant") {
            extractedMessages.push({
              role: "assistant",
              content: msg.summary?.title ? `[${msg.agent}] ${msg.summary.title}` : "",
              timestamp: msg.time?.created ? new Date(msg.time.created).toISOString() : "",
            });
          }
        } catch { }
      }

      if (userMsgCount < 1) continue;

      sessions.push({
        id: `opencode-${sessionId}`,
        agent: "opencode",
        project_name: session.title || "Untitled",
        project_path: session.directory || "",
        start_time: formatTime(createdAt),
        end_time: formatTime(session.time?.updated || createdAt),
        duration: Math.round(((session.time?.updated || createdAt) - createdAt) / 1000),
        message_count: messageCount,
        tool_calls: 0,
        messages: extractedMessages,
      });
    } catch { }
  }
  return sessions;
}

function parseArgs(): { agent?: string; date: string; format?: string; role?: string } {
  const args = process.argv.slice(2);
  let agent: string | undefined;
  let date = new Date().toISOString().split("T")[0];
  let format: string | undefined;
  let role: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--agent=")) {
      agent = arg.split("=")[1];
    } else if (arg.startsWith("--date=")) {
      date = arg.split("=")[1];
    } else if (arg.startsWith("--format=")) {
      format = arg.split("=")[1];
    } else if (arg.startsWith("--role=")) {
      role = arg.split("=")[1];
    }
  }
  return { agent, date, format, role };
}

function formatAgentOutput(sessions: AgentSession[]): string {
  const lines: string[] = [];
  for (const session of sessions) {
    lines.push("");
    lines.push("");
    lines.push("=".repeat(60));
    lines.push(`Session: ${session.id}`);
    lines.push(`Agent: ${session.agent}`);
    lines.push(`Project: ${session.project_name}`);
    lines.push(`Time: ${session.start_time} - ${session.end_time}`);
    lines.push(`Duration: ${session.duration}s | Messages: ${session.message_count}`);
    lines.push("=".repeat(60));
    lines.push("## Conversation");

    // Parse messages - Claude Code format is already flattened text
    // Now session.messages is AgentMessage[]
    for (const msg of session.messages) {
      if (!msg.content?.trim()) continue;

      const content = msg.content;

      // For user messages - only show actual user input, not tool results
      if (msg.role === "user") {
        lines.push(`**User**: ${content.slice(0, 300)}${content.length > 300 ? "..." : ""}`);
        continue;
      }

      // For assistant messages - skip very short ones and tool-related ones
      if (content.length < 50 && !content.includes("**")) continue;
      lines.push(`**Assistant**: ${content.slice(0, 500)}${content.length > 500 ? "..." : ""}`);
    }

    lines.push("");
    lines.push("");
  }
  return lines.join("\n");
}

function main() {
  const { agent, date, format, role } = parseArgs();
  let allSessions: AgentSession[] = [];

  if (!agent || agent === "cursor") {
    allSessions.push(...collectCursorSessions(date));
  }
  if (!agent || agent === "claude-code") {
    allSessions.push(...collectClaudeCodeSessions(date));
  }
  if (!agent || agent === "opencode") {
    allSessions.push(...collectOpenCodeSessions(date));
  }

  allSessions.sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));

  allSessions = allSessions.filter((s) => !s.project_name.includes('multica'));

  // Agent format: output to console directly
  if (format === "agent") {
    const output = formatAgentOutput(allSessions);
    console.log(output);
    console.log(`\n[TOTAL: ${allSessions.length} sessions]`);
    return;
  } else {
    // Default JSON format
    const byAgent = {
      cursor: allSessions.filter((s) => s.agent === "cursor").length,
      "claude-code": allSessions.filter((s) => s.agent === "claude-code").length,
      opencode: allSessions.filter((s) => s.agent === "opencode").length,
    };

    const outputData: Output = {
      date,
      time_range: {
        start: allSessions.length > 0 ? allSessions[0].start_time : "",
        end: allSessions.length > 0 ? allSessions[allSessions.length - 1].end_time : "",
      },
      sessions: allSessions,
      by_agent: byAgent,
      total: allSessions.length,
    };
    console.log(JSON.stringify(outputData, null, 2));
  }
}

main();
