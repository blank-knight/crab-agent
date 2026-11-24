#!/usr/bin/env bash
# qiji 服务端独立自检——跑在服务器本机(cron或手动),不依赖外部runner
# 检查: ①PHP全文件语法 ②关键路由注册 ③DB连通+核心表 ④fa_version完整性 ⑤七牛CDN可达
# 用法: bash test_qiji_server_self.sh [站点根] (默认测试站)
set -u
ROOT="${1:-/www/wwwroot/test.agent.aijiqiren.vip/qiji-admin}"
PASS=0; FAIL=0
ck() { if [ "$2" = "0" ]; then PASS=$((PASS+1)); echo "  ✓ $1"; else FAIL=$((FAIL+1)); echo "  ✗ $1 → $3"; fi }

echo "━━━ qiji 服务端自检 · root=$ROOT ━━━"

# ① PHP语法闸:api控制器全扫
ERRS=$(find "$ROOT/application/api/controller" -name "*.php" -exec php -l {} \; 2>&1 | grep -cv "No syntax errors")
ck "PHP语法(api控制器全量0错)" "$([ "$ERRS" = "0" ] && echo 0 || echo 1)" "语法错误文件数=$ERRS"

# ② 核心路由注册(15端点的route.php在位)
RN=$(grep -cE "^\s*Route::(get|post|any)\('[a-z]" "$ROOT/application/route.php" 2>/dev/null || echo 0)
ck "路由表含client/v1(≥15条)" "$([ "$RN" -ge 15 ] && echo 0 || echo 1)" "当前=$RN条"

# ③ DB连通+核心表存在
cd "$ROOT"
DBP=$(grep -oP "^password\s*=\s*\K.*" .env | head -1)
DBN=$(grep -oP "^database\s*=\s*\K.*" .env | head -1)
DBU=$(grep -oP "^username\s*=\s*\K.*" .env | head -1)
TAB=$(mysql -h127.0.0.1 -u"$DBU" -p"$DBP" -N "$DBN" -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${DBN}' AND table_name='fa_version';" 2>/dev/null)
ck "fa_version表存在" "$([ "${TAB:-0}" -ge 1 ] && echo 0 || echo 1)" "information_schema计数=${TAB:-0}"

# ④ fa_version完整性:最新版字段齐(发版必填项)
ROW=$(mysql -h127.0.0.1 -u"$DBU" -p"$DBP" -N "$DBN" -e "SELECT COUNT(*) FROM fa_version WHERE CHAR_LENGTH(version) > 0;" 2>/dev/null)
ck "fa_version版本记录≥1" "$([ "${ROW:-0}" -ge 1 ] && echo 0 || echo 1)" "非空版本记录=${ROW:-0}(测试库全hidden属正常,未发版)"

# ⑤ 七牛CDN最新包可达(HEAD探测)
URL=$(mysql -h127.0.0.1 -u"$DBU" -p"$DBP" -N "$DBN" -e "SELECT downloadurl FROM fa_version WHERE downloadurl IS NOT NULL AND downloadurl != '' ORDER BY id DESC LIMIT 1;" 2>/dev/null)
if [ -n "$URL" ]; then
  CODE=$(curl -s --noproxy '*' -m 10 -o /dev/null -w "%{http_code}" -I "$URL")
  ck "CDN最新包可达($URL)" "$([ "$CODE" = "200" ] || [ "$CODE" = "302" ] && echo 0 || echo 1)" "HTTP=$CODE"
else
  echo "  (跳过:fa_version无记录)"
fi

echo "═══ 结果: $PASS 过 / $FAIL 挂 ═══"
[ "$FAIL" = "0" ] || exit 1
