#!/usr/bin/env bash
# Print AWS infrastructure info for the Convex backend (sb-convex-cloud.fletch.co).
# Run from repo root: ./fletch-convex/scripts/aws-convex-backend-info.sh
# Requires: aws CLI, jq (optional for JSON)

set -e
REGION="${AWS_REGION:-us-east-2}"
TG_NAME="sb-convex-cloud"
ALB_ARN="arn:aws:elasticloadbalancing:us-east-2:548606356171:loadbalancer/app/sandbox-fletch/5854e83ebcf22a56"

echo "=============================================="
echo "1. TARGET GROUP: $TG_NAME"
echo "=============================================="
aws elbv2 describe-target-groups --names "$TG_NAME" --region "$REGION" \
  --query 'TargetGroups[0].{Name:TargetGroupName,Port:Port,Protocol:Protocol,HealthCheckPath:HealthCheckPath,HealthCheckInterval:HealthCheckIntervalSeconds}' \
  --output table

echo ""
echo "=============================================="
echo "2. ALB IDLE TIMEOUT (critical for WebSocket)"
echo "=============================================="
aws elbv2 describe-load-balancer-attributes --load-balancer-arn "$ALB_ARN" --region "$REGION" \
  --query 'Attributes[?Key==`idle_timeout.timeout_seconds`].{Key:Key,Value:Value}' --output table
echo ""
echo "  >>> If Value is 60, increase to 3600 to avoid ALB closing WebSocket after 60s:"
echo "  aws elbv2 modify-load-balancer-attributes --load-balancer-arn \"$ALB_ARN\" --region $REGION --attributes Key=idle_timeout.timeout_seconds,Value=3600"
echo ""

echo "=============================================="
echo "3. LISTENER RULE: host sb-convex-cloud.fletch.co -> $TG_NAME"
echo "=============================================="
LISTENER_ARN=$(aws elbv2 describe-listeners --load-balancer-arn "$ALB_ARN" --region "$REGION" --query 'Listeners[?Port==`443`].ListenerArn' --output text)
aws elbv2 describe-rules --listener-arn "$LISTENER_ARN" --region "$REGION" \
  --query "Rules[?contains(Actions[0].TargetGroupArn, 'sb-convex-cloud')].{Priority:Priority,Condition:Conditions[0].HostHeaderConfig.Values[0],TargetGroup:Actions[0].TargetGroupArn}" \
  --output table

echo ""
echo "=============================================="
echo "4. ECS SERVICE: sb-convex-cloud"
echo "=============================================="
aws ecs describe-services --cluster dev-fletch-cluster --services sb-convex-cloud-service-qtnh04mr --region "$REGION" \
  --query 'services[0].{TaskDef:taskDefinition,DesiredCount:desiredCount,RunningCount:runningCount,ContainerPort:loadBalancers[0].containerPort}' \
  --output table

echo ""
echo "=============================================="
echo "5. ECS TASK SECURITY GROUP (must allow 3210 from ALB)"
echo "=============================================="
TASK_DEF=$(aws ecs describe-services --cluster dev-fletch-cluster --services sb-convex-cloud-service-qtnh04mr --region "$REGION" --query 'services[0].taskDefinition' --output text)
SG_IDS=$(aws ecs describe-services --cluster dev-fletch-cluster --services sb-convex-cloud-service-qtnh04mr --region "$REGION" \
  --query 'services[0].networkConfiguration.awsvpcConfiguration.securityGroups[]' --output text)
echo "  Task security groups: $SG_IDS"
for sg in $SG_IDS; do
  echo "  Inbound rules for $sg:"
  aws ec2 describe-security-groups --group-ids "$sg" --region "$REGION" \
    --query 'SecurityGroups[0].IpPermissions[*].{From:FromPort,To:ToPort,Sources:UserIdGroupPairs[*].GroupId}' --output table 2>/dev/null || true
done

echo ""
echo "=============================================="
echo "6. ALB SECURITY GROUP (must allow 443 from internet)"
echo "=============================================="
ALB_SGS=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --region "$REGION" --query 'LoadBalancers[0].SecurityGroups[]' --output text)
echo "  ALB security groups: $ALB_SGS"
