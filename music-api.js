const NETEASE_HEADERS = {
  Referer: "https://music.163.com/",
  Cookie: "appver=2.0.2",
  "User-Agent": "Mozilla/5.0"
};

async function requestJson(url) {
  const response = await fetch(url, { headers: NETEASE_HEADERS });
  if (!response.ok) {
    throw new Error(`NetEase request failed: ${response.status}`);
  }
  return response.json();
}

function formatSong(song) {
  return {
    id: String(song.id),
    name: song.name || "未知歌曲",
    artist: Array.isArray(song.artists) ? song.artists.map((item) => item.name).join(" / ") : "未知歌手",
    album: song.album?.name || "未知专辑",
    cover: song.album?.picUrl || "",
    duration: song.duration || 0
  };
}

async function searchSongs(keyword) {
  const search = encodeURIComponent(keyword.trim());
  const url = `https://music.163.com/api/search/get/web?s=${search}&type=1&limit=20`;
  const json = await requestJson(url);
  const songs = json.result?.songs || [];
  return songs.map(formatSong);
}

async function getSongUrl(songId) {
  const ids = encodeURIComponent(`[${songId}]`);
  const url = `https://music.163.com/api/song/enhance/player/url?ids=${ids}&br=320000`;
  const json = await requestJson(url);
  const song = Array.isArray(json.data) ? json.data[0] : null;
  if (!song?.url) {
    throw new Error("Song URL not available");
  }
  return {
    id: String(song.id),
    url: song.url,
    br: song.br || 0,
    size: song.size || 0,
    type: song.type || "mp3"
  };
}

module.exports = {
  searchSongs,
  getSongUrl
};
