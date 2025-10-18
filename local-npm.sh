#!/usr/bin/env bash

# Publish or remove local builds of the Sayna JS and Node SDK packages.

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_REGISTRY="${LOCAL_REGISTRY:-http://localhost:4873}"
PACKAGES=("js-sdk" "node-sdk")

usage() {
  cat <<'EOF'
Usage: ./local-npm.sh <command>

Commands:
  publish     Build and publish js-sdk and node-sdk to the local registry.
  unpublish   Remove the current versions of js-sdk and node-sdk from the local registry.
EOF
}

npm_adduser() {
  # Check if already authenticated
  if npm whoami --registry "$LOCAL_REGISTRY" >/dev/null 2>&1; then
    local current_user
    current_user=$(npm whoami --registry "$LOCAL_REGISTRY" 2>/dev/null)
    echo "Already authenticated as '$current_user' on $LOCAL_REGISTRY"
    return 0
  fi

  echo "Authenticating user to $LOCAL_REGISTRY"
  export NPM_USER=test
  export NPM_PASS=test
  export NPM_EMAIL="test@test.com"
  export NPM_REGISTRY="$LOCAL_REGISTRY"
  npm-cli-adduser
}

ensure_tools() {
  for cmd in npm node; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "Error: '$cmd' is required but not found in PATH." >&2
      exit 1
    fi
  done

  if ! command -v bun >/dev/null 2>&1; then
    echo "Warning: 'bun' is not in PATH. Builds triggered during publish may fail." >&2
  fi

  if ! npm list -g npm-cli-adduser >/dev/null 2>&1; then
    echo "Installing npm-cli-adduser for automated user creation..."
    npm install -g npm-cli-adduser
  fi
}

read_package_field() {
  local pkg_dir=$1
  local field=$2
  (cd "$pkg_dir" && node -p "require('./package.json').$field")
}

publish_package() {
  local pkg_dir=$1
  local name version
  name=$(read_package_field "$pkg_dir" name)
  version=$(read_package_field "$pkg_dir" version)

  # Check if package version already exists in registry
  if npm view "$name@$version" --registry "$LOCAL_REGISTRY" >/dev/null 2>&1; then
    echo "Package $name@$version already exists in $LOCAL_REGISTRY, skipping..."
    return 0
  fi

  echo "Building $name"
  (cd "$pkg_dir" && bun run build)

  echo "Publishing $name@$version to $LOCAL_REGISTRY"
  (cd "$pkg_dir" && npm publish --ignore-scripts --registry "$LOCAL_REGISTRY")

  echo "Clearing npm cache"
  rm -rf ~/.bun/install/cache
  npm cache clean --force
}

unpublish_package() {
  local pkg_dir=$1
  local name version
  name=$(read_package_field "$pkg_dir" name)
  version=$(read_package_field "$pkg_dir" version)
  echo "Unpublishing $name@$version from $LOCAL_REGISTRY"
  if ! (cd "$pkg_dir" && npm unpublish "$name@$version" --force --registry "$LOCAL_REGISTRY"); then
    echo "Warning: Failed to unpublish $name@$version (it may not exist on the registry)." >&2
  fi
}

run_for_all_packages() {
  local action=$1
  for pkg in "${PACKAGES[@]}"; do
    local pkg_dir="$ROOT_DIR/$pkg"
    if [ ! -d "$pkg_dir" ]; then
      echo "Warning: Package directory '$pkg_dir' not found, skipping." >&2
      continue
    fi
    "$action" "$pkg_dir"
  done
}

main() {
  local command=${1:-}
  if [ -z "$command" ]; then
    usage
    exit 1
  fi

  ensure_tools

  case "$command" in
    publish)
      npm_adduser
      run_for_all_packages publish_package
      ;;
    unpublish)
      npm_adduser
      run_for_all_packages unpublish_package
      ;;
    *)
      echo "Error: Unknown command '$command'." >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
