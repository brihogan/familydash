import Docker from 'dockerode';

// In production, DOCKER_HOST points to the socket proxy (tcp://docker-proxy:2375)
// In dev, falls back to the local Docker socket
const dockerOpts = process.env.DOCKER_HOST
  ? (() => { const u = new URL(process.env.DOCKER_HOST); return { host: u.hostname, port: parseInt(u.port, 10) }; })()
  : { socketPath: '/var/run/docker.sock' };
const docker = new Docker(dockerOpts);
const CONTAINER_IMAGE = process.env.CLAUDE_CONTAINER_IMAGE || 'familydash-claude-code:latest';
const CLAUDE_NETWORK = process.env.CLAUDE_NETWORK || null;

// Track last activity per kid for idle cleanup
const lastActivity = new Map();

function containerName(userId) {
  return `claude-kid-${userId}`;
}

export async function getOrCreateContainer(userId) {
  const name = containerName(userId);

  try {
    const container = docker.getContainer(name);
    const info = await container.inspect();
    if (!info.State.Running) {
      await container.start();
    }
    return container;
  } catch (err) {
    if (err.statusCode !== 404) throw err;

    // Create new container
    const container = await docker.createContainer({
      Image: CONTAINER_IMAGE,
      name,
      Env: [
        'TERM=xterm-256color',
        'PATH=/home/coder/.claude/bin:/home/coder/.npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
      ],
      Tty: true,
      OpenStdin: true,
      HostConfig: {
        Memory: 512 * 1024 * 1024,       // 512 MB
        NanoCpus: 1_000_000_000,          // 1 CPU core
        PidsLimit: 100,
        CapDrop: ['ALL'],                 // Drop all Linux capabilities
        SecurityOpt: ['no-new-privileges'], // Prevent privilege escalation
        ...(CLAUDE_NETWORK ? { NetworkMode: CLAUDE_NETWORK } : {}),
        Binds: [
          `claude-auth-${userId}:/home/coder/.claude`,
          `claude-workspace-${userId}:/home/coder/workspace`,
          `claude-npm-${userId}:/home/coder/.npm-global`,
        ],
      },
    });
    await container.start();
    return container;
  }
}

export async function createExecSession(userId) {
  const container = await getOrCreateContainer(userId);
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

// Stop containers idle for > 30 minutes (runs every 5 min)
setInterval(() => {
  const IDLE_TIMEOUT = 30 * 60 * 1000;
  for (const [userId, ts] of lastActivity) {
    if (Date.now() - ts > IDLE_TIMEOUT) {
      stopContainer(userId).catch(() => {});
    }
  }
}, 5 * 60 * 1000);
