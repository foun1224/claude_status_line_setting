#!/usr/bin/env python3
"""
build.py — 產生「HDRE Emblem」字型：只含一個字，左右鏡像的 md-unicorn_variant（獨角獸頭朝右）

用途：Claude Code status line 開頭的 RX-0 徽章。終端機無法翻轉字元，只能自己做一個鏡像字。
用法：python3 -I ~/.local/share/hdre-emblem/build.py     # 產生並安裝到 ~/Library/Fonts/HDREEmblem-Regular.ttf

設計：
  - 沿用原字元碼 U+F15C3：Orca 字型沒設成 HDRE Emblem 時會退回原本朝左的 Nerd Font 圖示，不會變方框
  - 刻意不含空白字元（U+0020）：Chromium 以「第一個有空白字元的字型」當主字型決定行高與字寬，
    所以 Orca 把 HDRE Emblem 設為第一順位後，排版基準仍是後面的 SF Mono，文字外觀不變
  - 來源：Homebrew cask font-symbols-only-nerd-font 的 SymbolsNerdFontMono-Regular.ttf
"""
import os
import sys

from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

SRC = os.path.expanduser("~/Library/Fonts/SymbolsNerdFontMono-Regular.ttf")
DST = os.path.expanduser("~/Library/Fonts/HDREEmblem-Regular.ttf")
CODEPOINT = 0xF15C3  # md-unicorn_variant
FAMILY = "HDRE Emblem"
PS_NAME = "HDREEmblem-Regular"


def main() -> int:
    if not os.path.exists(SRC):
        print(f"找不到 {SRC}，請先 brew install --cask font-symbols-only-nerd-font", file=sys.stderr)
        return 1

    font = TTFont(SRC)
    if CODEPOINT not in font.getBestCmap():
        print(f"{SRC} 沒有 U+{CODEPOINT:05X}", file=sys.stderr)
        return 1

    # 只留這一個字（加 .notdef），丟掉 hinting
    opts = Options()
    opts.hinting = False
    opts.notdef_outline = True
    opts.name_IDs = ["*"]
    sub = Subsetter(options=opts)
    sub.populate(unicodes=[CODEPOINT])
    sub.subset(font)

    gname = font.getBestCmap()[CODEPOINT]
    glyf, hmtx = font["glyf"], font["hmtx"]
    advance, _ = hmtx[gname]

    # 左右鏡像：x -> advance - x；鏡像會讓輪廓方向反過來，再反轉一次保持 TrueType 慣例
    pen = TTGlyphPen(font.getGlyphSet())
    glyf[gname].draw(TransformPen(ReverseContourPen(pen), (-1, 0, 0, 1, advance, 0)), glyf)
    mirrored = pen.glyph()
    mirrored.recalcBounds(glyf)
    glyf[gname] = mirrored
    hmtx[gname] = (advance, mirrored.xMin)

    # 改名，避免跟原本的 Symbols Nerd Font 撞名
    name = font["name"]
    name.names = []
    for nid, value in {1: FAMILY, 2: "Regular", 3: f"{PS_NAME};local", 4: FAMILY,
                       5: "Version 1.0", 6: PS_NAME, 16: FAMILY, 17: "Regular"}.items():
        name.setName(value, nid, 3, 1, 0x409)
        name.setName(value, nid, 1, 0, 0)

    assert 0x20 not in font.getBestCmap(), "不能含空白字元"
    font.save(DST)
    print(f"已安裝 {DST}（family={FAMILY}，U+{CODEPOINT:05X} 鏡像，glyph={gname}）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
