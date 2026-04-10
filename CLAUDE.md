#  Project Instructions

## Start of every session

- Always read `WORK_LOG.md` at the start of each session to understand prior context. 
- Record the session start date and time in the WORK_LOG.md making a new Session header in WORK_LOG (also so that after every task we can be told how long we've been working for - see below).
- When starting or restarting the dev server, always use the Monitor tool (not a background `&` process) so server errors surface as real-time notifications in the chat. Kill any existing server first, then start with:
  ```
  cd /Users/bhogan/SynologyDrive/Code/FamilyDash/server && node --watch --env-file=../.env index.js 2>&1 | grep --line-buffered -E "(error|Error|ERROR|warn|WARN|Restart|restart|\[ws\]|\[mp\]|running on port|Unhandled|uncaught|Cannot|EADDRINUSE)"
  ```
  Use `persistent: true` so it runs for the whole session.

## Deploying kid container changes

When `docker/claude-code/CLAUDE.md.template` or `docker/claude-code/Dockerfile` changes, the
`familydash-claude-code` image must be rebuilt on miniserver for kid terminals to pick up the update:

```bash
# On miniserver, in the repo root:
docker build -t familydash-claude-code:latest docker/claude-code/
```

Existing kid containers are automatically recreated on next terminal open — `getOrCreateContainer`
in `dockerService.js` compares the running container's image ID against the current
`familydash-claude-code:latest` digest and removes stale containers (workspace volumes are
preserved, so no kid data is lost). No manual `docker rm` needed after the rebuild.

## Before every task

Try to give me an estimate of time for how long it'll take you to perform the task. Remind me to touch grass, smell the roses, do some stretches, hang from the pull-up bar, go tidy/clean something, hug my wife, or other similar suggestions since you'll be busy for a few moments anyway.

## After every task

Remind me how long this session has been since it started - do this as a friendly reminder for how long I've been working. Once I get to 1 hour remind me to take a break. If I get to two hours gently tell me I should go live my life and be with my wife and kids since they are the most important.

Update the file `WORK_LOG.md` with:

- Very short summary of what was done (ideally, 1-3 sentence at most)



