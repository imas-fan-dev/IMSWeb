#!/usr/bin/env bash
# Renders the GitHub Release body for a preview app build. Output is plain
# user-facing installation instructions; it carries no secrets and is safe to
# print into CI logs and release notes.
set -euo pipefail

platform="${1:?usage: render-preview-app-release-notes.sh <ios|android> <version-suffix>}"
version_suffix="${2:?usage: render-preview-app-release-notes.sh <ios|android> <version-suffix>}"

case "$platform" in
  ios)
    cat <<EOF
## IMSWeb iOS 预览版 ${version_suffix}

这是一个**未签名**的预览安装包（.ipa），需要用 [Sideloadly](https://sideloadly.io/) 配合你自己的
Apple ID 在电脑上完成安装，全程不需要越狱，也不需要付费开发者账号。

### 安装步骤

1. 在电脑（Windows 或 Mac）上下载并安装 [Sideloadly](https://sideloadly.io/)。
2. 用数据线把 iPhone / iPad 连接到电脑，设备上弹出"信任这台电脑"时点击信任。
3. 打开 Sideloadly，把下面 Assets 里的 \`.ipa\` 文件拖进 Sideloadly 窗口，
   在设备下拉框里选中你的设备。
4. 点击开始，Sideloadly 会提示输入 Apple ID（用普通的免费 Apple ID 即可，
   不需要开发者账号），登录后等待安装完成。
5. 安装完成后，在设备上打开 **设置 > 通用 > VPN 与设备管理**（部分系统版本显示为
   "描述文件与设备管理"），找到你刚才登录的 Apple ID 对应的"开发者 App"，
   点进去点"信任"。
6. 回到主屏幕即可打开 IMSWeb 预览版。

### 关于 7 天有效期

免费 Apple ID 签名的 App 每 7 天会过期，过期后需要重新用 Sideloadly 安装一次
（同一个 Apple ID 即可，数据不会丢失）。Sideloadly 也提供自动续签功能，只要设备
定期通过数据线或 Wi-Fi 连接安装它的电脑即可自动续期，详见 Sideloadly 官方 FAQ。

### 已知限制

打包版 App 目前有少量组件（如 Wiki 事务所图标、名片图片、编年史封面等约 43 处）的
媒体地址依赖同源解析，跨域访问下可能显示不出来；这是已知的现有限制，与本次预览版本
无关，后续会陆续收敛。
EOF
    ;;
  android)
    cat <<EOF
## IMSWeb Android 预览版 ${version_suffix}

这是一个已签名、可直接安装的预览 APK，签名用的是仅供预览分发使用的密钥（不是正式
上架密钥），可以在同一台设备上反复覆盖升级到更新的预览版本。

### 安装步骤

1. 在 Android 设备上下载下面 Assets 里的 \`.apk\` 文件。
2. 首次安装时系统会提示"允许安装未知来源应用"，按提示打开对应浏览器/文件管理器的
   安装权限即可（不同厂商 ROM 的提示文案略有差异）。
3. 点击下载好的 APK 完成安装。

### 已知限制

打包版 App 目前有少量组件（如 Wiki 事务所图标、名片图片、编年史封面等约 43 处）的
媒体地址依赖同源解析，跨域访问下可能显示不出来；这是已知的现有限制，与本次预览版本
无关，后续会陆续收敛。
EOF
    ;;
  *)
    echo "Unknown platform: $platform" >&2
    exit 1
    ;;
esac
