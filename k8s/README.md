# Kubernetes Deployment Guide

The manifests in this directory provide a basic Kubernetes deployment for the MCP Portal stack (frontend, backend, and Redis). They mirror the docker-compose setup and are intended as a starting point for production hardening.

## Prerequisites

- A Kubernetes cluster (local or managed) with a default storage class
- `kubectl` installed and configured for the target cluster
- Container images for the frontend and backend pushed to a registry that your cluster can pull from, or loaded into a local cluster such as Kind/Minikube

## Build and publish the images

Use the helper script at the root of the repository to build both images with a single command. Replace `local` with the registry or namespace that matches your environment.

```bash
# Build images with the default Kubernetes-friendly API base URL
./scripts/build-images.sh -r local

# Push them if your cluster cannot load images directly
./scripts/build-images.sh -r local --push
```

If you are using Kind or Minikube you can load the images directly instead of pushing them:

```bash
# Kind example
kind load docker-image "$BACKEND_IMAGE"
kind load docker-image "$FRONTEND_IMAGE"
```

## Update image references (optional)

By default the manifest references `mcp-portal-backend:latest` and `mcp-portal-frontend:latest`. If you published the images under different names, update the `image` fields in `mcp-portal.yaml` accordingly (or use `kustomize edit set image`).

## Create the namespace and secrets

```bash
kubectl apply -f k8s/mcp-portal.yaml --dry-run=client -o yaml | kubectl apply -f -

# Create the OpenAI API secret (replace the placeholder with your actual key)
kubectl create secret generic openai-credentials \
  --from-literal=OPENAI_API_KEY=sk-... \
  --namespace mcp-portal
```

You can optionally add other keys to the same secret if the backend requires additional credentials.

## Deploy

Apply the manifests. This will create the namespace, ConfigMap, Deployments, Services, and PersistentVolumeClaims.

```bash
kubectl apply -f k8s/mcp-portal.yaml
```

## Access the application

- The backend is exposed inside the cluster via the `backend` service on port `8000`.
- The frontend is exposed through a `LoadBalancer` service named `frontend`. On local clusters without load-balancer support, change the service type to `NodePort` or expose it with `kubectl port-forward`:

  ```bash
  kubectl port-forward svc/frontend 3000:80 --namespace mcp-portal
  ```

## Persistent storage notes

- Redis uses a `PersistentVolumeClaim` named `redis-data` for `/data` to retain task/session state across pod restarts.
- The backend uses a `PersistentVolumeClaim` named `backend-logs` mounted at `/app/task_logs` so persisted task logs survive restarts.

Review resource limits, security contexts, and production-specific policies before running in a production cluster.
