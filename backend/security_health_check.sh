#!/bin/bash

# ===========================================
# ONECLOUD PRODUCTION SECURITY HEALTH CHECK
# ===========================================
# Comprehensive security validation script
# Run before deploying to production
# ===========================================

set -e

echo "================================================"
echo "🔐 OneCloud Production Security Health Check"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

FAILED=0
WARNINGS=0
PASSED=0

# Function to check a condition
check() {
    local name=$1
    local condition=$2
    
    if [ "$condition" = "true" ]; then
        echo -e "${GREEN}✅ PASS${NC}: $name"
        ((PASSED++))
    elif [ "$condition" = "warn" ]; then
        echo -e "${YELLOW}⚠️  WARN${NC}: $name"
        ((WARNINGS++))
    else
        echo -e "${RED}❌ FAIL${NC}: $name"
        ((FAILED++))
    fi
}

# ===========================================
# 1. ENVIRONMENT VARIABLES CHECK
# ===========================================
echo "📋 1. Environment Variables Security"
echo "-----------------------------------"

# Load .env if exists
if [ -f .env ]; then
    source .env
    check "ENV file exists" "true"
else
    check "ENV file exists" "false"
fi

# NODE_ENV
if [ "$NODE_ENV" = "production" ]; then
    check "NODE_ENV=production" "true"
else
    check "NODE_ENV=production" "false"
fi

# JWT_SECRET length
JWT_LENGTH=${#JWT_SECRET}
if [ $JWT_LENGTH -ge 64 ]; then
    check "JWT_SECRET >= 64 chars" "true"
else
    check "JWT_SECRET >= 64 chars (current: $JWT_LENGTH)" "false"
fi

# Database SSL
if [[ "$DATABASE_URL" == *"sslmode=require"* ]]; then
    check "Database SSL enabled" "true"
else
    check "Database SSL enabled" "warn"
fi

# R2 Credentials
if [ -n "$R2_ACCESS_KEY_ID" ] && [ -n "$R2_SECRET_ACCESS_KEY" ]; then
    check "R2 credentials configured" "true"
else
    check "R2 credentials configured" "false"
fi

# CORS Origins
if [[ "$CORS_ORIGINS" != *"localhost"* ]]; then
    check "CORS no localhost" "true"
else
    check "CORS contains localhost (remove for production!)" "false"
fi

echo ""

# ===========================================
# 2. SSL/TLS CONFIGURATION
# ===========================================
echo "🔒 2. SSL/TLS Configuration"
echo "-----------------------------------"

if [ "$FORCE_HTTPS" = "true" ]; then
    check "HTTPS redirect enabled" "true"
else
    check "HTTPS redirect enabled" "false"
fi

if [ "$TRUST_PROXY" = "true" ]; then
    check "Trust proxy enabled (for Cloudflare/nginx)" "true"
else
    check "Trust proxy setting" "warn"
fi

HSTS_AGE=${HSTS_MAX_AGE:-0}
if [ $HSTS_AGE -ge 31536000 ]; then
    check "HSTS max-age >= 1 year" "true"
else
    check "HSTS max-age >= 1 year (current: $HSTS_AGE)" "warn"
fi

echo ""

# ===========================================
# 3. RATE LIMITING & REDIS
# ===========================================
echo "🚦 3. Rate Limiting Configuration"
echo "-----------------------------------"

if [ "$RATE_LIMIT_ENABLED" = "true" ]; then
    check "Rate limiting enabled" "true"
    
    if [ -n "$REDIS_URL" ]; then
        check "Redis URL configured" "true"
        
        # Test Redis connection
        if command -v redis-cli &> /dev/null; then
            if redis-cli -u "$REDIS_URL" ping &> /dev/null; then
                check "Redis connection successful" "true"
            else
                check "Redis connection failed" "false"
            fi
        else
            check "Redis connection (redis-cli not installed)" "warn"
        fi
    else
        check "Redis URL configured (required for multi-instance)" "warn"
    fi
else
    check "Rate limiting enabled" "false"
fi

echo ""

# ===========================================
# 4. ADMIN SECURITY
# ===========================================
echo "👤 4. Admin Security"
echo "-----------------------------------"

if [ -n "$ADMIN_IP_WHITELIST" ]; then
    check "Admin IP whitelist configured" "true"
else
    check "Admin IP whitelist (recommended for production)" "warn"
fi

if [ "$ADMIN_2FA_REQUIRED" = "true" ]; then
    check "Admin 2FA required" "true"
else
    check "Admin 2FA required" "warn"
fi

echo ""

# ===========================================
# 5. CONTENT SECURITY POLICY
# ===========================================
echo "🛡️  5. Content Security Policy"
echo "-----------------------------------"

if [ "$CSP_ENABLED" = "true" ]; then
    check "CSP enabled" "true"
else
    check "CSP enabled (recommended)" "warn"
fi

if [ -n "$CSP_REPORT_URI" ]; then
    check "CSP report URI configured" "true"
else
    check "CSP report URI (optional)" "warn"
fi

echo ""

# ===========================================
# 6. COOKIE SECURITY
# ===========================================
echo "🍪 6. Cookie Security"
echo "-----------------------------------"

if [ "$SECURE_COOKIES" = "true" ]; then
    check "Secure cookies enabled" "true"
else
    check "Secure cookies enabled (REQUIRED for HTTPS)" "false"
fi

if [ -n "$COOKIE_SECRET" ] && [ "$COOKIE_SECRET" != "CHANGE_THIS_TO_A_SECURE_RANDOM_STRING" ]; then
    check "Cookie secret configured" "true"
else
    check "Cookie secret configured" "false"
fi

if [ "$COOKIE_SAMESITE" = "lax" ] || [ "$COOKIE_SAMESITE" = "strict" ]; then
    check "Cookie SameSite policy" "true"
else
    check "Cookie SameSite policy" "warn"
fi

echo ""

# ===========================================
# 7. DEBUG & DEVELOPMENT FLAGS
# ===========================================
echo "🐛 7. Debug & Development Settings"
echo "-----------------------------------"

if [ "$DEBUG_MODE" = "false" ] || [ -z "$DEBUG_MODE" ]; then
    check "Debug mode disabled" "true"
else
    check "Debug mode disabled (CRITICAL!)" "false"
fi

if [ "$SKIP_EMAIL_VERIFICATION" = "false" ] || [ -z "$SKIP_EMAIL_VERIFICATION" ]; then
    check "Email verification enabled" "true"
else
    check "Email verification enabled" "false"
fi

if [ "$ALLOW_HTTP" = "false" ] || [ -z "$ALLOW_HTTP" ]; then
    check "HTTP disallowed" "true"
else
    check "HTTP disallowed (HTTPS only)" "false"
fi

echo ""

# ===========================================
# 8. MONITORING & LOGGING
# ===========================================
echo "📊 8. Monitoring & Logging"
echo "-----------------------------------"

if [ "$AUDIT_LOG_ENABLED" = "true" ]; then
    check "Audit logging enabled" "true"
else
    check "Audit logging enabled (recommended)" "warn"
fi

if [ -n "$SENTRY_DSN" ]; then
    check "Sentry error tracking configured" "true"
else
    check "Sentry error tracking (recommended)" "warn"
fi

LOG_LEVEL=${LOG_LEVEL:-"info"}
if [ "$LOG_LEVEL" = "info" ] || [ "$LOG_LEVEL" = "warn" ] || [ "$LOG_LEVEL" = "error" ]; then
    check "Log level appropriate ($LOG_LEVEL)" "true"
else
    check "Log level (debug not recommended for production)" "warn"
fi

echo ""

# ===========================================
# 9. FILE UPLOAD SECURITY
# ===========================================
echo "📁 9. File Upload Security"
echo "-----------------------------------"

MAX_SIZE=${MAX_FILE_SIZE_BYTES:-0}
if [ $MAX_SIZE -gt 0 ] && [ $MAX_SIZE -le 26214400 ]; then
    check "Max file size configured (${MAX_SIZE} bytes)" "true"
else
    check "Max file size configured" "warn"
fi

MAX_STORAGE=${MAX_STORAGE_PER_USER:-0}
if [ $MAX_STORAGE -gt 0 ]; then
    check "Storage quota configured (${MAX_STORAGE} bytes)" "true"
else
    check "Storage quota configured" "warn"
fi

echo ""

# ===========================================
# 10. TYPESCRIPT & BUILD CHECK
# ===========================================
echo "🔨 10. Build & Type Safety"
echo "-----------------------------------"

# TypeScript compilation
if npx tsc --noEmit 2>&1 | grep -q "error"; then
    check "TypeScript compilation" "false"
else
    check "TypeScript compilation" "true"
fi

# Prisma schema validation
if npx prisma validate &> /dev/null; then
    check "Prisma schema valid" "true"
else
    check "Prisma schema valid" "false"
fi

# Check for pending migrations
MIGRATION_STATUS=$(npx prisma migrate status 2>&1 || echo "error")
if echo "$MIGRATION_STATUS" | grep -q "Database schema is up to date"; then
    check "Database migrations up to date" "true"
else
    check "Database migrations (check with: npx prisma migrate status)" "warn"
fi

echo ""

# ===========================================
# SUMMARY
# ===========================================
echo "================================================"
echo "📊 SECURITY HEALTH CHECK SUMMARY"
echo "================================================"
echo -e "${GREEN}✅ Passed: $PASSED${NC}"
echo -e "${YELLOW}⚠️  Warnings: $WARNINGS${NC}"
echo -e "${RED}❌ Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}🎉 All checks passed! Production ready.${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  Some warnings found. Review before production deployment.${NC}"
        exit 0
    fi
else
    echo -e "${RED}🚨 CRITICAL FAILURES DETECTED!${NC}"
    echo -e "${RED}Cannot deploy to production with $FAILED critical issues.${NC}"
    echo ""
    echo "Fix all FAIL items before deploying to production."
    exit 1
fi
