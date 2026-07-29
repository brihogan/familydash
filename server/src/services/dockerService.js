import Docker from 'dockerode';
import db from '../db/db.js';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });
const CONTAINER_IMAGE = process.env.CLAUDE_CONTAINER_IMAGE || 'familydash-claude-code:latest';
const CLAUDE_NETWORK = process.env.CLAUDE_NETWORK || null;

// Track last activity per kid for idle cleanup
const lastActivity = new Map();

// Cache container names per user ID to avoid DB hits on every call
const nameCache = new Map();

// Sanitize a string for use in a Docker container name
// Docker requires: [a-zA-Z0-9][a-zA-Z0-9_.-]*
function sanitizeNamePart(str) {
  if (!str) return '';
  let s = str.toLowerCase();
  // Strip common "The ___s" pattern: "The Hogans" → "hogan"
  const theMatch = s.match(/^the\s+(.+?)s?$/);
  if (theMatch) s = theMatch[1];
  return s
    .replace(/[^a-z0-9_.-]+/g, '')
    .replace(/^[^a-z0-9]+/, '')
    .slice(0, 40);
}

function containerName(userId) {
  if (nameCache.has(userId)) return nameCache.get(userId);

  // Look up family name + user identifier
  const row = db.prepare(`
    SELECT u.username, u.public_slug, u.name AS user_name, f.name AS family_name
    FROM users u LEFT JOIN families f ON f.id = u.family_id
    WHERE u.id = ?
  `).get(userId);

  let name = `dash-user-${userId}`;
  if (row) {
    const family = sanitizeNamePart(row.family_name);
    const user = sanitizeNamePart(row.username || row.public_slug || row.user_name);
    if (family && user) {
      name = `dash-${family}-${user}`;
    } else if (user) {
      name = `dash-${user}`;
    }
  }

  // Docker container name limit is ~253 chars but keep it short
  name = name.slice(0, 63);
  nameCache.set(userId, name);
  return name;
}

// Two callers must not both try to create the same container — Docker gives the
// loser a 409 and the request fails. This bites hardest in the guest workshop,
// where several kids opening /apps/build at the same moment all race to create
// the one shared container, but it's the same latent race on the kid path
// (a double-mounted tab is enough). Callers for one container share a promise.
const inFlightContainers = new Map(); // name -> Promise<Container>

function dedupeCreate(name, fn) {
  const existing = inFlightContainers.get(name);
  if (existing) return existing;
  const pending = fn().finally(() => inFlightContainers.delete(name));
  inFlightContainers.set(name, pending);
  return pending;
}

// The dedupe above only covers this process. A 409 still means the container
// appeared between our inspect and our create, so adopt it rather than failing.
async function createOrAdopt(name, options) {
  try {
    const container = await docker.createContainer(options);
    await container.start();
    return container;
  } catch (err) {
    if (err.statusCode !== 409) throw err;
    console.log(`[docker] ${name} was created concurrently — adopting it`);
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (!info.State.Running) await container.start();
    return container;
  }
}

export function getOrCreateContainer(userId) {
  return dedupeCreate(containerName(userId), () => buildContainer(userId));
}

async function buildContainer(userId) {
  const name = containerName(userId);

  // Resolve the current image ID so we can detect containers built from an old image.
  // When CLAUDE.md.template or the Dockerfile changes, a `docker build` updates the
  // image tag but existing containers still reference the old image ID. We remove and
  // recreate stale containers automatically — workspace/auth volumes are preserved so
  // no kid data is lost.
  let currentImageId = null;
  try {
    currentImageId = (await docker.getImage(CONTAINER_IMAGE).inspect()).Id;
  } catch { /* image not found yet — will surface at createContainer */ }

  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();

    if (currentImageId && info.Image !== currentImageId) {
      // Image has been updated — remove and fall through to recreate
      console.log(`[docker] Container ${name} is stale (image updated) — recreating`);
      await container.remove({ force: true });
    } else {
      if (!info.State.Running) await container.start();
      return container;
    }
  } catch (err) {
    if (err.statusCode !== 404) throw err;
    // 404 = container doesn't exist yet, fall through to create
  }

  // Migration: remove legacy container if it exists (old naming: claude-kid-{userId})
  // Volumes are keyed per-user so data persists
  try {
    const legacy = docker.getContainer(`claude-kid-${userId}`);
    await legacy.remove({ force: true });
    console.log(`[docker] Removed legacy container claude-kid-${userId}`);
  } catch { /* no legacy container, proceed */ }

  // Create new container
  return createOrAdopt(name, {
    Image: CONTAINER_IMAGE,
    name,
    Env: [
      'TERM=xterm-256color',
      'PATH=/home/coder/.claude/bin:/home/coder/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    ],
    Tty: true,
    OpenStdin: true,
    HostConfig: {
      Memory: 1024 * 1024 * 1024,      // 1 GB
      NanoCpus: 1_000_000_000,          // 1 CPU core
      PidsLimit: 500,
      CapDrop: ['ALL'],                 // Drop all Linux capabilities
      SecurityOpt: ['no-new-privileges'], // Prevent privilege escalation
      ...(CLAUDE_NETWORK ? { NetworkMode: CLAUDE_NETWORK } : {}),
      Binds: [
        `claude-auth-${userId}:/home/coder/.claude`,
        `claude-workspace-${userId}:/home/coder/workspace`,
      ],
    },
  });
}

// Map model setting to Claude model ID
const MODEL_MAP = {
  opus: 'claude-opus-5',
  sonnet: 'claude-sonnet-5',
  haiku: 'claude-haiku-4-5',
};

export async function createExecSession(userId, opts = {}) {
  const container = await getOrCreateContainer(userId);

  const modelMap = MODEL_MAP;
  const modelId = modelMap[opts.model] || modelMap.sonnet;

  // Create a wrapper that forces the parent-selected model, then start bash
  const exec = await container.exec({
    Cmd: ['bash', '-c',
      `printf '#!/bin/bash\\nexec /home/coder/.npm-global/bin/claude --model ${modelId} "$@"\\n' > /tmp/claude && chmod +x /tmp/claude && export PATH=/tmp:$PATH && exec bash`
    ],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    User: 'coder',
    WorkingDir: '/home/coder/workspace',
  });
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  touchActivity(userId);
  return { exec, stream };
}

export async function stopContainer(userId) {
  const name = containerName(userId);
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (info.State.Running) {
      await container.stop();
    }
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  lastActivity.delete(userId);
}

// Force-remove the container so the next `getOrCreateContainer` call
// rebuilds it from the current image. Used to recover from a corrupted
// /home/coder/.npm-global (e.g. a botched self-update that leaves the
// `claude` binary missing). The per-user workspace + .claude volumes
// survive because they're mounted, not part of the container layer.
export async function removeContainer(userId) {
  const name = containerName(userId);
  try {
    const container = docker.getContainer(name);
    await container.remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  lastActivity.delete(userId);
}

export async function getContainerStatus(userId) {
  const name = containerName(userId);
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    return { exists: true, running: info.State.Running };
  } catch (err) {
    if (err.statusCode === 404) return { exists: false, running: false };
    throw err;
  }
}

export function touchActivity(userId) {
  lastActivity.set(userId, Date.now());
}

// Read a file from a kid's workspace container
export async function readContainerFile(userId, filePath) {
  const container = await getOrCreateContainer(userId);
  const exec = await container.exec({
    Cmd: ['cat', `/home/coder/workspace/${filePath}`],
    AttachStdout: true,
    AttachStderr: true,
    Tty: false,
  });
  const stream = await exec.start();

  return new Promise((resolve, reject) => {
    const chunks = [];
    const errChunks = [];

    // Tty:false uses Docker multiplexed streams — demux them
    container.modem.demuxStream(stream, {
      write: (chunk) => chunks.push(chunk),
    }, {
      write: (chunk) => errChunks.push(chunk),
    });

    stream.on('end', async () => {
      const info = await exec.inspect();
      if (info.ExitCode !== 0) {
        reject(new Error('File not found'));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    stream.on('error', reject);
  });
}

// List app directories in a kid's workspace (only if container is running)
export async function listContainerApps(userId) {
  const name = containerName(userId);
  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (!info.State.Running) return [];

    const exec = await container.exec({
      Cmd: ['ls', '-1', '/home/coder/workspace'],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start();

    return new Promise((resolve) => {
      const chunks = [];
      container.modem.demuxStream(stream, { write: (c) => chunks.push(c) }, { write: () => {} });
      stream.on('end', () => {
        const output = Buffer.concat(chunks).toString().trim();
        const dirs = output.split('\n').filter((d) => d && d !== 'CLAUDE.md' && !d.startsWith('.'));
        resolve(dirs);
      });
      stream.on('error', () => resolve([]));
    });
  } catch {
    return [];
  }
}

// Resize a running exec's TTY
export async function resizeExec(exec, cols, rows) {
  try {
    await exec.resize({ w: cols, h: rows });
  } catch { /* ignore resize errors */ }
}

// ─── Guest workshop container ──────────────────────────────────────────────
// One shared container per family, not one per guest. Every guest gets their
// own `docker exec` into it — separate PTY, separate `claude` process, and
// (because Claude Code keys conversation history by working directory) a
// separate session and /resume history. What they share is the filesystem and
// ~/.claude, which is the point: one OAuth login covers everybody.
//
// Two volumes on purpose. Auth is kept apart from the workspace so the
// "delete everything" button can wipe what the kids built without logging the
// parent out and forcing a re-auth before the next workshop.
function guestContainerName(familyId) {
  return `dash-guest-${familyId}`;
}

function guestAuthVolume(familyId) {
  return `claude-guest-auth-${familyId}`;
}

function guestWorkspaceVolume(familyId) {
  return `claude-guest-ws-${familyId}`;
}

function guestActivityKey(familyId) {
  return `guest:${familyId}`;
}

export function getOrCreateGuestContainer(familyId) {
  return dedupeCreate(guestContainerName(familyId), () => buildGuestContainer(familyId));
}

async function buildGuestContainer(familyId) {
  const name = guestContainerName(familyId);

  let currentImageId = null;
  try {
    currentImageId = (await docker.getImage(CONTAINER_IMAGE).inspect()).Id;
  } catch { /* image not found yet — will surface at createContainer */ }

  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();

    if (currentImageId && info.Image !== currentImageId) {
      console.log(`[docker] Guest container ${name} is stale (image updated) — recreating`);
      await container.remove({ force: true });
    } else {
      if (!info.State.Running) await container.start();
      return container;
    }
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  // Sized for a handful of concurrent sessions rather than one kid: each guest
  // runs their own `claude` process, and they tend to spin up dev servers too.
  return createOrAdopt(name, {
    Image: CONTAINER_IMAGE,
    name,
    Env: [
      'TERM=xterm-256color',
      'PATH=/home/coder/.claude/bin:/home/coder/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    ],
    Tty: true,
    OpenStdin: true,
    HostConfig: {
      Memory: 4 * 1024 * 1024 * 1024,   // 4 GB
      NanoCpus: 3_000_000_000,           // 3 CPU cores
      PidsLimit: 1500,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges'],
      ...(CLAUDE_NETWORK ? { NetworkMode: CLAUDE_NETWORK } : {}),
      Binds: [
        `${guestAuthVolume(familyId)}:/home/coder/.claude`,
        `${guestWorkspaceVolume(familyId)}:/home/coder/workspace`,
      ],
    },
  });
}

// A guest's shell, rooted in their own folder. The per-guest wrapper dir keeps
// concurrent sessions from racing each other writing the same /tmp/claude.
// `slug` is already sanitized to [a-z0-9-] by the caller.
export async function createGuestExecSession(familyId, slug) {
  const container = await getOrCreateGuestContainer(familyId);
  const modelId = MODEL_MAP.sonnet;
  const workDir = `/home/coder/workspace/${slug}`;
  const binDir = `/tmp/bin-${slug}`;

  const bootstrap = [
    `mkdir -p ${workDir} ${binDir}`,
    `printf '#!/bin/bash\\nexec /home/coder/.npm-global/bin/claude --model ${modelId} "$@"\\n' > ${binDir}/claude`,
    `chmod +x ${binDir}/claude`,
    `export PATH=${binDir}:$PATH`,
    `cd ${workDir}`,
    'exec bash',
  ].join(' && ');

  const exec = await container.exec({
    Cmd: ['bash', '-c', bootstrap],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    User: 'coder',
    WorkingDir: '/home/coder/workspace',
  });
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  touchGuestActivity(familyId);
  return { exec, stream };
}

// Parent's shell into the guest container, at the workspace root. This is how
// the one-time `claude` OAuth login gets done — the token lands in the auth
// volume and every guest exec inherits it.
export async function createGuestAdminExecSession(familyId) {
  const container = await getOrCreateGuestContainer(familyId);
  const exec = await container.exec({
    Cmd: ['bash'],
    AttachStdin: true,
    AttachStdout: true,
    AttachStderr: true,
    Tty: true,
    User: 'coder',
    WorkingDir: '/home/coder/workspace',
  });
  const stream = await exec.start({ hijack: true, stdin: true, Tty: true });
  touchGuestActivity(familyId);
  return { exec, stream };
}

export async function getGuestContainerStatus(familyId) {
  try {
    const info = await docker.getContainer(guestContainerName(familyId)).inspect();
    return { exists: true, running: info.State.Running };
  } catch (err) {
    if (err.statusCode === 404) return { exists: false, running: false };
    throw err;
  }
}

export async function stopGuestContainer(familyId) {
  try {
    const container = docker.getContainer(guestContainerName(familyId));
    const info = await container.inspect();
    if (info.State.Running) await container.stop();
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  lastActivity.delete(guestActivityKey(familyId));
}

// Wipe everything the guests built. Removes the container (so the workspace
// volume is no longer in use) and then the workspace volume itself. The auth
// volume is deliberately left alone — see the note at the top of this section.
export async function nukeGuestWorkspace(familyId) {
  try {
    await docker.getContainer(guestContainerName(familyId)).remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
  lastActivity.delete(guestActivityKey(familyId));

  try {
    await docker.getVolume(guestWorkspaceVolume(familyId)).remove({ force: true });
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }
}

// List the per-guest folders that actually exist on disk.
export async function listGuestFolders(familyId) {
  try {
    const container = docker.getContainer(guestContainerName(familyId));
    const info = await container.inspect();
    if (!info.State.Running) return [];

    const exec = await container.exec({
      Cmd: ['ls', '-1', '/home/coder/workspace'],
      AttachStdout: true,
      AttachStderr: true,
      Tty: false,
    });
    const stream = await exec.start();

    return new Promise((resolve) => {
      const chunks = [];
      container.modem.demuxStream(stream, { write: (c) => chunks.push(c) }, { write: () => {} });
      stream.on('end', () => {
        const output = Buffer.concat(chunks).toString().trim();
        resolve(output.split('\n').filter((d) => d && d !== 'CLAUDE.md' && !d.startsWith('.')));
      });
      stream.on('error', () => resolve([]));
    });
  } catch {
    return [];
  }
}

export function touchGuestActivity(familyId) {
  lastActivity.set(guestActivityKey(familyId), Date.now());
}

// Stop containers idle for > 30 minutes (runs every 5 min). Guest containers
// share the activity map under a `guest:<familyId>` key.
setInterval(() => {
  const IDLE_TIMEOUT = 30 * 60 * 1000;
  for (const [key, ts] of lastActivity) {
    if (Date.now() - ts <= IDLE_TIMEOUT) continue;
    if (typeof key === 'string' && key.startsWith('guest:')) {
      stopGuestContainer(Number(key.slice(6))).catch(() => {});
    } else {
      stopContainer(key).catch(() => {});
    }
  }
}, 5 * 60 * 1000);
