// 流式播放: yt-dlp 通过代理直接流式传输音频
const { spawn } = require("child_process");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const PROXY = "http://172.17.0.1:7893";
const YT_DLP = "/tmp/yt-dlp";
const MUSIC_DIR = path.join(__dirname, "music");

const streamingTasks = new Map();

function safeFilename(name) {
  return String(name).replace(/[<>:"/\\|?*]/g, "_").slice(0, 200);
}

async function streamAudio(videoId, title, req, res) {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const safeTitle = safeFilename(title || videoId);
  const m4aPath = path.join(MUSIC_DIR, `${safeTitle}.m4a`);
  const mp3Path = path.join(MUSIC_DIR, `${safeTitle}.mp3`);

  // 先检查本地缓存
  for (const p of [m4aPath, mp3Path]) {
    try {
      await fsp.access(p);
      const stat = await fsp.stat(p);
      if (stat.size > 10240) {
        console.log(`[stream] 缓存命中: ${p}`);
        const ext = path.extname(p).slice(1);
        res.setHeader("Content-Type", ext === "mp3" ? "audio/mpeg" : "audio/mp4");
        res.setHeader("Content-Length", stat.size);
        res.setHeader("Accept-Ranges", "bytes");
        fs.createReadStream(p).pipe(res);
        return;
      }
    } catch (_) {}
  }

  console.log(`[stream] 通过代理流式传输: ${videoUrl}`);
  
  // 直接通过代理流式传输，不用 ffmpeg（ffmpeg 不走代理）
  // yt-dlp 自带 --proxy 支持
  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Transfer-Encoding", "chunked");
  res.setHeader("Cache-Control", "no-cache");

  const child = spawn(YT_DLP, [
    "--proxy", PROXY,
    "-f", "bestaudio[ext=m4a]/bestaudio",
    "-o", "-",
    "--no-part",
    "--no-playlist",
    "--no-warnings",
    videoUrl
  ], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let started = false;
  child.stdout.on("data", (chunk) => {
    if (!started) {
      started = true;
      console.log(`[stream] 开始接收音频数据`);
    }
    res.write(chunk);
  });

  child.stderr.on("data", () => {}); // 静默

  child.on("error", (err) => {
    console.log(`[stream] 错误: ${err.message}`);
    if (!res.writableEnded) res.end();
  });

  child.on("close", (code) => {
    console.log(`[stream] 传输结束, code=${code}, 发送=${started}`);
    if (!res.writableEnded) res.end();
  });

  // 5 秒没有数据则报错
  const timeout = setTimeout(() => {
    if (!started) {
      console.log(`[stream] 超时: 5秒无数据`);
      child.kill();
      if (!res.writableEnded) {
        res.statusCode = 504;
        res.end("Stream timeout");
      }
    }
  }, 5000);

  child.stdout.once("data", () => clearTimeout(timeout));

  // 后台下载完整文件缓存
  downloadForCache(videoUrl, m4aPath, safeTitle);
}

// 后台下载完整文件缓存（后续播放可直接用本地文件）
function downloadForCache(videoUrl, m4aPath, title) {
  if (streamingTasks.has(title)) return;
  streamingTasks.set(title, true);

  console.log(`[cache] 后台缓存: ${title}.m4a`);
  const child = spawn(YT_DLP, [
    "--proxy", PROXY,
    "-f", "bestaudio[ext=m4a]/bestaudio",
    "-o", m4aPath,
    "--no-part",
    "--no-playlist",
    "--no-warnings",
    videoUrl
  ]);

  child.on("close", (code) => {
    console.log(`[cache] 缓存完成: ${title}.m4a (code=${code})`);
    streamingTasks.delete(title);
  });
}

module.exports = { streamAudio };
