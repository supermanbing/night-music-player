# 音乐播放器 - 开发规格书

## 概述
一个 Web 音乐播放器，支持搜索、播放、下载中文音乐。用户通过微信浏览器打开即可使用。

## 技术栈
- **后端**: Node.js + Express
- **前端**: 单 HTML 文件 (vanilla JS, 无框架)
- **音频下载**: yt-dlp (通过 Node.js 子进程调用)
- **音乐源**: 网易云音乐 + 备用 QQ 音乐

## 项目结构
```
/opt/data/music-player/
├── package.json
├── server.js              # Express 主服务
├── music-api.js           # 音乐搜索/获取播放链接
├── download-manager.js    # 下载管理 (yt-dlp)
├── playlists.json         # 歌单数据
├── public/
│   └── index.html         # 播放器界面
└── music/                 # 下载的音乐文件
```

## API 接口

### 1. 搜索音乐
```
GET /api/search?q=周杰伦&page=1&source=netease
响应: { songs: [{ id, name, artist, album, cover, duration }] }
```

### 2. 获取播放链接
```
GET /api/play?id=xxx&source=netease
响应: { url: "https://...mp3", name, artist, cover }
```

### 3. 下载音乐
```
POST /api/download
Body: { keyword: "周杰伦 告白气球" }
响应: { task_id, status: "downloading" }
```

### 4. 获取下载状态
```
GET /api/download/status?task_id=xxx
响应: { status: "done"|"downloading"|"failed", file: "/music/xxx.mp3" }
```

### 5. 获取已下载列表
```
GET /api/library
响应: { songs: [{ name, artist, path, size, duration }] }
```

### 6. 歌单管理
```
GET /api/playlists          # 获取所有歌单
POST /api/playlists          # 创建歌单 { name, desc }
POST /api/playlists/:id/songs  # 添加歌曲 { song }
DELETE /api/playlists/:id/songs/:songId  # 删除歌曲
```

## 前端 UI (index.html)

### 布局
- 左侧: 导航 (搜索 / 我的音乐 / 歌单)
- 中间: 内容区
- 底部: 播放栏 (固定在底部)

### 页面
1. **搜索页**: 搜索框 + 搜索结果列表 (歌曲卡片: 封面 + 歌名 + 歌手 + 播放/下载按钮)
2. **我的音乐**: 已下载歌曲列表
3. **歌单**: 展示歌单列表，点击展开详情
4. **播放栏**: 歌曲信息 + 进度条 + 播放/暂停 + 上一首/下一首 + 音量

### 样式要求
- 简洁暗色主题 (深色背景)
- 响应式，适配手机 (微信浏览器)
- 底部播放栏固定
- 封面图圆角显示
- 禁用横向滚动 (适配微信阅读)

## 关键实现细节

### 音乐搜索实现 (music-api.js)
使用网易云音乐的 Web API:
- 搜索: `https://music.163.com/api/search/get/web?csrf_token=&type=1&s=KEYWORD&offset=0&limit=20`
  需要设置请求头 `Referer: https://music.163.com/` 和 `Cookie: appver=2.0.2`
- 获取歌曲 URL: `https://music.163.com/api/song/enhance/player/url?ids=[ID]&br=320000`
  同样需要 Referer 和 Cookie

备用 QQ 音乐 API:
- 搜索: `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=KEYWORD&format=json`
- 播放: `https://u.y.qq.com/cgi-bin/musicu.fcg`

### 下载实现 (download-manager.js)
使用 yt-dlp:
1. 首次启动时自动下载 yt-dlp 到 `/tmp/yt-dlp`
2. 下载命令: `/tmp/yt-dlp -x --audio-format mp3 --audio-quality 0 -o "music/%(title)s.%(ext)s" "ytsearch:keyword"`
3. 用 Node.js child_process.exec 执行
4. 下载完成后更新 playlists.json

### 启动方式
```
cd /opt/data/music-player
npm install
node server.js
```

服务器监听 0.0.0.0:39082 (使用 39082 端口，避免冲突)

## 部署
服务启动在端口 39082，用户通过 `http://服务器IP:39082` 访问
