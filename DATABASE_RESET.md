# Automated Database Reset Guide

No more manual deletion! You now have **three ways** to reset the database for fresh testing:

---

## Option 1: CLI Command (Quickest)

**Perfect when:** You're working on the backend and want to reset between server restarts

```bash
npm run reset-db
```

**What it does:**
- Drops all tables (jobs, suggestions, versions)
- Recreates the database schema
- Returns to a clean, empty state
- Takes ~2 seconds

**Example workflow:**
```bash
# Terminal 1: Run the reset
npm run reset-db

# Terminal 2: Start/restart the server
npm run dev

# Test your changes
```

---

## Option 2: UI Button (Most Convenient)

**Perfect when:** You're testing the frontend and want to reset without leaving the app

**How to use:**
1. Open the app in your browser
2. Go to **Job History** page
3. Look for the **"Reset DB"** button in the top-right (gray button with ↻ icon)
4. Click it
5. Confirm in the modal
6. Boom! Database is reset, ready for fresh testing

**What happens:**
- All jobs are cleared from the history
- Search field resets
- Database is recreated with empty schema
- You get an alert when done: "✓ Database reset successfully!"

**Note:** Button only appears in development mode

---

## Option 3: API Endpoint (Programmatic)

**Perfect when:** You're automating tests or integration workflows

```bash
curl -X POST http://localhost:3000/api/dev/reset-database
```

**Response:**
```json
{
  "success": true,
  "message": "Database reset successfully",
  "timestamp": "2026-05-12T15:30:45.123Z"
}
```

**Note:** Only works in development mode. Returns 403 in production.

---

## Development Loop (Recommended Workflow)

Here's the smoothest way to iterate on features:

### 1. **Backend Changes**
```bash
# Terminal 1: Reset DB
npm run reset-db

# Terminal 1: Restart server with auto-reload
npm run server:dev
```

### 2. **Frontend Changes**
```bash
# Terminal 2: Client dev server (if not already running)
npm run client:dev
```

### 3. **Testing**
- Open http://localhost:3001
- Go to Job History
- Use the "Reset DB" button between test cycles
- Or run `npm run reset-db` in a third terminal

### 4. **Full Restart**
If you get weird state issues:
```bash
# Full clean start
npm run reset-db
npm run dev
```

---

## When to Use Each Method

| Method | When to Use | Time to Reset |
|--------|------------|--------------|
| **CLI** | Backend development, server restarts | ~2 seconds |
| **UI Button** | Frontend testing, quick iterations | ~1 second |
| **API** | Automated tests, CI/CD pipelines | ~1 second |

---

## Troubleshooting

### "Reset button not showing"
- Make sure `NODE_ENV` is set to `development`
- Check you're on Job History page
- Button is gray with ↻ icon, top-right corner

### "Reset endpoint returns 403"
- Reset only works in development mode
- Check your `.env` file has `NODE_ENV=development` (if using .env)
- Or start dev server with: `npm run dev` (sets development mode)

### "Database still has old data"
- Try CLI reset: `npm run reset-db`
- Then restart server: `npm run dev`
- If issue persists, manually delete the database file and restart

### "Migration script errors"
- Delete `server/db/alis-form-markup.db` manually
- Run `npm run reset-db`
- Then `npm run dev`

---

## What Gets Reset

When you reset the database, these are deleted:
- ✗ All jobs (upload history)
- ✗ All suggestions (field configurations)
- ✗ All versions (PDF backups)
- ✗ All delete history

What stays:
- ✓ Your code changes
- ✓ Uploaded PDF files (in `/server/jobs/`)
- ✓ Configuration files
- ✓ Environment variables

---

## Benefits

✅ **No more manual file deletion**  
✅ **Faster iteration cycles**  
✅ **One-click testing reset**  
✅ **Consistent development experience**  
✅ **Works in development mode only** (safe)

---

## Tips

1. **Before testing a major feature:** Use the UI button or CLI reset
2. **Between quick tests:** Just reset without restarting server (UI button is fastest)
3. **After code changes:** `npm run reset-db` then `npm run dev` for clean slate
4. **In tests/CI:** Use the API endpoint via curl or HTTP client
5. **If something breaks:** First try reset, then full restart

---

Enjoy faster iterations! 🚀

