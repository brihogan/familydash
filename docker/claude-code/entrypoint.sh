#!/bin/bash
# Restore .claude.json from backup if missing (backup is persisted in the .claude volume)
if [ ! -f /home/coder/.claude.json ] && [ -d /home/coder/.claude/backups ]; then
  BACKUP=$(ls -t /home/coder/.claude/backups/.claude.json.backup.* 2>/dev/null | head -1)
  if [ -n "$BACKUP" ]; then
    cp "$BACKUP" /home/coder/.claude.json
  fi
fi

# Always update CLAUDE.md from the image template (so rule changes propagate)
cp /home/coder/.claude-md-template /home/coder/workspace/CLAUDE.md

# Watchdog: restore CLAUDE.md every 60 seconds in case it's edited or deleted
(while true; do
  sleep 60
  cp /home/coder/.claude-md-template /home/coder/workspace/CLAUDE.md
done) &

exec "$@"
