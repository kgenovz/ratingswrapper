// Test cases for split-cour detection
const testCases = [
  {
    slug: 'zero-kara-hajimeru-isekai-seikatsu-2nd-season-part-2',
    expected: 2,
    description: 'Re:Zero S2 Part 2 (split-cour)',
    reasoning: 'Has both "2nd-season" AND "part-2", so part refers to split, not season'
  },
  {
    slug: 'attack-on-titan-final-season-part-2',
    expected: 4,
    description: 'AoT Final Season Part 2 (split-cour)',
    reasoning: 'Has both "final-season" AND "part-2", so part refers to split'
  },
  {
    slug: 'some-anime-part-2',
    expected: 2,
    description: 'Generic Part 2 (sequential season)',
    reasoning: 'Only has "part-2", no season indicator, so part = season number'
  },
  {
    slug: 'my-hero-academia-season-3',
    expected: 3,
    description: 'MHA Season 3 (standard)',
    reasoning: 'Only season indicator, no part'
  },
  {
    slug: 'arcane-season-2',
    expected: 2,
    description: 'Arcane Season 2 (standard)',
    reasoning: 'Only season indicator, no part'
  }
];

// Proposed logic:
// 1. Check if slug contains BOTH a season indicator AND a part indicator
// 2. If both exist: prioritize the season number (part is split-cour)
// 3. If only part exists: use part number as season number
// 4. If only season exists: use season number

function inferSeason(slug) {
  slug = slug.toLowerCase();

  // Check for explicit season indicators
  const seasonPatterns = [
    /(?:^|[-_ ])season[-_ ]*(\d+)(?:st|nd|rd|th)?/i,
    /(\d+)(?:st|nd|rd|th)[-_ ]*season/i,
    /(?:^|[-_ ])s(\d+)(?:$|[-_ ])/i
  ];

  // Check for "final-season" special case
  const isFinalSeason = slug.includes('final-season');

  // Check for part indicator
  const partPattern = /part[-_ ]?(\d+)/i;

  let seasonNumber = null;
  let partNumber = null;

  // Extract season number
  if (isFinalSeason) {
    seasonNumber = 4;
  } else {
    for (const pattern of seasonPatterns) {
      const match = slug.match(pattern);
      if (match && match[1]) {
        seasonNumber = parseInt(match[1], 10);
        break;
      }
    }
  }

  // Extract part number
  const partMatch = slug.match(partPattern);
  if (partMatch && partMatch[1]) {
    partNumber = parseInt(partMatch[1], 10);
  }

  // Decision logic
  if (seasonNumber && partNumber) {
    // Both exist: season takes precedence (part is split-cour)
    return { season: seasonNumber, reasoning: 'Has both season and part indicators - using season (part is split-cour)' };
  } else if (seasonNumber) {
    // Only season
    return { season: seasonNumber, reasoning: 'Only season indicator found' };
  } else if (partNumber) {
    // Only part: treat as season
    return { season: partNumber, reasoning: 'Only part indicator found - treating as season number' };
  }

  // Fallback to trailing number
  const trailingMatch = slug.match(/[-_ ](\d+)$/i);
  if (trailingMatch && trailingMatch[1]) {
    return { season: parseInt(trailingMatch[1], 10), reasoning: 'Trailing number at end' };
  }

  return { season: 1, reasoning: 'No indicators found - defaulting to season 1' };
}

console.log('Testing split-cour detection logic:\n');
testCases.forEach(test => {
  const result = inferSeason(test.slug);
  const status = result.season === test.expected ? '✓ PASS' : '✗ FAIL';
  console.log(`${status} | ${test.description}`);
  console.log(`  Slug: "${test.slug}"`);
  console.log(`  Expected: ${test.expected}, Got: ${result.season}`);
  console.log(`  Expected reasoning: ${test.reasoning}`);
  console.log(`  Actual reasoning: ${result.reasoning}`);
  console.log('');
});
