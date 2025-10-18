#!/bin/bash

# Sayna Python SDK - Development Environment Setup Script
# This script helps set up the development environment with either pip or uv

set -e  # Exit on error

echo "🚀 Sayna Python SDK - Development Setup"
echo "========================================"
echo ""

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1 | awk '{print $2}')
echo "✓ Python version: $PYTHON_VERSION"

# Check if we're in the correct directory
if [ ! -f "pyproject.toml" ]; then
    echo "❌ Error: pyproject.toml not found. Please run this script from the python-sdk directory."
    exit 1
fi

# Function to check if python3-venv is available
check_venv_support() {
    if python3 -m venv --help &> /dev/null; then
        return 0
    else
        return 1
    fi
}

# Function to verify venv was created successfully
verify_venv() {
    if [ -f ".venv/bin/activate" ]; then
        return 0
    else
        return 1
    fi
}

echo ""
echo "Choose installation method:"
echo "1) pip (traditional)"
echo "2) uv (modern, faster)"
read -p "Enter your choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "📦 Setting up with pip..."

        # Check if venv module is available
        if ! check_venv_support; then
            echo ""
            echo "❌ Error: python3-venv is not installed on your system."
            echo ""
            echo "To fix this, install python3-venv:"
            echo "  sudo apt install python3.12-venv"
            echo ""
            echo "Or install for your specific Python version:"
            echo "  sudo apt install python3-venv"
            echo ""
            echo "After installing, run this script again."
            exit 1
        fi

        # Create virtual environment
        if [ ! -d ".venv" ]; then
            echo "Creating virtual environment..."
            python3 -m venv .venv

            # Verify venv was created successfully
            if ! verify_venv; then
                echo ""
                echo "❌ Error: Virtual environment creation failed."
                echo ""
                echo "The .venv directory was created but the activation script is missing."
                echo "This usually means python3-venv is not properly installed."
                echo ""
                echo "Please install it with:"
                echo "  sudo apt install python3.12-venv"
                echo ""
                exit 1
            fi

            echo "✓ Virtual environment created successfully"
        else
            echo "Virtual environment already exists."

            # Verify existing venv is valid
            if ! verify_venv; then
                echo ""
                echo "⚠️  Warning: Existing .venv directory is incomplete."
                echo "Removing and recreating..."
                rm -rf .venv
                python3 -m venv .venv

                if ! verify_venv; then
                    echo "❌ Error: Could not create valid virtual environment."
                    echo "Please install python3-venv:"
                    echo "  sudo apt install python3.12-venv"
                    exit 1
                fi
            fi
        fi

        # Activate virtual environment
        echo "Activating virtual environment..."
        source .venv/bin/activate

        # Upgrade pip
        echo "Upgrading pip..."
        pip install --upgrade pip

        # Install package in editable mode with dev dependencies
        echo "Installing package and dependencies..."
        pip install -e ".[dev]"

        echo ""
        echo "✅ Setup complete with pip!"
        echo ""
        echo "To activate the virtual environment in the future, run:"
        echo "  source .venv/bin/activate"
        ;;

    2)
        echo ""
        echo "📦 Setting up with uv (faster)..."

        # Check if uv is installed
        if ! command -v uv &> /dev/null; then
            echo "uv is not installed. Installing uv..."
            pip install uv
        else
            echo "✓ uv is already installed"
        fi

        # Create virtual environment
        if [ ! -d ".venv" ]; then
            echo "Creating virtual environment with uv..."
            uv venv
        else
            echo "Virtual environment already exists."
        fi

        # Activate virtual environment
        echo "Activating virtual environment..."
        source .venv/bin/activate

        # Install package in editable mode with dev dependencies
        echo "Installing package and dependencies with uv..."
        uv pip install -e ".[dev]"

        echo ""
        echo "✅ Setup complete with uv!"
        echo ""
        echo "To activate the virtual environment in the future, run:"
        echo "  source .venv/bin/activate"
        ;;

    *)
        echo "❌ Invalid choice. Please run the script again and choose 1 or 2."
        exit 1
        ;;
esac

echo ""
echo "🎉 Development environment is ready!"
echo ""
echo "Next steps:"
echo "  1. Activate the environment: source .venv/bin/activate"
echo "  2. Run tests: pytest"
echo "  3. Type check: mypy src/sayna_client"
echo "  4. Lint code: ruff check ."
echo "  5. Format code: ruff format ."
echo ""
echo "Happy coding! 🐍"
