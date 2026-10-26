# claude_status_line_setting

Claude Code 的 status line 與 mod 設定，配色統一用「銀河のポラロイド」（Royal Night 底、Lunar Beige 字、Starburst Gold 強調）。

```
<徽章> 專案名 │ <uplink> VPN │ <robot> 模型 │ <gauge> 10 格 context 用量 % │ <沙漏> 10 格 5 小時用量 %
```

## 內容

| 路徑 | 說明 | 安裝位置 |
|---|---|---|
| `statusline/statusline-command.sh` | status line 腳本（sh + jq，一次 jq 解析） | `~/.claude/statusline-command.sh` |
| `statusline/hdre-emblem/build.py` | 產生「HDRE Emblem」字型：鏡像的 md-unicorn_variant，讓開頭徽章朝右 | `~/.local/share/hdre-emblem/build.py` |
| `mods/subagent-progress/` | prompt 上方的 subagent 進度帶：狀態、任務、tool 次數、目前動作、經過時間 | `~/.claude/mods/subagent-progress` |
| `mods/quiet-footer/` | 拿掉 prompt 下方提示列的「(shift+tab to cycle)」 | `~/.claude/mods/quiet-footer` |
| `settings.snippet.json` | 要合併進 `~/.claude/settings.json` 的兩個鍵 | — |

## 安裝

```sh
cp statusline/statusline-command.sh ~/.claude/
mkdir -p ~/.claude/mods && cp -R mods/subagent-progress mods/quiet-footer ~/.claude/mods/
```

再把 `settings.snippet.json` 的 `env.CLAUDE_CODE_PLUGIN_DIRS` 與 `statusLine` 合併進 `~/.claude/settings.json`（`env` 若已有其他變數，只加這一個鍵），重開 Claude Code。

### 相依

- `jq`
- Symbols Nerd Font：`brew install --cask font-symbols-only-nerd-font`
- 徽章朝右（選用）：`python3 -m pip install fonttools` 後執行 `python3 -I statusline/hdre-emblem/build.py`，
  會裝到 `~/Library/Fonts/HDREEmblem-Regular.ttf`；再把終端機字型的第一順位設成「HDRE Emblem」。
  沒做這步時徽章退回原本朝左的 Nerd Font 圖示。
- VPN 段讀 `~/.local/bin/vpn current`；沒有這個指令時整段不顯示。

## 備註

- 各 mod 的 `.claude-plugin/types/` 是 Claude Code 產生的型別檔（自帶 `.gitignore: *`），不進版控；
  `tsconfig.json` 只在型別檢查時用到。
- 顏色規則：只有需要提醒時才變色——用量 ≥ 50% 琥珀、≥ 80% 或 VPN 斷線紅色。
