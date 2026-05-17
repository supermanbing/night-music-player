const express = require("express");
const cors = require("cors");
const path = require("path");
const fsp = require("fs/promises");
const { startDownload, getTask, listLibrary, searchYoutube } = require("./download-manager");
const { streamAudio } = require("./stream");

const app = express();
const PORT = 39083;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use("/music", express.static(path.join(__dirname, "music")));

app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) {
    return res.status(400).json({ error: "Missing q query parameter" });
  }

  try {
    const songs = await searchYoutube(q);
    return res.json({ songs });
  } catch (error) {
    return res.status(502).json({ error: error.message });
  }
});

app.post("/api/download", async (req, res) => {
  const keyword = String(req.body?.keyword || "").trim();
  const songInfo = req.body?.song || null;
  if (!keyword) {
    return res.status(400).json({ error: "Missing keyword" });
  }

  try {
    const task = await startDownload(keyword, songInfo);
    return res.json({ task_id: task.task_id, status: task.status });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.get("/api/download/status", (req, res) => {
  const taskId = String(req.query.task_id || "").trim();
  if (!taskId) {
    return res.status(400).json({ error: "Missing task_id" });
  }

  const task = getTask(taskId);
  if (!task) {
    return res.status(404).json({ error: "Task not found" });
  }

  return res.json(task);
});

app.get("/api/library", async (_req, res) => {
  try {
    const songs = await listLibrary();
    return res.json({ songs });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.delete("/api/library/:file", async (req, res) => {
  try {
    const fileName = decodeURIComponent(req.params.file);
    const filePath = path.join(__dirname, "music", fileName);
    // 删除文件
    try { await fsp.unlink(filePath); } catch {}
    // 更新 library.json
    const { loadLibraryMeta, saveLibraryMeta } = require("./download-manager");
    const library = await loadLibraryMeta();
    const filtered = library.filter(s => s.file !== fileName);
    await saveLibraryMeta(filtered);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// 流式播放: /api/stream?videoId=xxx&title=xxx
app.get("/api/stream", (req, res) => {
  const videoId = String(req.query.videoId || "").trim();
  const title = String(req.query.title || videoId).trim();
  if (!videoId) {
    return res.status(400).json({ error: "Missing videoId" });
  }
  streamAudio(videoId, title, req, res);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Music player server running on http://0.0.0.0:${PORT}`);
});
