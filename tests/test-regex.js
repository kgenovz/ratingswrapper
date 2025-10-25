const testCases = [
  { slug: 'zero-kara-hajimeru-isekai-seikatsu-2nd-season-part-2', expected: 2, description: 'Re:Zero full slug' },
  { slug: 'some-anime-seikatsu-2', expected: 2, description: 'seikatsu 2 (word + number)' },
  { slug: 'some-anime-seikatsu-3', expected: 3, description: 'seikatsu 3 (word + number)' },
  { slug: 'attack-on-titan-2nd-season', expected: 2, description: 'AoT ordinal' },
  { slug: 'my-hero-academia-season-3', expected: 3, description: 'MHA season-N' },
  { slug: 'arcane-season-2', expected: 2, description: 'Arcane season-N' },
  { slug: 'some-show-s4', expected: 4, description: 's4 format' },
  { slug: 'anime-title-part-2', expected: 2, description: 'part-2 format' },
  { slug: 'show-name-3', expected: 3, description: 'trailing number only' },
  { slug: 'some-title-part-2', expected: 2, description: 'part 2 (space)' }
];

console.log('CURRENT PATTERNS:\n');
const currentPatterns = [
  /(?:^|[-_ ])season[-_ ]*(\d+)(?:st|nd|rd|th)?/i,
  /(\d+)(?:st|nd|rd|th)[-_ ]*season/i,
  /(?:^|[-_ ])s(\d+)(?:$|[-_ ])/i,
  /part[-_ ]?(\d+)/i,
  /(?:^|[-_ ])(\d+)$/i
];

testCases.forEach(test => {
  let found = null;
  let matchedPattern = null;
  for (let i = 0; i < currentPatterns.length; i++) {
    const pattern = currentPatterns[i];
    const match = test.slug.match(pattern);
    if (match && match[1]) {
      found = parseInt(match[1], 10);
      matchedPattern = i;
      break;
    }
  }
  const status = found === test.expected ? '✓' : '✗';
  console.log(`${status} | ${test.description}`);
  console.log(`  Slug: "${test.slug}"`);
  console.log(`  Expected: ${test.expected}, Got: ${found}, Pattern: ${matchedPattern !== null ? matchedPattern : 'none'}`);
  console.log('');
});

console.log('\n========================================\n');
console.log('PROPOSED PATTERNS:\n');

const proposedPatterns = [
  /(?:^|[-_ ])season[-_ ]*(\d+)(?:st|nd|rd|th)?/i,            // season-2, season 2, season-2nd
  /(\d+)(?:st|nd|rd|th)[-_ ]*season/i,                         // 2nd-season, 2nd season (anywhere in slug)
  /(?:^|[-_ ])s(\d+)(?:$|[-_ ])/i,                             // s2, s3 (delimited)
  /part[-_ ]?(\d+)/i,                                          // part-2, part 2
  /[-_ ](\d+)$/i                                               // word-2, word 2, trailing number (any word followed by number at end)
];

testCases.forEach(test => {
  let found = null;
  let matchedPattern = null;
  for (let i = 0; i < proposedPatterns.length; i++) {
    const pattern = proposedPatterns[i];
    const match = test.slug.match(pattern);
    if (match && match[1]) {
      found = parseInt(match[1], 10);
      matchedPattern = i;
      break;
    }
  }
  const status = found === test.expected ? '✓' : '✗';
  console.log(`${status} | ${test.description}`);
  console.log(`  Slug: "${test.slug}"`);
  console.log(`  Expected: ${test.expected}, Got: ${found}, Pattern: ${matchedPattern !== null ? matchedPattern : 'none'}`);
  console.log('');
});
