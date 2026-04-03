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

# Default guardrails — Claude Code reads this automatically
RUN echo '# Instructions\n\
You are helping a kid learn to code. Keep projects SIMPLE and small.\n\
Build things in small steps — one file at a time, under 100 lines each.\n\
If asked to build something very complex (like Minecraft, a full game engine, etc.),\n\
suggest a simpler version first and build incrementally.\n\
Never generate more than 3 files in a single response.\n\
Always use simple HTML/CSS/JS unless the kid specifically asks for something else.' > /home/coder/workspace/CLAUDE.md

ENV TERM=xterm-256color

# Container stays alive; sessions are started via docker exec
CMD ["sleep", "infinity"]
