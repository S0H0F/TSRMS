#!/bin/bash
# ============================================================
# RailWay SA — AWS Deployment Script
# Usage: chmod +x aws/scripts/deploy.sh && ./aws/scripts/deploy.sh
# ============================================================
set -e

APP_NAME="railway-sa"
ENV_NAME="railway-sa-prod"
REGION="me-south-1"   # Bahrain — closest to Saudi Arabia
S3_BUCKET="railway-sa-deployments"
VERSION=$(date +%Y%m%d-%H%M%S)
ZIP_FILE="railway-sa-$VERSION.zip"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  RailWay SA — AWS Deployment"
echo "  Version: $VERSION"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. Install dependencies
echo "📦 Installing backend dependencies..."
cd backend && npm install --production && cd ..

# 2. Copy frontend files
echo "📁 Copying frontend files..."
cp -r frontend/* backend/public/ 2>/dev/null || true

# 3. Create deployment zip (exclude dev files)
echo "🗜️  Creating deployment package..."
zip -r $ZIP_FILE . \
  --exclude "*.git*" \
  --exclude "node_modules/.cache/*" \
  --exclude "logs/*" \
  --exclude "*.env" \
  --exclude "aws/scripts/*" \
  --exclude "*.test.js"

# 4. Upload to S3
echo "☁️  Uploading to S3..."
aws s3 cp $ZIP_FILE s3://$S3_BUCKET/$ZIP_FILE --region $REGION

# 5. Create new application version
echo "🔖 Creating application version..."
aws elasticbeanstalk create-application-version \
  --application-name $APP_NAME \
  --version-label $VERSION \
  --source-bundle S3Bucket=$S3_BUCKET,S3Key=$ZIP_FILE \
  --region $REGION

# 6. Deploy to environment
echo "🚀 Deploying to $ENV_NAME..."
aws elasticbeanstalk update-environment \
  --environment-name $ENV_NAME \
  --version-label $VERSION \
  --region $REGION

# 7. Wait for deployment
echo "⏳ Waiting for deployment to complete..."
aws elasticbeanstalk wait environment-updated \
  --environment-names $ENV_NAME \
  --region $REGION

# 8. Cleanup local zip
rm -f $ZIP_FILE

echo ""
echo "✅ Deployment complete!"
echo "   URL: http://$ENV_NAME.$REGION.elasticbeanstalk.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
