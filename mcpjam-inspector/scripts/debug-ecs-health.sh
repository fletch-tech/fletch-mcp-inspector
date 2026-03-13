#!/usr/bin/env bash
# Debug ECS + ALB health check setup for sandbox-fletch-mcp-inspector.
# Run from repo root: ./mcpjam-inspector/scripts/debug-ecs-health.sh
# Requires: aws CLI, jq

set -e
REGION="us-east-2"
TG_ARN="arn:aws:elasticloadbalancing:us-east-2:548606356171:targetgroup/sb-mcp-inspector/92eb08e26722f54e"
TASK_DEF_ARN="arn:aws:ecs:us-east-2:548606356171:task-definition/sandbox-fletch-mcp-inspector:3"
CLUSTER="dev-fletch-cluster"
SERVICE="sandbox-fletch-mcp-inspector-service-j9hm16ib"

echo "=============================================="
echo "1. TARGET GROUP (ALB health check config)"
echo "=============================================="
aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --region "$REGION" \
  --query 'TargetGroups[0].{Port:Port,Protocol:Protocol,HealthCheckPath:HealthCheckPath,HealthCheckProtocol:HealthCheckProtocol,HealthCheckPort:HealthCheckPort,Matcher:Matcher}' \
  --output table 2>/dev/null || aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --region "$REGION"

echo ""
aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --region "$REGION" \
  --query 'TargetGroups[0].{HealthyThreshold:HealthyThreshold,UnhealthyThreshold:UnhealthyThreshold,Interval:HealthCheckIntervalSeconds,Timeout:HealthCheckTimeoutSeconds}' \
  --output table

echo ""
echo "App expects: path=/health, port=6274, protocol=HTTP, matcher 200"
echo ""

echo "=============================================="
echo "2. TASK DEFINITION (container port + env)"
echo "=============================================="
aws ecs describe-task-definition --task-definition "$TASK_DEF_ARN" --region "$REGION" \
  --query 'taskDefinition.containerDefinitions[0].{name:name,portMappings:portMappings,essential:essential,environment:environment}' \
  --output json | jq .

echo ""
echo "Checking required env (server exits if CONVEX_HTTP_URL missing):"
aws ecs describe-task-definition --task-definition "$TASK_DEF_ARN" --region "$REGION" \
  --query 'taskDefinition.containerDefinitions[0].environment[?name==`CONVEX_HTTP_URL` || name==`SERVER_PORT` || name==`DOCKER_CONTAINER`]' \
  --output table

echo ""
echo "=============================================="
echo "3. ECS SERVICE (load balancer + grace period)"
echo "=============================================="
aws ecs describe-services --cluster "$CLUSTER" --services "$SERVICE" --region "$REGION" \
  --query 'services[0].{loadBalancers:loadBalancers,healthCheckGracePeriodSeconds:healthCheckGracePeriodSeconds,desiredCount:desiredCount,runningCount:runningCount}' \
  --output json | jq .

echo ""
echo "=============================================="
echo "4. TARGET HEALTH (current targets in TG)"
echo "=============================================="
aws elbv2 describe-target-health --target-group-arn "$TG_ARN" --region "$REGION" \
  --output table

echo ""
echo "=============================================="
echo "5. RECENT STOPPED TASKS (exit code + reason)"
echo "=============================================="
TASK_ARN=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICE" --desired-status STOPPED --region "$REGION" --max-items 1 --query 'taskArns[0]' --output text)
if [ -n "$TASK_ARN" ] && [ "$TASK_ARN" != "None" ]; then
  aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" --region "$REGION" \
    --query 'tasks[0].{stoppedReason:stoppedReason,stopCode:stopCode,containers:containers[0].{exitCode:exitCode,reason:reason}}' \
    --output json | jq .
else
  echo "No stopped tasks found."
fi

echo ""
echo "=============================================="
echo "SUMMARY"
echo "=============================================="
echo "Fix ELB health if:"
echo "  - HealthCheckPath is not /health  → set to /health"
echo "  - HealthCheckPort is not 6274     → set to 6274 (or match container port)"
echo "  - CONVEX_HTTP_URL not in task def → add env (server will exit without it)"
echo "  - healthCheckGracePeriod too low  → raise to 60–120s so app can start"
echo "  - Container port not 6274        → app listens on 6274 (or SERVER_PORT)"
echo ""
echo "Fix 403 on /api/session-token:"
echo "  - Add to task definition env: MCPJAM_ALLOWED_HOSTS=sandbox-mcp-inspector.fletch.co"
echo "  - Or wildcard: MCPJAM_ALLOWED_HOSTS=*.fletch.co"
echo "  - Then redeploy the service so new tasks pick up the env."
echo ""
echo "Verify Convex backend (server + client):"
echo "  - Server URL: curl https://sandbox-mcp-inspector.fletch.co/api/convex-config"
echo "  - Client URL: open app with ?convex_debug=1 and check browser console for [Convex] Client is using..."
echo "  - Client URL is set at Docker build time (VITE_CONVEX_URL); rebuild with that env to use self-hosted."
echo "=============================================="
