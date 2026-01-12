#!/bin/bash
set -e

echo "Building React application..."
npm run build

echo "Building and starting Docker containers..."
docker compose up --build -d

echo "Application is running!"
echo "Access the app at: http://localhost:8080"
echo ""
echo "To view logs:"
echo "   docker compose logs -f"
echo ""
echo "To stop:"
echo "   docker compose down"
