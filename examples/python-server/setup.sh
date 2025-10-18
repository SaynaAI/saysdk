#!/bin/bash

# Setup script for Sayna FastAPI Example Server
# This script creates a virtual environment and installs dependencies

set -e  # Exit on error

echo "=================================================="
echo "Sayna FastAPI Example - Setup"
echo "=================================================="
echo ""

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed"
    echo "Please install Python 3.9 or higher"
    exit 1
fi

# Check Python version
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "✓ Found Python $PYTHON_VERSION"

# Check if we're in the right directory
if [ ! -f "pyproject.toml" ]; then
    echo "❌ Error: pyproject.toml not found"
    echo "Please run this script from the python-server directory"
    exit 1
fi

# Ask user for installation method
echo ""
echo "Choose installation method:"
echo "1) pip (traditional)"
echo "2) uv (faster, recommended)"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "Installing with pip..."

        # Create virtual environment
        echo "Creating virtual environment..."
        python3 -m venv .venv

        # Activate virtual environment
        source .venv/bin/activate

        # Upgrade pip
        echo "Upgrading pip..."
        pip install --upgrade pip

        # Install dependencies
        echo "Installing dependencies..."
        pip install -e .

        # Install dev dependencies
        read -p "Install dev dependencies (ruff, mypy)? (y/n): " install_dev
        if [ "$install_dev" = "y" ]; then
            pip install -e ".[dev]"
        fi
        ;;

    2)
        echo ""
        echo "Installing with uv..."

        # Check if uv is installed
        if ! command -v uv &> /dev/null; then
            echo "uv is not installed. Installing..."
            pip install uv
        fi

        # Create virtual environment
        echo "Creating virtual environment..."
        uv venv

        # Activate virtual environment
        source .venv/bin/activate

        # Install dependencies
        echo "Installing dependencies..."
        uv pip install -e .

        # Install dev dependencies
        read -p "Install dev dependencies (ruff, mypy)? (y/n): " install_dev
        if [ "$install_dev" = "y" ]; then
            uv pip install -e ".[dev]"
        fi
        ;;

    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "=================================================="
echo "✓ Setup Complete!"
echo "=================================================="
echo ""
echo "To activate the virtual environment, run:"
echo "  source .venv/bin/activate"
echo ""
echo "To start the server, run:"
echo "  uvicorn src.server:app --reload"
echo ""
echo "Or simply:"
echo "  python -m src.server"
echo ""
echo "The server will be available at http://localhost:8000"
echo ""
echo "To deactivate the virtual environment later, run:"
echo "  deactivate"
echo ""
