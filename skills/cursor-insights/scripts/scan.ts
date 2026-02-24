#!/usr/bin/env bun
/**
 * Cursor 对话扫描脚本（精简版，不依赖 src/scanner）
 * 扫描 ~/.cursor/projects/ 下的对话并导出为 Markdown 到 doc/ 目录
 *
 * 运行: bun run scripts/scan.ts  或  bun scripts/scan.ts
 */

import { join, dirname, basename, sep } from 'path';
import { homedir, platform } from 'os';
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
// import klaw from 'klaw';
// import * as cheerio from 'cheerio';

function ensureDirSync(path: string) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

// 获取 Cursor 项目缓存目录
function getCursorProjectsPath() {
  return join(homedir(), '.cursor', 'projects');
}

// 获取 Cursor 工作区存储目录
function getWorkspaceStoragePath() {
  if (platform() === 'win32') {
    return join(process.env.APPDATA || join(homedir(), 'AppData', 'Roaming'), 'Cursor', 'User', 'workspaceStorage');
  } else {
    return join(homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'workspaceStorage');
  }
}

const CURSOR_PROJECTS = getCursorProjectsPath();
const WORKSPACE_STORAGE = getWorkspaceStoragePath();
const OUT_DIR = join(homedir(), '.agent-insights', 'conversations');


console.log('CURSOR_PROJECTS:', CURSOR_PROJECTS);
console.log('WORKSPACE_STORAGE:', WORKSPACE_STORAGE);

const readdirAsync = async (dir: string): Promise<string[]> => {
  const filenames: string[] = [];
  return new Promise(async (resolve, reject) => {
    const files = await readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const filename = join(dir, file.name)
      if (file.isDirectory()) {
        filenames.push(...await readdirAsync(filename));
      } else {
        filenames.push(filename);
      }
    }
    resolve(filenames);
  });
}

async function loadWorkspaceMap(): Promise<Map<string, string>> {
  const map: Map<string, string> = new Map<string, string>();
  if (!existsSync(WORKSPACE_STORAGE)) return map;

  return readdirAsync(WORKSPACE_STORAGE).then((filenames) => {
    for (const filename of filenames) {
      if (filename.endsWith('workspace.json')) {
        const res = JSON.parse(readFileSync(filename, 'utf-8'));
        if (res.folder && res.folder.startsWith('file://')) {
          const p = fileURLToPath(res.folder)
          let k = '';
          if(platform() === 'win32') {
            k = p.split(":\\").split(sep).join('-').replace(/\./g, '').replace(/_/g, '-');
          } else {
            k = p.slice(1).split(sep).join('-').replace(/\./g, '').replace(/_/g, '-');
          }
          map.set(k, p);
        }
      }
    }
    return map;
  });
}

function findJsonlFiles(dir: string): string[] {
  const files: string[] = [];
  if (!existsSync(dir)) return files;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findJsonlFiles(full));
    } else if (entry.name.endsWith('.jsonl')) {
      files.push(full);
    }
  }
  return files.sort((a, b) => statSync(b).mtime.getTime() - statSync(a).mtime.getTime());
}

// function parseCursorMessage(html: string): Array<{ type: string; text?: string; thinking?: string }> {
//   const contents: Array<{ type: string; text?: string; thinking?: string }> = [];
//   const $ = cheerio.load(html);
//   $('body').contents().each((_, child) => {
//     if (child.type === 'tag') {
//       const name = (child as any).name;
//       const text = $(child).text().trim();
//       if (!text) return;
//       if (name === 'think') contents.push({ type: 'thinking', thinking: text });
//       else if (name === 'code_selection') contents.push({ type: 'code_selection', text });
//       else if (name === 'attached_files') contents.push({ type: 'attached_files', text });
//       else if (name === 'user_query') contents.push({ type: 'text', text });
//       else contents.push({ type: 'text', text });
//     } else if (child.type === 'text') {
//       const text = $(child).text?.()?.trim();
//       if (text) contents.push({ type: 'text', text });
//     }
//   });
//   return contents.length ? contents : [{ type: 'text', text: html.trim() }];
// }

function convToMarkdown(conv: {
  id: string;
  projectName: string;
  projectPath: string;
  startTime: string;
  endTime: string;
  messages: Array<{ role: string; content: any[] }>;
}): string {
  const front = `---
conv_id: ${conv.id}
project_name: ${conv.projectName}
project_path: ${conv.projectPath}
start_time: ${conv.startTime}
end_time: ${conv.endTime}
---
`;
  const blocks = conv.messages.map(({ role, content }) => {
    const body = content
      .map((c) => {
        if (c.type === 'text') return c.text ?? '';
        if (c.type === 'thinking') return `<thinking>${c.thinking}</thinking>`;
        if (c.type === 'code_selection') return `<code_selection>${c.text}</code_selection>`;
        if (c.type === 'attached_files') return `<attached_files>${c.text}</attached_files>`;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    return `---\n**${role.charAt(0).toUpperCase() + role.slice(1)}**\n\n${body}\n`;
  });
  return front + blocks.join('\n');
}

async function main() {
  console.log('Scanning Cursor projects...');
  const workspaceMap = await loadWorkspaceMap();

  if (!existsSync(CURSOR_PROJECTS)) {
    console.log(`Cursor projects directory not found: ${CURSOR_PROJECTS}`);
    process.exit(0);
  }

  const entries = readdirSync(CURSOR_PROJECTS, { withFileTypes: true });
  let totalConvs = 0;
  const map: Record<string, any> = {};
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectDir = join(CURSOR_PROJECTS, entry.name);
    const transcriptsPath = join(projectDir, 'agent-transcripts');
    if (!existsSync(transcriptsPath)) continue;

    const jsonlFiles = findJsonlFiles(transcriptsPath);
    if (jsonlFiles.length === 0) continue;

    const projectPath = workspaceMap.get(entry.name) ?? entry.name;
    const projectName = basename(projectPath) || entry.name;

    for (const filePath of jsonlFiles) {
      const stat = statSync(filePath);
      const lines = readFileSync(filePath, 'utf-8')
        .split('\n')
        .filter((v) => v.trim())
        .map((v) => JSON.parse(v));

      const messages: Array<{ role: string; content: any[] }> = [];
      for (const row of lines) {
        if (row.role !== 'user' && row.role !== 'assistant') continue;
        const content = row.message?.content ?? [];
        const contents: any[] = [];
        for (const c of content) {
          if (c.type === 'text') {
            // contents.push(...parseCursorMessage(c.text ?? ''));
            contents.push(c);
          } else {
            contents.push(c);
          }
        }
        messages.push({ role: row.role, content: contents });
      }

      const convId = basename(filePath, '.jsonl');
      const startTime = lines[0]?.timestamp ?? stat.birthtime.toISOString();
      const endTime = lines[lines.length - 1]?.timestamp ?? stat.mtime.toISOString();

      const conv = {
        id: convId,
        projectName,
        projectPath,
        startTime,
        endTime,
        messages,
      };
      const outPath = join(OUT_DIR, projectName, convId + '.md');
      ensureDirSync(dirname(outPath));
      writeFileSync(outPath, convToMarkdown(conv));
      totalConvs++;


      if (!map[projectName]) map[projectName] = {
        projectName,
        projectPath,
        convs: [],
      };
      map[projectName].convs.push(outPath);
    }
  }

  console.log(`Done. ${totalConvs} conversation(s) -> ${OUT_DIR}`);
  console.log(JSON.stringify(Object.values(map), null, 2));

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
