/**
 * Agent Trace - Commit Attribution Tracking
 * 
 * Stores trace records in .agent-trace/ per-repo for later audit trails.
 * Each trace captures: agent, model, session, task, diff stats, and commit info.
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, writeFileSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { ensurePrivateDirectory, ensurePrivateFile, writePrivateFile } from './private-state.js';

/**
 * Find git repo root from cwd (or specified path)
 */
export function findGitRoot(startPath = process.cwd()) {
  try {
    const result = execSync('git rev-parse --show-toplevel', {
      cwd: startPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return result.trim();
  } catch {
    return null;
  }
}

/**
 * Get current git diff stats (before commit)
 */
export function getDiffStats(repoPath) {
  try {
    const staged = execSync('git diff --cached --stat', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    // Also get summary numbers
    const shortstat = execSync('git diff --cached --shortstat', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    
    return { stat: staged, shortstat };
  } catch {
    return { stat: '', shortstat: '' };
  }
}

/**
 * Get the latest commit info (after commit)
 */
export function getLatestCommit(repoPath) {
  try {
    const hash = execSync('git rev-parse HEAD', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
    
    const message = execSync('git log -1 --format=%B', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
    
    const author = execSync('git log -1 --format="%an <%ae>"', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
    
    return { hash, message, author };
  } catch {
    return null;
  }
}

/**
 * Execute git commit with all args passed through
 */
export function gitCommit(args, repoPath) {
  const result = spawnSync('git', ['commit', ...args], {
    cwd: repoPath,
    stdio: 'inherit',
    encoding: 'utf-8'
  });
  return result.status;
}

/**
 * Ensure .agent-trace directory exists
 */
export function ensureTraceDir(repoPath) {
  const traceDir = join(repoPath, '.agent-trace');
  const existed = existsSync(traceDir);
  ensurePrivateDirectory(traceDir);
  for (const file of readdirSync(traceDir).filter(file => file.endsWith('.json'))) {
    ensurePrivateFile(join(traceDir, file), { create: false });
  }
  if (!existed) {
    
    // Add to .gitignore if not already there
    const gitignore = join(repoPath, '.gitignore');
    if (existsSync(gitignore)) {
      const content = readFileSync(gitignore, 'utf-8');
      if (!content.includes('.agent-trace')) {
        writeFileSync(gitignore, content.trimEnd() + '\n.agent-trace/\n');
      }
    } else {
      writeFileSync(gitignore, '.agent-trace/\n');
    }
  }
  return traceDir;
}

/**
 * Generate trace filename from commit hash and timestamp
 */
function traceFilename(commitHash, timestamp) {
  const date = new Date(timestamp);
  const dateStr = date.toISOString().split('T')[0];
  const shortHash = commitHash.substring(0, 8);
  return `${dateStr}-${shortHash}.json`;
}

/**
 * Create a trace record for a commit
 */
export function createTrace(options) {
  const {
    repoPath,
    commitHash,
    commitMessage,
    commitAuthor,
    agent,
    model,
    sessionKey,
    taskId,
    diffStats
  } = options;
  
  const timestamp = new Date().toISOString();
  
  const trace = {
    version: 1,
    timestamp,
    commit: {
      hash: commitHash,
      message: commitMessage,
      author: commitAuthor
    },
    agent: {
      name: agent || process.env.PARDNER_AGENT || 'unknown',
      model: model || process.env.PARDNER_AGENT_MODEL || process.env.OPENCLAW_MODEL || null,
      sessionKey:
        sessionKey ||
        process.env.PARDNER_AGENT_SESSION_KEY ||
        process.env.OPENCLAW_SESSION_KEY ||
        null
    },
    task: taskId || null,
    diff: diffStats || null
  };
  
  const traceDir = ensureTraceDir(repoPath);
  const filename = traceFilename(commitHash, timestamp);
  const filepath = join(traceDir, filename);
  
  writePrivateFile(filepath, JSON.stringify(trace, null, 2) + '\n');
  
  return { filepath, trace };
}

/**
 * List traces from a repo
 */
export function listTraces(repoPath, options = {}) {
  const { limit = 20 } = options;
  const traceDir = join(repoPath, '.agent-trace');
  
  if (!existsSync(traceDir)) {
    return [];
  }
  
  const files = readdirSync(traceDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse()
    .slice(0, limit);
  
  return files.map(f => {
    try {
      const content = readFileSync(join(traceDir, f), 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Get a specific trace by commit hash.
 * When exact is true, only return a trace whose full hash matches commitHash.
 */
export function getTraceByCommit(repoPath, commitHash, options = {}) {
  const { exact = false } = options;
  const traceDir = join(repoPath, '.agent-trace');
  
  if (!existsSync(traceDir)) {
    return null;
  }
  
  const shortHash = commitHash.substring(0, 8);
  const files = readdirSync(traceDir).filter(f => f.includes(shortHash));
  
  if (files.length === 0) return null;
  
  let prefixMatch = null;

  for (const file of files) {
    try {
      const content = readFileSync(join(traceDir, file), 'utf-8');
      const trace = JSON.parse(content);

      if (trace?.commit?.hash === commitHash) {
        return trace;
      }
      if (!exact && prefixMatch === null) {
        prefixMatch = trace;
      }
    } catch {
      // Skip unreadable trace files and continue scanning candidates.
    }
  }

  return exact ? null : prefixMatch;
}
