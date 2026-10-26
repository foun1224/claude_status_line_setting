#!/bin/sh
# Claude Code status line — "銀河のポラロイド" (galaxy polaroid) HUD: night blue, beige, starburst gold
#   <emblem> SRE_PVE_Automation │ <uplink> PVE │ <robot> Opus 5.5 │ <gauge> ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ 37% │ <hourglass> ■ ■ ■ ■ ■ ■ ■ ■ ■ ■ 25%
# Layout rules:
#   - every segment is "icon value"; icons foggy blue, values lunar beige, thin royal-night │ between segments
#   - starburst gold only for the emblem, the project name and the lit gauge cells
#   - colour changes only to flag something: amber = usage >= 50%, red = VPN down / context or 5h usage >= 80%
# Icons need Symbols Nerd Font (bundled by Orca; also installed in ~/Library/Fonts).
# The emblem faces right when Orca's terminal font is "HDRE Emblem" (~/.local/share/hdre-emblem/build.py).

input=$(cat)

# One jq pass; @sh quotes every value safely for eval
eval "$(printf '%s' "$input" | jq -r '@sh "
  cwd=\(.workspace.current_dir // .cwd // "")
  model=\(.model.display_name // "")
  used_pct=\(.context_window.used_percentage // "")
  five_pct=\(.rate_limits.five_hour.used_percentage // "")"')"

# Real ESC byte, so colors survive being passed through printf %s
ESC=$(printf '\033')
RST="${ESC}[0m"
BOLD="${ESC}[1m"
rgb() { printf '%s[38;2;%s;%s;%sm' "$ESC" "$1" "$2" "$3"; }   # truecolor foreground

# Nerd Font glyphs as octal UTF-8 (sh here is bash 3.2, whose printf has no \u)
I_MARK=$(printf '\363\261\227\203')  # md-unicorn_variant  U+F15C3  RX-0 Unicorn emblem
I_VPN=$(printf '\363\260\244\211')   # md-satellite_uplink U+F0909
I_AI=$(printf '\363\260\232\251')    # md-robot            U+F06A9
I_CTX=$(printf '\363\260\212\232')   # md-gauge            U+F029A
I_5H=$(printf '\363\260\224\237')    # md-timer_sand       U+F051F

# Palette: "銀河のポラロイド" — Royal Night #132442 (the terminal background)
# / #1a3a63, Foggy Blue #637d92, Starburst Gold #bc8909, Lunar Beige #e8d1b6.
# Every colour lifted one step brighter than the palette.
C_ACCENT=$(rgb 217 162 28)     # starburst gold, brighter #d9a21c: emblem, project, lit gauge cells
C_TEXT=$(rgb 243 226 204)      # lunar beige, brighter #f3e2cc: values
C_ICON=$(rgb 127 154 176)      # foggy blue, brighter #7f9ab0: icons, ahead/behind
C_SEP=$(rgb 74 109 152)        # between royal night and foggy blue, brighter (#4a6d98): │ separators
C_AMBER=$(rgb 255 158 61)      # amber: usage >= 50%
C_RED=$(rgb 235 95 75)         # red: VPN down, usage >= 80%
C_BAR_BG=$(rgb 36 73 122)      # royal night, brighter #24497a: unlit gauge cells

SEP=" ${C_SEP}│${RST} "
seg() { printf '%s%s%s %s' "$C_ICON" "$1" "$RST" "$2"; }      # seg <icon> <coloured value>

# --- emblem + project: just the current dir name, bold starburst gold ------------------
[ -n "$cwd" ] || cwd=$PWD
case "$cwd" in
  "$HOME") dir_name="~" ;;
  /)       dir_name="/" ;;
  *)       dir_name="${cwd##*/}" ;;
esac
out="${C_ACCENT}${I_MARK}${RST} ${BOLD}${C_ACCENT}${dir_name}${RST}"

# --- vpn: FortiGate VPN profiles currently up (~/.local/bin/vpn current) ----
VPN_BIN="$HOME/.local/bin/vpn"
if [ -x "$VPN_BIN" ]; then
  vpn_now=$("$VPN_BIN" current 2>/dev/null | tr 'a-z' 'A-Z' | sed 's/+GUI/(GUI)/g')
  if [ -n "$vpn_now" ]; then
    out="${out}${SEP}$(seg "$I_VPN" "${C_TEXT}${vpn_now}${RST}")"
  else
    out="${out}${SEP}${C_RED}${I_VPN} OFF${RST}"
  fi
fi

# --- model: "Opus 5.5 (1M context)" -> "Opus 5.5" ---------------------------
if [ -n "$model" ]; then
  out="${out}${SEP}$(seg "$I_AI" "${C_TEXT}$(printf '%s' "$model" | sed 's/ *(.*)$//')${RST}")"
fi

# gauge <percent>: 10 squares (■, in SF Mono) one cell apart, then the %;
# lit starburst gold, amber >= 50%, red >= 80%. Shared by the context and 5h segments.
gauge() {
  g_int=$(printf '%.0f' "$1")
  if   [ "$g_int" -ge 80 ]; then g_bar="$C_RED";   g_pct="$C_RED"
  elif [ "$g_int" -ge 50 ]; then g_bar="$C_AMBER"; g_pct="$C_AMBER"
  else                           g_bar="$C_ACCENT";  g_pct="$C_TEXT"
  fi
  g_filled=$(( (g_int + 9) / 10 ))
  [ "$g_filled" -gt 10 ] && g_filled=10
  g_out="${g_bar}" g_i=0
  while [ "$g_i" -lt 10 ]; do
    [ "$g_i" -gt 0 ] && g_out="${g_out} "
    [ "$g_i" -eq "$g_filled" ] && g_out="${g_out}${C_BAR_BG}"
    g_out="${g_out}■"
    g_i=$((g_i + 1))
  done
  printf '%s%s %s%s%%%s' "$g_out" "$RST" "$g_pct" "$g_int" "$RST"
}

# --- context window used ----------------------------------------------------
[ -n "$used_pct" ] && out="${out}${SEP}$(seg "$I_CTX" "$(gauge "$used_pct")")"

# --- 5h usage: % of the subscription's 5-hour window used --------------------
# rate_limits only shows up for subscribers, after the first API response
[ -n "$five_pct" ] && out="${out}${SEP}$(seg "$I_5H" "$(gauge "$five_pct")")"

printf '%s\n' "$out"
