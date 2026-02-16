#!/bin/bash

# Build and push chapter to S3
# Usage: ./devops/chapter_build_and_push.sh <chapter_name> [-p|--push-only]

set -e

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
# Get the project root directory (parent of devops)
PROJECT_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

# Change to project root directory
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Load environment variables from .env (we're in project root now)
if [ -f .env ]; then
    echo -e "${BLUE}Loading environment variables from .env...${NC}"
    export $(cat .env | grep -v '^#' | xargs)
else
    echo -e "${YELLOW}Warning: No .env file found in project root. Using environment variables.${NC}"
fi

# Function to display usage
usage() {
    echo "Usage: $0 <chapter_name> [-p|--push-only]"
    echo ""
    echo "Arguments:"
    echo "  chapter_name    Name of the chapter to build and push (e.g., 06-app-vector-algebra)"
    echo ""
    echo "Options:"
    echo "  -p, --push-only Skip build step, only push to S3"
    echo "  -h, --help      Display this help message"
    echo ""
    echo "Example:"
    echo "  $0 06-app-vector-algebra"
    echo "  $0 06-app-vector-algebra --push-only"
    exit 1
}

# Parse arguments
CHAPTER_NAME=""
PUSH_ONLY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--push-only)
            PUSH_ONLY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            if [ -z "$CHAPTER_NAME" ]; then
                CHAPTER_NAME=$1
            else
                echo -e "${RED}Error: Unknown argument '$1'${NC}"
                usage
            fi
            shift
            ;;
    esac
done

# Check if chapter name is provided
if [ -z "$CHAPTER_NAME" ]; then
    echo -e "${RED}Error: Chapter name is required${NC}"
    usage
fi

# Validate AWS credentials
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
    echo -e "${RED}Error: AWS credentials not found${NC}"
    echo -e "${YELLOW}Please ensure AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set in .env file${NC}"
    exit 1
fi

if [ -z "$S3_BUCKET_NAME" ]; then
    echo -e "${RED}Error: S3_BUCKET_NAME not found in .env file${NC}"
    exit 1
fi

# Set S3 prefix (optional)
S3_PREFIX="${S3_PATH_PREFIX:-html/STATE_BOARD_CHAPTERS}"

echo -e "${BLUE}==========================================${NC}"
echo -e "${BLUE}Chapter Build and Push${NC}"
echo -e "${BLUE}==========================================${NC}"
echo -e "Chapter: ${GREEN}$CHAPTER_NAME${NC}"
echo -e "S3 Bucket: ${GREEN}$S3_BUCKET_NAME${NC}"
echo -e "S3 Prefix: ${GREEN}$S3_PREFIX${NC}"
echo -e "${BLUE}==========================================${NC}"

# Check if chapter exists
if [ ! -d "chapters/$CHAPTER_NAME" ]; then
    echo -e "${RED}Error: Chapter 'chapters/$CHAPTER_NAME' not found${NC}"
    exit 1
fi

# Build chapter (unless push-only mode)
if [ "$PUSH_ONLY" = false ]; then
    echo -e "${BLUE}Building chapter: $CHAPTER_NAME${NC}"
    ./build-chapter.sh "$CHAPTER_NAME"

    if [ $? -ne 0 ]; then
        echo -e "${RED}Build failed!${NC}"
        exit 1
    fi
    echo -e "${GREEN}✅ Build successful${NC}"
else
    echo -e "${YELLOW}Skipping build (push-only mode)${NC}"
fi

# Check if build output exists
BUILD_FILE="build/${CHAPTER_NAME}_standalone.html"
if [ ! -f "$BUILD_FILE" ]; then
    echo -e "${RED}Error: Build file not found: $BUILD_FILE${NC}"
    exit 1
fi

# Upload to S3
echo -e "${BLUE}Uploading to S3...${NC}"

# Create temporary directory
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# Copy build file to temp directory
cp "$BUILD_FILE" "$TEMP_DIR/"

# Upload using Node.js script
if [ -d "devops" ]; then
    UPLOAD_SCRIPT="devops/upload-to-s3.js"
else
    UPLOAD_SCRIPT="upload-to-s3.js"
fi

if [ ! -f "$UPLOAD_SCRIPT" ]; then
    echo -e "${RED}Error: Upload script not found: $UPLOAD_SCRIPT${NC}"
    exit 1
fi

# Run upload
node "$UPLOAD_SCRIPT" "$TEMP_DIR" "$S3_BUCKET_NAME" "$S3_PREFIX"

if [ $? -ne 0 ]; then
    echo -e "${RED}Upload failed!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Upload successful${NC}"

# Display URL from chapter-mappings.json
MAPPINGS_FILE="devops/chapter-mappings.json"
if [ -f "$MAPPINGS_FILE" ]; then
    CHAPTER_URL=$(node -p "JSON.parse(require('fs').readFileSync('$MAPPINGS_FILE', 'utf8'))['$CHAPTER_NAME']?.url || ''")
    if [ ! -z "$CHAPTER_URL" ]; then
        echo -e "${BLUE}==========================================${NC}"
        echo -e "${GREEN}Chapter URL:${NC}"
        echo -e "${BLUE}$CHAPTER_URL${NC}"
        echo -e "${BLUE}==========================================${NC}"
    fi
fi

echo -e "${GREEN}✅ All done!${NC}"
