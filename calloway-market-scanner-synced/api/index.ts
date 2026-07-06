// Vercel's file-system routing invokes this file for every request under
// /api/*. It simply hands off to the same Express app used for local
// development — see server.ts, which already exports it with exactly this
// in mind (it skips app.listen() when process.env.VERCEL is set).
import app from "../server";

export default app;
