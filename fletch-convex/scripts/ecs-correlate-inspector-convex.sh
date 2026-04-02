#!/usr/bin/env bash
# Correlate ECS health / restarts across MCP Inspector and Convex (site + cloud).
# Run when you suspect Inspector traffic is knocking Convex over — compare timelines.
#
# Usage:
#   AWS_PROFILE=your-profile ./fletch-convex/scripts/ecs-correlate-inspector-convex.sh
# Optional:
#   SINCE_MINUTES=90 ./fletch-convex/scripts/ecs-correlate-inspector-convex.sh
#
# Requires: aws CLI, jq
set -euo pipefail

REGION="${AWS_REGION:-us-east-2}"
CLUSTER="${ECS_CLUSTER:-dev-fletch-cluster}"
SINCE_MINUTES="${SINCE_MINUTES:-120}"

# From your ARNs (service name = last path segment)
INSPECTOR_SERVICE="${INSPECTOR_SERVICE:-sandbox-fletch-mcp-inspector-service-j9hm16ib}"
CONVEX_SITE_SERVICE="${CONVEX_SITE_SERVICE:-sb-convex-site-service-8g17s9uu}"
CONVEX_CLOUD_SERVICE="${CONVEX_CLOUD_SERVICE:-sb-convex-cloud-service-qtnh04mr}"

SERVICES=(
  "$INSPECTOR_SERVICE"
  "$CONVEX_SITE_SERVICE"
  "$CONVEX_CLOUD_SERVICE"
)

echo "=============================================="
echo "ECS correlation (region=$REGION cluster=$CLUSTER)"
echo "Window: last ~${SINCE_MINUTES}m (approx, for stopped-task listing)"
echo "=============================================="
echo ""
echo "Traffic split (MCP Inspector + Convex):"
echo "  - Browser  -> VITE_CONVEX_URL (sync/WebSocket)  -> typically CLOUD service"
echo "  - Inspector Node -> CONVEX_HTTP_URL + /web/authorize, /stream -> typically SITE service"
echo "  If CONVEX_HTTP_URL points at cloud host + /http, site may share cloud tasks — still"
echo "  check both ECS services and ALB target health for each hostname."
echo ""

for svc in "${SERVICES[@]}"; do
  echo "----------------------------------------------"
  echo "SERVICE: $svc"
  echo "----------------------------------------------"
  aws ecs describe-services --cluster "$CLUSTER" --services "$svc" --region "$REGION" \
    --query 'services[0].{
      status:status,
      desired:desiredCount,
      running:runningCount,
      pending:pendingCount,
      taskDef:taskDefinition
    }' --output table || true

  echo ""
  echo "Recent service events (newest first, up to 8):"
  aws ecs describe-services --cluster "$CLUSTER" --services "$svc" --region "$REGION" \
    --query 'services[0].events[:8].[createdAt,message]' --output text 2>/dev/null | sed 's/^/  /' || true

  echo ""
  echo "Stopped tasks in window (reason + stop code):"
  ARNS=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$svc" --desired-status STOPPED \
    --region "$REGION" --max-results 20 --query 'taskArns[]' --output text 2>/dev/null || true)
  if [[ -z "${ARNS// }" ]]; then
    echo "  (none listed — try increasing SINCE_MINUTES or check stopped tasks in console)"
  else
    for arn in $ARNS; do
      STOPPED=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$arn" --region "$REGION" \
        --query 'tasks[0].{stoppedAt:stoppedAt,reason:stoppedReason,stopCode:stopCode}' --output json 2>/dev/null || echo "{}")
      STOPPED_AT=$(echo "$STOPPED" | jq -r '.stoppedAt // empty')
      if [[ -z "$STOPPED_AT" ]]; then
        continue
      fi
      # Compare ISO timestamps roughly by printing; user eyeballs correlation
      echo "  $STOPPED"
    done | head -20
  fi
  echo ""
done

echo "=============================================="
echo "Log groups (set LOG_GROUP_* if your task defs differ)"
echo "=============================================="
echo "Find log group names:"
echo "  aws ecs describe-task-definition --task-definition <task-def-arn> --region $REGION \\"
echo "    --query 'taskDefinition.containerDefinitions[*].logConfiguration.options.\"awslogs-group\"'"
echo ""
echo "Then tail (example):"
echo "  aws logs tail LOG_GROUP --since ${SINCE_MINUTES}m --region $REGION --follow"
echo ""
echo "What confirms 'Inspector caused Convex to die'?"
echo "  1) SITE or CLOUD tasks stop with OOMKilled / OutOfMemory / SIGKILL shortly after"
echo "     spikes in Inspector ALB 5xx or your own [web/auth] Convex logs."
echo "  2) Health checks fail on SITE target group when authorize/stream load spikes."
echo "  3) If only INSPECTOR restarts, the problem may be upstream (Convex) not the reverse."
echo ""
echo "Quick ALB target health (replace TG name from console):"
echo "  aws elbv2 describe-target-health --target-group-arn <arn> --region $REGION"
