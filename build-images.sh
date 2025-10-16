#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<USAGE
Usage: $(basename "$0") [-r registry] [-t tag] [-a api_base_url] [--push]

Options:
  -r registry           Registry or namespace prefix for the images (default: ${REGISTRY:-local})
  -t tag                Image tag to apply (default: ${TAG:-latest})
  -a api_base_url       Value for REACT_APP_API_BASE_URL during frontend build
                        (default: ${REACT_APP_API_BASE_URL:-http://backend.mcp-portal.svc.cluster.local:8000})
  --push                Push the images after building
  -h                    Show this help message

Environment variables:
  REGISTRY              Default registry/namespace (overrides -r default)
  TAG                   Default tag (overrides -t default)
  REACT_APP_API_BASE_URL Default frontend API base URL (overrides -a default)
USAGE
}

REGISTRY=${REGISTRY:-local}
TAG=${TAG:-latest}
API_BASE=${REACT_APP_API_BASE_URL:-http://backend.mcp-portal.svc.cluster.local:8000}
PUSH=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -r)
      REGISTRY="$2"
      shift 2
      ;;
    -t)
      TAG="$2"
      shift 2
      ;;
    -a)
      API_BASE="$2"
      shift 2
      ;;
    --push)
      PUSH=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

BACKEND_IMAGE="${REGISTRY}/mcp-portal-backend:${TAG}"
FRONTEND_IMAGE="${REGISTRY}/mcp-portal-frontend:${TAG}"

echo "Building backend image: ${BACKEND_IMAGE}"
docker build -t "$BACKEND_IMAGE" backend

echo "Building frontend image: ${FRONTEND_IMAGE}"
docker build \
  -t "$FRONTEND_IMAGE" \
  -f Dockerfile.frontend .

if [[ "$PUSH" == true ]]; then
  echo "Pushing backend image: ${BACKEND_IMAGE}"
  docker push "$BACKEND_IMAGE"

  echo "Pushing frontend image: ${FRONTEND_IMAGE}"
  docker push "$FRONTEND_IMAGE"
fi

echo "\nDone."

echo "Backend image: ${BACKEND_IMAGE}"
echo "Frontend image: ${FRONTEND_IMAGE}"

if [[ "$PUSH" != true ]]; then
  echo "Use --push to push the images after building."
fi
