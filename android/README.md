# 夜航音乐 Android App

Android WebView 包装的夜航音乐播放器。

## 构建方式

### 方式一：Android Studio（推荐）
1. 用 Android Studio 打开 `android/` 目录
2. 等待 Gradle 同步完成
3. Build → Build Bundle(s) / APK(s) → Build APK(s)
4. APK 生成在 `app/build/outputs/apk/debug/`

### 方式二：命令行（需安装 JDK 17+ 和 Android SDK）
```bash
cd android
export ANDROID_HOME=/path/to/sdk
./gradlew assembleRelease
```

### 方式三：GitHub Actions（自动构建）
代码推送到 GitHub 后，Actions 自动构建 APK。

## 配置
编辑 `app/src/main/java/com/nightmusic/player/MainActivity.java` 中的 `HOME_URL` 可修改首页地址。
v1.1 - UI大改版: 离线曲库+播放模式
