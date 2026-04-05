FROM node:22-slim

# Create a non-root user for the kid's workspace
RUN useradd -m -s /bin/bash coder

# Set up workspace and .claude dirs with correct ownership
RUN mkdir -p /home/coder/workspace /home/coder/.claude \
    && chown -R coder:coder /home/coder

USER coder

# Install Claude Code under coder's own npm prefix so auto-update works
RUN npm config set prefix /home/coder/.npm-global
ENV PATH="/home/coder/.npm-global/bin:$PATH"
RUN npm install -g @anthropic-ai/claude-code

# Suppress native installer nag
ENV CLAUDE_CODE_DISABLE_NATIVE_INSTALLER_CHECK=1

WORKDIR /home/coder/workspace

# Default guardrails — stored as template, copied to workspace on startup
COPY --chown=coder:coder CLAUDE.md.template /home/coder/.claude-md-template

# Entrypoint restores .claude.json from backup if missing
COPY --chown=coder:coder entrypoint.sh /home/coder/entrypoint.sh
RUN chmod +x /home/coder/entrypoint.sh

ENV TERM=xterm-256color

ENTRYPOINT ["/home/coder/entrypoint.sh"]
CMD ["sleep", "infinity"]
