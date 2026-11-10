#!/usr/bin/env bash
# 一次更換 Android 套件名稱 (applicationId)。
# 用法: scripts/set-app-id.sh org.codeberg.yourname.lianbo
# 注意：上架 F-Droid 之後就不能再改。
set -euo pipefail
NEW="${1:?usage: $0 <new.app.id>}"
cd "$(dirname "$0")/.."
OLD="$(sed -n 's/.*appId: "\(.*\)".*/\1/p' capacitor.config.ts)"
[ "$OLD" = "$NEW" ] && { echo "already $NEW"; exit 0; }
echo "Changing $OLD -> $NEW"
OLD_PATH="android/app/src/main/java/${OLD//.//}"
NEW_PATH="android/app/src/main/java/${NEW//.//}"
grep -rl --exclude-dir=node_modules --exclude-dir=build --exclude-dir=.git -F "$OLD" \
  capacitor.config.ts android README.md fdroid 2>/dev/null | xargs sed -i "s/${OLD//./\\.}/$NEW/g"
mkdir -p "$NEW_PATH"
git mv "$OLD_PATH/MainActivity.java" "$NEW_PATH/MainActivity.java" 2>/dev/null || mv "$OLD_PATH/MainActivity.java" "$NEW_PATH/MainActivity.java"
find android/app/src/main/java -type d -empty -delete
[ -f "fdroid/metadata/$OLD.yml" ] && { git mv "fdroid/metadata/$OLD.yml" "fdroid/metadata/$NEW.yml" 2>/dev/null || mv "fdroid/metadata/$OLD.yml" "fdroid/metadata/$NEW.yml"; }
echo "Done. Run: npm run cap:sync"
