#!/usr/bin/env sh
# Continuum CLI installer.
#
# Usage:
#   curl -fsSL https://get.getcontinuum.dev/install.sh | sh
#
# Downloads the right continuum binary for your OS/arch from GitHub Releases,
# verifies its SHA256 against the SHA256SUMS manifest from the same release,
# drops it in ~/.continuum/bin/, and (unless told not to) launches
# `continuum connect` to pair this machine.
#
# Env overrides:
#   CONTINUUM_REPO=org/repo         (default sudomichael/continuum)
#   CONTINUUM_VERSION=v0.1.2        (default: latest)
#   CONTINUUM_INSTALL_DIR=/path     (default: ~/.continuum/bin)
#   CONTINUUM_SKIP_CONNECT=1        Skip the auto-launched `continuum connect`
#   CONTINUUM_SKIP_VERIFY=1         Skip SHA256 verification (NOT recommended)

set -eu

REPO="${CONTINUUM_REPO:-sudomichael/continuum}"
INSTALL_DIR="${CONTINUUM_INSTALL_DIR:-${HOME}/.continuum/bin}"

# --- Detect platform --------------------------------------------------------

uname_os() {
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$os" in
    darwin) echo "darwin" ;;
    linux)  echo "linux" ;;
    msys*|mingw*|cygwin*) echo "windows" ;;
    *) echo "Unsupported OS: $os" >&2; exit 1 ;;
  esac
}

uname_arch() {
  arch="$(uname -m)"
  case "$arch" in
    x86_64|amd64) echo "amd64" ;;
    arm64|aarch64) echo "arm64" ;;
    *) echo "Unsupported architecture: $arch" >&2; exit 1 ;;
  esac
}

OS="$(uname_os)"
ARCH="$(uname_arch)"
EXT=""
if [ "$OS" = "windows" ]; then EXT=".exe"; fi

BINARY="continuum-${OS}-${ARCH}${EXT}"

# --- Resolve latest release tag --------------------------------------------

if [ -n "${CONTINUUM_VERSION:-}" ]; then
  TAG="$CONTINUUM_VERSION"
else
  printf "Resolving latest release… "
  TAG="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep '"tag_name"' \
    | head -1 \
    | sed -E 's/.*"([^"]+)".*/\1/')"
  if [ -z "$TAG" ]; then
    echo "failed."
    echo "Could not resolve latest version. Set CONTINUUM_VERSION=vX.Y.Z and retry." >&2
    exit 1
  fi
  echo "$TAG"
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${BINARY}"
SUMS_URL="https://github.com/${REPO}/releases/download/${TAG}/SHA256SUMS"

# --- Download + verify ------------------------------------------------------

mkdir -p "$INSTALL_DIR"
DEST="${INSTALL_DIR}/continuum${EXT}"
TMP_BIN="${DEST}.tmp"
TMP_SUMS="${INSTALL_DIR}/.SHA256SUMS.tmp"

cleanup() { rm -f "$TMP_BIN" "$TMP_SUMS"; }
trap cleanup EXIT

printf "Downloading %s … " "$BINARY"
if ! curl -fsSL "$URL" -o "$TMP_BIN"; then
  echo "failed."
  echo "Could not download $URL — does that release/asset exist?" >&2
  exit 1
fi
echo "done."

# Verify checksum unless explicitly skipped. The SHA256SUMS manifest is
# published alongside the binaries in the same Release.
if [ -z "${CONTINUUM_SKIP_VERIFY:-}" ]; then
  printf "Verifying SHA256 … "
  if ! curl -fsSL "$SUMS_URL" -o "$TMP_SUMS"; then
    echo "skipped (SHA256SUMS not found — older release without checksums)"
  else
    expected="$(grep " ${BINARY}\$" "$TMP_SUMS" | awk '{print $1}')"
    if [ -z "$expected" ]; then
      echo "FAILED — no entry for ${BINARY} in SHA256SUMS" >&2
      exit 1
    fi
    if command -v sha256sum >/dev/null 2>&1; then
      actual="$(sha256sum "$TMP_BIN" | awk '{print $1}')"
    elif command -v shasum >/dev/null 2>&1; then
      actual="$(shasum -a 256 "$TMP_BIN" | awk '{print $1}')"
    else
      echo "skipped (no sha256sum/shasum tool found)"
      actual="$expected"
    fi
    if [ "$actual" != "$expected" ]; then
      echo "FAILED"
      echo "  expected: $expected" >&2
      echo "  actual:   $actual"   >&2
      echo "Refusing to install a tampered binary." >&2
      exit 1
    fi
    echo "ok."
  fi
fi

chmod +x "$TMP_BIN"
mv "$TMP_BIN" "$DEST"
trap - EXIT
rm -f "$TMP_SUMS"

# --- Wire up PATH -----------------------------------------------------------

needs_path_line() {
  ! grep -qsF "$INSTALL_DIR" "$1" 2>/dev/null
}

add_path_line_posix() {
  rc="$1"
  if [ -f "$rc" ] && needs_path_line "$rc"; then
    {
      echo ""
      echo "# Added by Continuum installer"
      echo "export PATH=\"\$PATH:${INSTALL_DIR}\""
    } >> "$rc"
    echo "Updated $rc"
  fi
}

case "$(basename "${SHELL:-}")" in
  zsh)
    add_path_line_posix "$HOME/.zshrc"
    ;;
  bash)
    add_path_line_posix "$HOME/.bashrc"
    add_path_line_posix "$HOME/.bash_profile"
    ;;
  fish)
    fish_config="$HOME/.config/fish/config.fish"
    if [ -f "$fish_config" ] && needs_path_line "$fish_config"; then
      {
        echo ""
        echo "# Added by Continuum installer"
        echo "set -gx PATH \$PATH ${INSTALL_DIR}"
      } >> "$fish_config"
      echo "Updated $fish_config"
    fi
    ;;
  *)
    add_path_line_posix "$HOME/.profile"
    ;;
esac

# Make sure the binary is callable in THIS shell, so the trailing
# `continuum connect` and any user retries Just Work without restarting.
export PATH="$PATH:${INSTALL_DIR}"

echo ""
echo "✓ Continuum CLI installed: $DEST ($TAG)"
echo ""

# --- Chain into pairing -----------------------------------------------------
#
# When run from `curl | sh` interactively, drop straight into pairing. The
# user just wanted the tool working — making them remember a second command
# is friction. Skip when stdin isn't a TTY (CI / Docker), or when explicitly
# disabled.

if [ -n "${CONTINUUM_SKIP_CONNECT:-}" ]; then
  echo "Skipping \`continuum connect\` (CONTINUUM_SKIP_CONNECT set)."
  echo "Run it manually when you're ready:"
  echo "    continuum connect"
  exit 0
fi

# stdin from `curl | sh` is a pipe, not a TTY — so we re-open /dev/tty for
# the connect step's prompts. If /dev/tty isn't available either (CI), bail
# cleanly with instructions.
if [ ! -r /dev/tty ]; then
  echo "Non-interactive shell — finishing without pairing."
  echo "Run this from your terminal to pair this machine:"
  echo "    continuum connect"
  exit 0
fi

echo "Launching \`continuum connect\` …"
echo ""
exec "$DEST" connect </dev/tty
