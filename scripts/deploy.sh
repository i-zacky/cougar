#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE:-0}")" && pwd)"
REPOSITORY_ROOT_DIR="$(dirname "${SCRIPT_DIR}")"

source "${SCRIPT_DIR}/$1"

USER_POOL_ARN=$(aws cloudformation describe-stacks --stack-name "${COGNITO_STACK_NAME}" --query "Stacks[].Outputs[?ExportName==\`${COGNITO_STACK_NAME}-user-pool-arn\`].[OutputValue]" --output text)

sam deploy \
  --region "${REGION}" \
  --template "${REPOSITORY_ROOT_DIR}/app/template.yml" \
  --stack-name "${LAMBDA_STACK_NAME}" \
  --s3-bucket "${CF_TEMPLATE_BUCKET}" \
  --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
  --no-fail-on-empty-changeset \
  --tags \
      Env="${ENV}" \
      Project="${PROJ}" \
  --parameter-overrides \
      Project=${PROJ} \
      Env=${ENV} \
      SendGridApiKey=${SENDGRID_API_KEY} \
      UserPoolArn=${USER_POOL_ARN}

echo "Update LambdaConfig for CustomEmailSender."
USER_POOL_ID=$(aws cloudformation describe-stacks --stack-name "${COGNITO_STACK_NAME}" --query "Stacks[].Outputs[?ExportName==\`${COGNITO_STACK_NAME}-user-pool-id\`].[OutputValue]" --output text)
COGNITO_LAMBDA_ARN=$(aws cloudformation describe-stacks --stack-name "${LAMBDA_STACK_NAME}" --query "Stacks[].Outputs[?ExportName==\`${LAMBDA_STACK_NAME}-function-arn\`].[OutputValue]" --output text)
CMK_ARN=$(aws cloudformation describe-stacks --stack-name "${LAMBDA_STACK_NAME}" --query "Stacks[].Outputs[?ExportName==\`${LAMBDA_STACK_NAME}-cmk-arn\`].[OutputValue]" --output text)
aws cognito-idp update-user-pool \
  --user-pool-id "${USER_POOL_ID}" \
  --auto-verified-attributes email \
  --lambda-config "CustomEmailSender={LambdaVersion=V1_0,LambdaArn=${COGNITO_LAMBDA_ARN}},KMSKeyID=${CMK_ARN}"
