const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");

const YT_DLP_PATH = "/tmp/yt-dlp";
const YT_DLP_URL = "https://ghproxy.net/https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp";
const PROXY = "http://172.17.0.1:7893";
const MUSIC_DIR = path.join(__dirname, "music");

const tasks = new Map();
let ensureBinaryPromise = null;
const LIBRARY_FILE = path.join(__dirname, "library.json");

async function ensureYtDlp() {
  if (ensureBinaryPromise) {
    return ensureBinaryPromise;
  }

  ensureBinaryPromise = (async () => {
    await fsp.mkdir(MUSIC_DIR, { recursive: true });
    try {
      await fsp.access(YT_DLP_PATH, fs.constants.X_OK);
      return YT_DLP_PATH;
    } catch (_) {
      const response = await fetch(YT_DLP_URL, {
        headers: { "User-Agent": "Mozilla/5.0" }
      });
      if (!response.ok) {
        throw new Error(`Failed to download yt-dlp: ${response.status}`);
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      await fsp.writeFile(YT_DLP_PATH, buffer, { mode: 0o755 });
      await fsp.chmod(YT_DLP_PATH, 0o755);
      return YT_DLP_PATH;
    }
  })();

  try {
    return await ensureBinaryPromise;
  } catch (error) {
    ensureBinaryPromise = null;
    throw error;
  }
}

function createTask(keyword) {
  const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  tasks.set(taskId, {
    task_id: taskId,
    keyword,
    status: "downloading",
    created_at: new Date().toISOString(),
    file: null,
    error: null
  });
  return taskId;
}

// 读取/写入曲库
async function loadLibraryMeta() {
  try {
    const data = await fsp.readFile(LIBRARY_FILE, 'utf-8');
    return JSON.parse(data);
  } catch { return []; }
}
async function saveLibraryMeta(songs) {
  await fsp.writeFile(LIBRARY_FILE, JSON.stringify(songs, null, 2), 'utf-8');
}

async function startDownload(keyword, songInfo) {
  const cleaned = String(keyword || "").trim();
  if (!cleaned) {
    throw new Error("keyword is required");
  }

  const binary = await ensureYtDlp();
  const taskId = createTask(cleaned);
  const task = tasks.get(taskId);
  // 保存传入的歌曲信息（下载完成后写入曲库）
  task.songInfo = songInfo || { name: cleaned, artist: '', cover: '', duration: 0 };

  const args = [
    "--proxy", PROXY,
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "0",
    "-o",
    "music/%(title)s.%(ext)s",
    `ytsearch:${cleaned}`
  ];

  const child = spawn(binary, args, {
    cwd: __dirname,
    stdio: ["ignore", "pipe", "pipe"]
  });

  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });

  child.on("error", (error) => {
    task.status = "failed";
    task.error = error.message;
  });

  child.on("close", async (code) => {
    if (code === 0) {
      const match = output.match(/\[ExtractAudio\] Destination:\s+(.+\.mp3)/) || output.match(/\[download\]\s+(.+\.mp3)\s+has already been downloaded/);
      const relativeFile = match ? match[1].replace(/^.*music\//, "music/") : null;
      task.status = "done";
      task.file = relativeFile || null;
      task.error = null;
      // 写入曲库
      if (relativeFile) {
        try {
          const library = await loadLibraryMeta();
          const fileName = relativeFile.replace("music/", "");
          if (!library.some(s => s.file === fileName)) {
            library.unshift({
              id: task.songInfo?.id || Date.now().toString(),
              name: task.songInfo?.name || path.parse(fileName).name,
              artist: task.songInfo?.artist || '',
              cover: task.songInfo?.cover || '',
              duration: task.songInfo?.duration || 0,
              file: fileName,
              path: "/" + relativeFile,
              added: new Date().toISOString()
            });
            await saveLibraryMeta(library);
            console.log(`[library] 添加歌曲: ${fileName}`);
          }
        } catch (e) {
          console.error(`[library] 写入失败:`, e.message);
        }
      }
    } else {
      task.status = "failed";
      task.error = output.trim().split("\n").slice(-3).join(" | ") || `yt-dlp exited with ${code}`;
    }
  });

  return task;
}

function getTask(taskId) {
  return tasks.get(taskId) || null;
}

async function listLibrary() {
  await fsp.mkdir(MUSIC_DIR, { recursive: true });
  const library = await loadLibraryMeta();
  // 验证文件是否存在，过滤掉已删除的，同时补充旧歌曲
  const entries = await fsp.readdir(MUSIC_DIR, { withFileTypes: true });
  const existingFiles = new Set(
    entries.filter(e => e.isFile() && (e.name.endsWith('.mp3') || e.name.endsWith('.m4a'))).map(e => e.name)
  );
  // 过滤掉已删除的
  const valid = library.filter(s => existingFiles.has(s.file));
  // 补全旧歌曲（存在文件但不在library.json中的）
  const knownFiles = new Set(valid.map(s => s.file));
  for (const fileName of existingFiles) {
    if (!knownFiles.has(fileName)) {
      valid.push({
        id: fileName,
        name: path.parse(fileName).name,
        artist: '',
        cover: '',
        duration: 0,
        file: fileName,
        path: `/music/${encodeURIComponent(fileName)}`,
        added: new Date().toISOString()
      });
    }
  }
  if (valid.length !== library.length) {
    await saveLibraryMeta(valid);
  }
  return valid.sort((a, b) => new Date(b.added) - new Date(a.added));
}

async function searchYoutube(keyword) {
  const binary = await ensureYtDlp();
  const cleaned = String(keyword || "").trim();
  if (!cleaned) return [];

  return new Promise((resolve, reject) => {
    const args = [
      "--proxy", PROXY,
      "--dump-json", "--no-playlist",
      "--flat-playlist",
      "--default-search", "ytsearch10",
      cleaned
    ];
    const child = spawn(binary, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (c) => out += c.toString());
    child.stderr.on("data", (c) => err += c.toString());
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        resolve([]);
        return;
      }
      const results = out.trim().split("\n").filter(Boolean).map((line) => {
        try {
          const j = JSON.parse(line);
          return {
            id: j.id,
            name: j.title || "未知",
            artist: j.uploader || "未知",
            duration: j.duration || 0,
            cover: j.thumbnail || "",
            album: j.album || "YouTube"
          };
        } catch { return null; }
      }).filter(Boolean);
      resolve(results);
    });
  });
}

module.exports = {
  startDownload,
  getTask,
  listLibrary,
  searchYoutube,
  loadLibraryMeta,
  saveLibraryMeta
};
