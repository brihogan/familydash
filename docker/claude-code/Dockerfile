FROM node:22-slim

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create a non-root user for the kid's workspace
RUN useradd -m -s /bin/bash coder

# Set up workspace and .claude dirs with correct ownership
RUN mkdir -p /home/coder/workspace /home/coder/.claude \
    && chown -R coder:coder /home/coder

USER coder
WORKDIR /home/coder/workspace

ENV TERM=xterm-256color

# Container stays alive; sessions are started via docker exec
CMD ["sleep", "infinity"]
