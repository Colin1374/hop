#!/bin/bash
# Watch GitHub Pages build for Colin1374/hop; re-trigger if errored, verify live content.
cd /Users/colin.hughes/tweet2xcancel || exit 1

RETRIES=0
for i in $(seq 1 30); do
  st=$(gh api repos/Colin1374/hop/pages/builds/latest --jq '.status' 2>/dev/null || echo "api_err")
  sz=$(curl -sS -m 10 -o /tmp/watch_hop.html -w "%{size_download}" "https://colin1374.github.io/hop/" 2>/dev/null || echo 0)
  refs=$(grep -c 'nitter\.app' /tmp/watch_hop.html 2>/dev/null || echo 0)
  echo "[$(date +%H:%M:%S)] iter=$i build=$st live=${sz}b nitter.app=$refs"

  if [ "$sz" -gt 19000 ] 2>/dev/null && [ "$refs" -gt 0 ] 2>/dev/null; then
    echo "DEPLOY LIVE: https://colin1374.github.io/hop/ points at nitter.app"
    exit 0
  fi

  if [ "$st" = "errored" ] && [ "$RETRIES" -lt 5 ]; then
    RETRIES=$((RETRIES+1))
    echo "[$(date +%H:%M:%S)] build errored, re-triggering (attempt $RETRIES)"
    gh api repos/Colin1374/hop/pages/builds -X POST --jq '.status' 2>/dev/null || true
  fi

  sleep 90
done

echo "TIMEOUT: Pages build still not live after ~45min. Check https://www.githubstatus.com/"
exit 1
