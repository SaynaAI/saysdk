#!/bin/bash
set -e


source .venv/bin/activate


# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
    echo "Usage: ./publish.sh [command]"
    echo ""
    echo "Commands:"
    echo "  patch    - Bump patch version (0.0.1 → 0.0.2)"
    echo "  minor    - Bump minor version (0.0.1 → 0.1.0)"
    echo "  major    - Bump major version (0.0.1 → 1.0.0)"
    echo "  upload   - Build and upload package to PyPI"
    echo ""
}

check_tbump() {
    if ! command -v tbump &> /dev/null; then
        echo -e "${RED}❌ Error: tbump is not installed${NC}"
        echo "Install it with: pip install tbump"
        exit 1
    fi
}

check_build_tools() {
    if ! command -v python &> /dev/null && ! command -v python3 &> /dev/null; then
        echo -e "${RED}❌ Error: Python is not installed${NC}"
        exit 1
    fi
    
    # Check for build and twine by trying to import them
    if ! python3 -c "import build" &> /dev/null; then
        echo -e "${RED}❌ Error: build module is not installed${NC}"
        echo "Install it with: pip install build"
        exit 1
    fi
    
    if ! python3 -c "import twine" &> /dev/null; then
        echo -e "${RED}❌ Error: twine is not installed${NC}"
        echo "Install it with: pip install twine"
        exit 1
    fi
}

bump_version() {
    local bump_type=$1
    check_tbump
    
    # Read current version from tbump.toml
    local current_version=$(grep '^current = ' tbump.toml | cut -d'"' -f2)
    if [ -z "$current_version" ]; then
        echo -e "${RED}❌ Error: Could not read current version from tbump.toml${NC}"
        exit 1
    fi
    
    # Parse version components
    IFS='.' read -r major minor patch <<< "$current_version"
    
    # Calculate new version based on bump type
    case "$bump_type" in
        patch)
            patch=$((patch + 1))
            ;;
        minor)
            minor=$((minor + 1))
            patch=0
            ;;
        major)
            major=$((major + 1))
            minor=0
            patch=0
            ;;
        *)
            echo -e "${RED}❌ Error: Invalid bump type '$bump_type'${NC}"
            exit 1
            ;;
    esac
    
    local new_version="$major.$minor.$patch"
    
    echo -e "${YELLOW}📝 Bumping $bump_type version from $current_version to $new_version...${NC}"
    tbump "$new_version" --non-interactive --no-tag
    echo -e "${GREEN}✅ Version bumped successfully!${NC}"
}

upload_package() {
    check_build_tools
    
    echo -e "${YELLOW}🔨 Cleaning previous builds...${NC}"
    rm -rf dist/ build/ src/*.egg-info/
    
    echo -e "${YELLOW}🔨 Building package...${NC}"
    python3 -m build
    
    echo -e "${YELLOW}✓ Checking package...${NC}"
    twine check dist/*
    
    echo -e "${GREEN}✅ Package built successfully!${NC}"
    echo ""
    echo -e "${YELLOW}📦 Uploading to PyPI...${NC}"
    echo -e "${YELLOW}ℹ️  You will be prompted for PyPI credentials if not logged in${NC}"
    echo ""
    
    # Upload - twine will handle authentication prompts
    twine upload dist/*
    
    if [ $? -eq 0 ]; then
        echo ""
        echo -e "${GREEN}✅ Successfully published to PyPI!${NC}"
        
        # Get version from pyproject.toml
        VERSION=$(grep 'version = ' pyproject.toml | head -1 | cut -d'"' -f2)
        echo -e "${GREEN}🎉 Package version $VERSION is now live!${NC}"
        echo "View at: https://pypi.org/project/sayna-client/$VERSION/"
    else
        echo -e "${RED}❌ Upload failed${NC}"
        exit 1
    fi
}

# Main script
case "$1" in
    patch|minor|major)
        bump_version "$1"
        ;;
    upload)
        upload_package
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}❌ Error: Invalid command '$1'${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac

