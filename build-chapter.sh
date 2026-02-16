#!/bin/bash

# Build a single standalone HTML file for a chapter with all slides

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

if [ $# -eq 0 ]; then
    echo -e "${YELLOW}Usage: ./build-chapter.sh <chapter_name>${NC}"
    echo -e "${YELLOW}Example: ./build-chapter.sh 06-app-vector-algebra${NC}"
    exit 1
fi

CHAPTER_NAME=$1

# Check if chapter exists
if [ ! -d "chapters/$CHAPTER_NAME" ]; then
    echo -e "${RED}Error: Chapter '$CHAPTER_NAME' not found in chapters/${NC}"
    exit 1
fi

# Check if chapter has slides
if [ ! -d "chapters/$CHAPTER_NAME/slides" ]; then
    echo -e "${RED}Error: No slides directory found in chapters/$CHAPTER_NAME/${NC}"
    exit 1
fi

echo -e "${BLUE}Building standalone HTML for: ${CHAPTER_NAME}${NC}"

# Run the build script
node build-chapter-unified.js "$CHAPTER_NAME"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo -e "${GREEN}Output: build/${CHAPTER_NAME}_standalone.html${NC}"
else
    echo -e "${RED}❌ Build failed!${NC}"
    exit 1
fi
