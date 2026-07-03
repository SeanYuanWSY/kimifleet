#!/bin/bash
# SPDX-License-Identifier: MIT
# Copyright (c) 2025 SeanYuanWSY
set -euo pipefail

# kimi-swarm-pro uninstaller — removes the kimi-fleet skill
# https://github.com/SeanYuanWSY/kimi-swarm-pro

KIMI_DIR="$HOME/.kimi-code"
AGENTS_DIR="$HOME/.agents/skills"
CONFIG="$KIMI_DIR/config.toml"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*"; }

echo "=== kimi-swarm-pro uninstaller ==="
echo ""

# Check python3 dependency
if ! command -v python3 >/dev/null 2>&1; then
  error "python3 is required to safely edit config.toml but not found in PATH"
  exit 1
fi

# Step 1: Remove symlink
SYMLINK="$KIMI_DIR/skills-curated/kimi-fleet"
if [ -L "$SYMLINK" ]; then
  rm "$SYMLINK"
  info "Removed symlink: $SYMLINK"
elif [ -e "$SYMLINK" ]; then
  error "Refusing to remove non-symlink path: $SYMLINK"
  error "Please remove it manually if you are sure."
  exit 1
else
  warn "Symlink not found: $SYMLINK"
fi

# Step 2: Remove skill directory
SKILL_DIR="$AGENTS_DIR/kimi-fleet"
if [ -L "$SKILL_DIR" ]; then
  # It is a symlink; remove only the link, not the target
  rm "$SKILL_DIR"
  info "Removed symlink: $SKILL_DIR"
elif [ -d "$SKILL_DIR" ] && [ ! -L "$SKILL_DIR" ]; then
  rm -rf "$SKILL_DIR"
  info "Removed skill directory: $SKILL_DIR"
elif [ -e "$SKILL_DIR" ]; then
  error "Refusing to remove non-directory path: $SKILL_DIR"
  exit 1
else
  warn "Skill directory not found: $SKILL_DIR"
fi

# Step 3: Remove hook script
HOOK="$KIMI_DIR/scripts/kimi-fleet-hook.js"
if [ -f "$HOOK" ]; then
  rm "$HOOK"
  info "Removed hook script: $HOOK"
else
  warn "Hook script not found: $HOOK"
fi

# Step 4: Remove hook registration from config.toml
if [ -f "$CONFIG" ]; then
  if grep -q "kimi-fleet-hook" "$CONFIG" 2>/dev/null; then
    # Backup config before mutation
    BACKUP="$CONFIG.kimi-fleet.bak.$(date +%s)"
    cp "$CONFIG" "$BACKUP"
    info "Backed up config.toml → $BACKUP"

    # Use a state-machine Python script to safely remove [[hooks]] blocks
    # that reference kimi-fleet-hook.js, with or without a marker comment
    python3 - "$CONFIG" <<'PYEOF'
import sys, re

config_path = sys.argv[1]
with open(config_path, 'r') as f:
    lines = f.readlines()

# Match the marker comment line that install.sh writes
marker_re = re.compile(r'^#\s*kimi-fleet-hook\s*$', re.IGNORECASE)
hook_start = re.compile(r'^\[\[hooks\]\]\s*(?:#.*)?$')
command_re = re.compile(r'^\s*command\s*=\s*["\'].*kimi-fleet-hook\.js.*["\']\s*$')

out, buf = [], []
in_hook = False
discard = False

for line in lines:
    stripped = line.strip()

    if marker_re.match(stripped):
        # Skip the marker line entirely (it belongs to the kimi-fleet hook)
        continue

    if hook_start.match(stripped):
        # Flush previous hook block if not discarded
        if in_hook and not discard:
            out.extend(buf)
        # Start tracking a new hook block
        buf = [line]
        in_hook = True
        discard = False
        continue

    if in_hook:
        if stripped.startswith('[') and not hook_start.match(stripped):
            # A new section begins — end of current hook block
            if not discard:
                out.extend(buf)
            buf, in_hook = [], False
            out.append(line)
            continue
        buf.append(line)
        if command_re.match(stripped):
            discard = True
        continue

    out.append(line)

if in_hook and not discard:
    out.extend(buf)

content = ''.join(out)
content = re.sub(r'\n{3,}', '\n\n', content)

with open(config_path, 'w') as f:
    f.write(content)
PYEOF
    info "Removed hook registration from config.toml"
  else
    warn "Hook not found in config.toml, skipping"
  fi
else
  warn "config.toml not found, skipping"
fi

echo ""
echo "=== Uninstall complete! ==="
echo ""
echo "kimi-fleet has been fully removed."
echo "Start a new Kimi Code session to confirm."
echo ""
