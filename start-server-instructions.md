# TeachFlow Server Setup Instructions

## Quick Start

The upload interface is encountering API connection issues because the server isn't running. Here's how to fix it:

### 1. Create Environment File
Copy the example environment file:
```bash
cd /Users/aaravj/GitHub/TeachFlow
cp .env.example .env
```

### 2. Configure Environment Variables
Edit the `.env` file with your actual values:
```bash
# Required for basic functionality
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb+srv://your-username:your-password@your-cluster.mongodb.net/checkmate
JWT_SECRET=your-super-secret-jwt-key-here

# Optional for full AI functionality
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Start the Server
```bash
npm run dev
```

The server should start on http://localhost:3000 and the upload interface should work properly.

## Current Issues Fixed

✅ **File upload not opening file explorer** - Fixed JavaScript event binding
✅ **Dropdown appearing below elements** - Fixed z-index and positioning
✅ **API connection errors** - Added better error handling with retry functionality

## What to Expect

Once the server is running:
- The dropdowns should load student and class options
- File upload should open the file picker when clicked
- The entire upload workflow should function properly

## Troubleshooting

If you still see "Failed to load options":
1. Check that the server is running on port 3000
2. Verify the MongoDB connection string in .env
3. Check browser console for detailed error messages
4. Use the "Retry" button in the dropdown error message