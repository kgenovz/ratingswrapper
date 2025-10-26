#!/bin/bash
# SWR Testing Script - Validates stale-while-revalidate behavior
# Tests fresh → stale → expired states with 10s intervals

URL="https://ratingswrapper-production-dfa6.up.railway.app/api/test-swr"

echo "🧪 Testing SWR (Stale-While-Revalidate) Caching"
echo "================================================"
echo ""

echo "Step 1: Initial request (should be MISS - creates cache)"
echo "--------------------------------------------------------"
curl -s -i "$URL" | grep -E "(HTTP/|X-Ratings-Cache|status)" | head -5
echo ""
sleep 2

echo "Step 2: Immediate second request (should be HIT - fresh cache)"
echo "---------------------------------------------------------------"
curl -s -i "$URL" | grep -E "(HTTP/|X-Ratings-Cache|status)" | head -5
echo ""
sleep 2

echo "Step 3: Waiting for cache to go stale (10 seconds)..."
echo "------------------------------------------------------"
for i in {10..1}; do
  echo -ne "\rTime until stale: ${i}s "
  sleep 1
done
echo ""
echo ""

echo "Step 4: Request after 10s (should be STALE - immediate serve + refresh)"
echo "------------------------------------------------------------------------"
RESPONSE=$(curl -s -i "$URL")
echo "$RESPONSE" | grep -E "(HTTP/|X-Ratings-Cache)" | head -3
echo "$RESPONSE" | python -m json.tool 2>/dev/null | grep -E "(status|message|cacheAge)" | head -4
echo ""
sleep 2

echo "Step 5: Request immediately after stale (should be HIT - fresh from refresh)"
echo "-----------------------------------------------------------------------------"
curl -s -i "$URL" | grep -E "(HTTP/|X-Ratings-Cache|status)" | head -5
echo ""
sleep 2

echo "Step 6: Waiting for total expiry (20 seconds from start)..."
echo "------------------------------------------------------------"
echo "Waiting 18 more seconds for complete expiry..."
for i in {18..1}; do
  echo -ne "\rTime until expired: ${i}s "
  sleep 1
done
echo ""
echo ""

echo "Step 7: Request after 20s total (should be MISS - expired, rebuild)"
echo "--------------------------------------------------------------------"
curl -s -i "$URL" | grep -E "(HTTP/|X-Ratings-Cache|status)" | head -5
echo ""

echo "✅ SWR Test Complete!"
echo ""
echo "Expected Results:"
echo "- Step 1: miss (creates cache)"
echo "- Step 2: hit (fresh, 0-10s)"
echo "- Step 4: stale (10-20s, immediate serve + background refresh)"
echo "- Step 5: hit (fresh from background refresh)"
echo "- Step 7: miss (20s+, expired)"
