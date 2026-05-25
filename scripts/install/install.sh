#!/usr/bin/env sh
# Continuum CLI installer.
#
# Usage:
#   curl -fsSL https://get.getcontinuum.dev/install.sh | sh
#
# Downloads the right continuum binary for your OS/arch from GitHub Releases,
# drops it in ~/.continuum/bin/, and adds that dir to your PATH (zsh/bash/fish).
# Idempotent: re-running upgrades to the latest release.

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

# --- Download ---------------------------------------------------------------

mkdir -p "$INSTALL_DIR"
DEST="${INSTALL_DIR}/continuum${EXT}"

printf "Downloading %s … " "$BINARY"
if ! curl -fsSL "$URL" -o "$DEST.tmp"; then
  echo "failed."
  echo "Could not download $URL — does that release/asset exist?" >&2
  rm -f "$DEST.tmp"
  exit 1
fi
chmod +x "$DEST.tmp"
mv "$DEST.tmp" "$DEST"
echo "done."

# --- Wire up PATH -----------------------------------------------------------

needs_path_line() {
  # Look for our exact line, robust to shell rc whitespace.
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

cat <<EOF

Continuum CLI installed: $DEST ($TAG)

Next:
  - Open a new terminal (so PATH picks up), or run:  export PATH="\$PATH:$INSTALL_DIR"
  - Then:                                            continuum connect

EOF
