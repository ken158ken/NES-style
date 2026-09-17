#!/usr/bin/env bash
# tools/run_all.sh — 一鍵跑全部檢查，最後印 PASS / FAIL 表
#
#   bash tools/run_all.sh              # 全部
#   bash tools/run_all.sh --quick      # 略過截圖 / lint 抽查
#   bash tools/run_all.sh --shots 12   # nes_lint 抽查的 PNG 張數（預設 8）
#
# 內容：① node --check 所有 engine/*.js 與 games/**/*.js
#       ② tools/test_*.py + games/*/test_*.py（存在的才跑：引擎單元測試 + 遊戲層測試）
#       ③ tools/build.py --check（載入順序 + engine 缺檔）
#       ④ tools/shot.py 冒煙截圖（順便驗 __nes 除錯 API）
#       ⑤ tools/nes_lint.py 對 shots/ 的 PNG 抽查（逐像素 64 色 / ≤25 色）
# 結束碼：有任一 FAIL → 1（SKIP 不算失敗）

set -u
cd "$(dirname "$0")/.." || exit 2
ROOT="$PWD"
PY="../卡比之星/.venv/bin/python"
QUICK=0
NSHOTS=8
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=1 ;;
    --shots) shift; NSHOTS="${1:-8}" ;;
    *) echo "未知參數: $1"; exit 2 ;;
  esac
  shift
done

NAMES=(); RESULTS=(); NOTES=()
add() { NAMES+=("$1"); RESULTS+=("$2"); NOTES+=("$3"); }
run() {  # run <名稱> <指令...>
  local name="$1"; shift
  local log; log="$(mktemp)"
  if "$@" >"$log" 2>&1; then
    add "$name" PASS "$(tail -n 1 "$log" | cut -c1-70)"
  else
    add "$name" FAIL "$(tail -n 3 "$log" | tr '\n' ' ' | cut -c1-70)"
    echo "----- $name 失敗，輸出 -----"
    tail -n 25 "$log"
  fi
  rm -f "$log"
}

echo "== ① 語法檢查 node --check =="
if command -v node >/dev/null 2>&1; then
  bad=""
  for f in engine/*.js games/*/*.js; do
    [ -e "$f" ] || continue
    node --check "$f" >/dev/null 2>&1 || { bad="$bad $f"; echo "  語法錯誤: $f"; node --check "$f" 2>&1 | head -5; }
  done
  n=$(ls engine/*.js games/*/*.js 2>/dev/null | wc -l)
  if [ -z "$bad" ]; then add "node --check ($n 檔)" PASS ""; else add "node --check" FAIL "$bad"; fi
else
  add "node --check" SKIP "沒有 node"
fi

echo "== ② 單元測試 tools/test_*.py + games/*/test_*.py =="
found_test=0
for t in tools/test_*.py games/*/test_*.py; do
  [ -e "$t" ] || continue
  found_test=1
  echo "-- $t"
  # 遊戲層測試同名機率高（都叫 test_demo.py），標題帶上所屬資料夾
  case "$t" in
    games/*) label="$(basename "$(dirname "$t")")/$(basename "$t")" ;;
    *) label="$(basename "$t")" ;;
  esac
  run "$label" "$PY" "$t"
done
[ "$found_test" = 0 ] && add "test_*.py" SKIP "尚無測試檔"

echo "== ③ 打包檢查 build.py --check =="
run "build.py --check" "$PY" tools/build.py --check

if [ "$QUICK" = 0 ]; then
  echo "== ④ 冒煙截圖 shot.py =="
  run "shot.py 冒煙" "$PY" tools/shot.py --steps 10 --scale 3 --lint --out shots/run_all/smoke.png

  echo "== ⑤ nes_lint.py 抽查截圖 =="
  if [ -f tools/nes_lint.py ]; then
    # 只挑「256×224 的整數倍」的截圖（工具自己的介面截圖 / 說明圖不算 NES 畫面）
    pngs=$("$PY" - "$NSHOTS" <<'PYEOF'
import sys, pathlib
from PIL import Image
n = int(sys.argv[1]) if len(sys.argv) > 1 else 8
out = []
for p in sorted(pathlib.Path('shots').rglob('*.png'), key=lambda q: -q.stat().st_mtime):
    try:
        w, h = Image.open(p).size
    except Exception:
        continue
    if w % 256 == 0 and h % 224 == 0 and w // 256 == h // 224:
        out.append(str(p))
    if len(out) >= n:
        break
print(chr(10).join(out))
PYEOF
)
    if [ -z "$pngs" ]; then
      add "nes_lint.py 抽查" SKIP "shots/ 沒有 256×224 倍數的 PNG"
    else
      # shellcheck disable=SC2086
      run "nes_lint.py 抽查($(echo "$pngs" | wc -l) 張)" "$PY" tools/nes_lint.py --palette engine/palette.js $pngs
    fi
  else
    add "nes_lint.py 抽查" SKIP "tools/nes_lint.py 尚未存在"
  fi
else
  add "shot.py 冒煙" SKIP "--quick"
  add "nes_lint.py 抽查" SKIP "--quick"
fi

echo
echo "================ 結果 ================"
printf "%-28s %-6s %s\n" "項目" "結果" "備註"
printf -- "--------------------------------------------------------------\n"
fail=0
for i in "${!NAMES[@]}"; do
  printf "%-28s %-6s %s\n" "${NAMES[$i]}" "${RESULTS[$i]}" "${NOTES[$i]}"
  [ "${RESULTS[$i]}" = FAIL ] && fail=1
done
printf -- "--------------------------------------------------------------\n"
if [ "$fail" = 0 ]; then echo "總結：PASS"; else echo "總結：FAIL"; fi
exit "$fail"
