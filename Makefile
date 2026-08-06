# Manual build & deploy of Fletch MCP Inspector to AWS ECR/ECS.
#
# Defaults target sandbox. Override via env or make VAR=value:
#   export CONVEX_SELF_HOSTED_ADMIN_KEY='convex-self-hosted|…'
#   make release
#   make release ENV=production
#   AWS_PROFILE=vinoth make deploy

ENV ?= sandbox
IMAGE_TAG ?= latest
PLATFORM ?= linux/arm64
AWS_PROFILE ?=
AWS_REGION ?= us-east-2
ECR_REGISTRY ?= 548606356171.dkr.ecr.us-east-2.amazonaws.com

DOCKERFILE ?= mcpjam-inspector/Dockerfile
DOCKER_CONTEXT ?= .

# Hosted ECS builds always run in hosted mode.
VITE_MCPJAM_HOSTED_MODE ?= true

# Required for publish/release — export before make (not committed).
CONVEX_SELF_HOSTED_ADMIN_KEY ?= $(shell printenv CONVEX_SELF_HOSTED_ADMIN_KEY)

ifeq ($(ENV),production)
ECR_REPOSITORY ?= prod-fletch-mcp-inspector
ECS_CLUSTER ?= production-fletch-app
ECS_SERVICE ?= prod-fletch-mcp-inspector-service-121sekvx
CONVEX_CLOUD_ORIGIN ?= https://convex-cloud.fletch.co
CONVEX_SITE_ORIGIN ?= https://convex-site.fletch.co
MAIN_URL ?= https://studio.fletch.co
else ifeq ($(ENV),sandbox)
ECR_REPOSITORY ?= sandbox-fletch-mcp-inspector
ECS_CLUSTER ?= dev-fletch-cluster
ECS_SERVICE ?= sandbox-fletch-mcp-inspector-service-j9hm16ib
CONVEX_CLOUD_ORIGIN ?= https://sb-convex-cloud.fletch.co
CONVEX_SITE_ORIGIN ?= https://sb-convex-site.fletch.co
MAIN_URL ?= https://sandbox-studio.fletch.co
else
$(error ENV must be sandbox or production (got "$(ENV)"))
endif

VITE_MAIN_URL ?= $(MAIN_URL)
# Client WebSocket (cloud) + HTTP actions (site). Overridable per release.
VITE_CONVEX_URL ?= $(CONVEX_CLOUD_ORIGIN)
VITE_CONVEX_SITE_URL ?= $(CONVEX_SITE_ORIGIN)
# Server Convex URLs:
#   CONVEX_URL            — ConvexHttpClient sync/cloud (evals run, mutations)
#   CONVEX_HTTP_URL       — HTTP actions (/stream, /eval-generation, authorize)
#   CONVEX_SELF_HOSTED_URL — self-hosted deploy / admin sync endpoint
CONVEX_URL ?= $(CONVEX_CLOUD_ORIGIN)
CONVEX_HTTP_URL ?= $(CONVEX_SITE_ORIGIN)
CONVEX_SELF_HOSTED_URL ?= $(CONVEX_CLOUD_ORIGIN)

LOCAL_IMAGE ?= fletch-mcp-inspector:$(ENV)
REMOTE_IMAGE := $(ECR_REGISTRY)/$(ECR_REPOSITORY):$(IMAGE_TAG)

AWS := aws
ifneq ($(AWS_PROFILE),)
AWS += --profile $(AWS_PROFILE)
endif

# Baked into the client bundle (build stage) and container ENV (runtime stage).
BUILD_ARGS := \
	--build-arg VITE_MCPJAM_HOSTED_MODE="$(VITE_MCPJAM_HOSTED_MODE)" \
	--build-arg VITE_MAIN_URL="$(VITE_MAIN_URL)" \
	--build-arg VITE_CONVEX_URL="$(VITE_CONVEX_URL)" \
	--build-arg VITE_CONVEX_SITE_URL="$(VITE_CONVEX_SITE_URL)" \
	--build-arg MAIN_URL="$(MAIN_URL)" \
	--build-arg CONVEX_CLOUD_ORIGIN="$(CONVEX_CLOUD_ORIGIN)" \
	--build-arg CONVEX_SITE_ORIGIN="$(CONVEX_SITE_ORIGIN)" \
	--build-arg CONVEX_URL="$(CONVEX_URL)" \
	--build-arg CONVEX_HTTP_URL="$(CONVEX_HTTP_URL)" \
	--build-arg CONVEX_SELF_HOSTED_URL="$(CONVEX_SELF_HOSTED_URL)" \
	--build-arg CONVEX_SELF_HOSTED_ADMIN_KEY="$(CONVEX_SELF_HOSTED_ADMIN_KEY)"
ifneq ($(VITE_MCPJAM_SANDBOX_ORIGIN),)
BUILD_ARGS += --build-arg VITE_MCPJAM_SANDBOX_ORIGIN="$(VITE_MCPJAM_SANDBOX_ORIGIN)"
endif

.PHONY: help print-env validate-tools validate-ecr validate-ecs validate-admin-key \
	login build tag push publish deploy release deploy-sandbox deploy-production

help:
	@echo "Usage:"
	@echo "  export CONVEX_SELF_HOSTED_ADMIN_KEY='convex-self-hosted|…'"
	@echo "  make deploy                 Force a new ECS deployment (ENV=sandbox by default)"
	@echo "  make publish                Build, tag, and push image to ECR"
	@echo "  make release                publish + deploy"
	@echo "  make deploy-sandbox         Shortcut for ENV=sandbox deploy"
	@echo "  make deploy-production      Shortcut for ENV=production deploy"
	@echo ""
	@echo "Examples:"
	@echo "  make release"
	@echo "  make release ENV=production"
	@echo "  make deploy ENV=production"
	@echo "  AWS_PROFILE=vinoth make deploy ENV=production"
	@echo ""
	@echo "Override any variable via env or make VAR=value:"
	@echo "  ENV, AWS_REGION, AWS_PROFILE, ECR_REGISTRY, ECR_REPOSITORY,"
	@echo "  ECS_CLUSTER, ECS_SERVICE, IMAGE_TAG, PLATFORM,"
	@echo "  VITE_MCPJAM_HOSTED_MODE, MAIN_URL, VITE_MAIN_URL,"
	@echo "  CONVEX_CLOUD_ORIGIN, CONVEX_SITE_ORIGIN, CONVEX_URL, CONVEX_HTTP_URL,"
	@echo "  CONVEX_SELF_HOSTED_URL, VITE_CONVEX_URL, VITE_CONVEX_SITE_URL,"
	@echo "  CONVEX_SELF_HOSTED_ADMIN_KEY (export before publish/release)"

print-env: validate-ecr validate-ecs
	@echo "ENV=$(ENV)"
	@echo "PLATFORM=$(PLATFORM)"
	@echo "AWS_REGION=$(AWS_REGION)"
	@echo "AWS_PROFILE=$(AWS_PROFILE)"
	@echo "ECR_REGISTRY=$(ECR_REGISTRY)"
	@echo "ECR_REPOSITORY=$(ECR_REPOSITORY)"
	@echo "LOCAL_IMAGE=$(LOCAL_IMAGE)"
	@echo "REMOTE_IMAGE=$(REMOTE_IMAGE)"
	@echo "ECS_CLUSTER=$(ECS_CLUSTER)"
	@echo "ECS_SERVICE=$(ECS_SERVICE)"
	@echo "DOCKERFILE=$(DOCKERFILE)"
	@echo "DOCKER_CONTEXT=$(DOCKER_CONTEXT)"
	@echo "VITE_MCPJAM_HOSTED_MODE=$(VITE_MCPJAM_HOSTED_MODE)"
	@echo "MAIN_URL=$(MAIN_URL)"
	@echo "VITE_MAIN_URL=$(VITE_MAIN_URL)"
	@echo "CONVEX_CLOUD_ORIGIN=$(CONVEX_CLOUD_ORIGIN)"
	@echo "CONVEX_SITE_ORIGIN=$(CONVEX_SITE_ORIGIN)"
	@echo "CONVEX_URL=$(CONVEX_URL)"
	@echo "CONVEX_HTTP_URL=$(CONVEX_HTTP_URL)"
	@echo "CONVEX_SELF_HOSTED_URL=$(CONVEX_SELF_HOSTED_URL)"
	@echo "VITE_CONVEX_URL=$(VITE_CONVEX_URL)"
	@echo "VITE_CONVEX_SITE_URL=$(VITE_CONVEX_SITE_URL)"
	@if [ -n "$(CONVEX_SELF_HOSTED_ADMIN_KEY)" ]; then \
		echo "CONVEX_SELF_HOSTED_ADMIN_KEY=(set)"; \
	else \
		echo "CONVEX_SELF_HOSTED_ADMIN_KEY=(missing — required for publish/release)"; \
	fi

validate-tools:
	@command -v aws >/dev/null || (echo "aws CLI is required" && exit 1)
	@command -v docker >/dev/null || (echo "docker is required" && exit 1)

validate-ecr:
	@test -n "$(AWS_REGION)" || (echo "AWS_REGION is required" && exit 1)
	@test -n "$(ECR_REGISTRY)" || (echo "ECR_REGISTRY is required" && exit 1)
	@test -n "$(ECR_REPOSITORY)" || (echo "ECR_REPOSITORY is required" && exit 1)

validate-ecs:
	@test -n "$(ECS_CLUSTER)" || (echo "ECS_CLUSTER is required" && exit 1)
	@test -n "$(ECS_SERVICE)" || (echo "ECS_SERVICE is required" && exit 1)

validate-admin-key:
	@test -n "$(CONVEX_SELF_HOSTED_ADMIN_KEY)" || ( \
		echo "CONVEX_SELF_HOSTED_ADMIN_KEY is required for image builds." >&2; \
		echo "Export it first, e.g.:" >&2; \
		echo "  export CONVEX_SELF_HOSTED_ADMIN_KEY='convex-self-hosted|…'" >&2; \
		exit 1)

login: validate-tools validate-ecr
	$(AWS) ecr get-login-password --region "$(AWS_REGION)" | docker login --username AWS --password-stdin "$(ECR_REGISTRY)"

build: validate-tools validate-ecr validate-admin-key
	DOCKER_BUILDKIT=1 docker build --progress=plain --platform "$(PLATFORM)" \
		-f "$(DOCKERFILE)" \
		$(BUILD_ARGS) \
		-t "$(LOCAL_IMAGE)" \
		"$(DOCKER_CONTEXT)"

tag: validate-ecr
	docker tag "$(LOCAL_IMAGE)" "$(REMOTE_IMAGE)"

push: validate-ecr
	docker push "$(REMOTE_IMAGE)"

publish: login build tag push
	@echo "Published $(REMOTE_IMAGE)"

deploy: validate-tools validate-ecs
	@echo "Force-deploying ECS service $(ECS_SERVICE) on cluster $(ECS_CLUSTER) ($(ENV))"
	$(AWS) ecs update-service \
		--region "$(AWS_REGION)" \
		--cluster "$(ECS_CLUSTER)" \
		--service "$(ECS_SERVICE)" \
		--force-new-deployment \
		--query 'service.serviceName' \
		--output text
	$(AWS) ecs wait services-stable \
		--region "$(AWS_REGION)" \
		--cluster "$(ECS_CLUSTER)" \
		--services "$(ECS_SERVICE)"
	@echo "Deployment completed for service $(ECS_SERVICE)."

release: publish deploy
	@echo "Released $(REMOTE_IMAGE) to $(ENV)"

deploy-sandbox:
	@$(MAKE) deploy ENV=sandbox

deploy-production:
	@$(MAKE) deploy ENV=production
