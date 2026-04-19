/**
 * Text similarity and scoring utilities for AI-driven self-healing.
 * Provides multiple string comparison algorithms used to compute
 * weighted similarity between element profiles and DOM candidates.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */

/**
 * Levenshtein edit distance between two strings.
 * Returns the minimum number of single-character edits
 * (insertions, deletions, substitutions) to transform a into b.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function levenshtein(a, b) {
  if (!a || !b) return Math.max((a || '').length, (b || '').length);
  a = a.toLowerCase();
  b = b.toLowerCase();

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Normalized string similarity (0 = no match, 1 = identical).
 * Based on Levenshtein distance normalized by the longer string length.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function stringSimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Tokenize a string into lowercase word tokens.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase().split(/[\s\-_/,.;:!?]+/).filter((t) => t.length > 0);
}

/**
 * Jaccard similarity between two token sets (0 = no overlap, 1 = identical).
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function tokenOverlap(a, b) {
  const tokensA = new Set(tokenize(a));
  const tokensB = new Set(tokenize(b));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection++;
  }
  return intersection / (tokensA.size + tokensB.size - intersection);
}

/**
 * Combined fuzzy similarity: max of normalized Levenshtein and token overlap.
 * This gives a balanced score for both reworded text and rearranged tokens.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function fuzzySimilarity(a, b) {
  if (!a && !b) return 1;
  if (!a || !b) return 0;
  return Math.max(stringSimilarity(a, b), tokenOverlap(a, b));
}

/**
 * Attribute set similarity using Jaccard coefficient.
 * Compares two attribute objects: { key: value, ... }
 * Scores based on key overlap and value similarity.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function attributeSimilarity(profileAttrs, candidateAttrs) {
  if (!profileAttrs || !candidateAttrs) return 0;

  const profileKeys = Object.keys(profileAttrs).filter((k) => profileAttrs[k] != null);
  const candidateKeys = Object.keys(candidateAttrs).filter((k) => candidateAttrs[k] != null);

  if (profileKeys.length === 0) return 0;

  let totalScore = 0;
  let matched = 0;

  for (const key of profileKeys) {
    if (candidateAttrs[key] != null) {
      matched++;
      totalScore += fuzzySimilarity(String(profileAttrs[key]), String(candidateAttrs[key]));
    }
  }

  if (matched === 0) return 0;
  return totalScore / profileKeys.length;
}

/**
 * Nearby text similarity using token overlap on flattened arrays.
 *
 * @author Gin<gin_vn@haldata.net>
 * @lastupdate Gin<gin_vn@haldata.net>
 */
export function nearbyTextSimilarity(profileNearby, candidateNearby) {
  if (!profileNearby?.length && !candidateNearby?.length) return 1;
  if (!profileNearby?.length || !candidateNearby?.length) return 0;

  const a = profileNearby.join(' ').toLowerCase();
  const b = candidateNearby.join(' ').toLowerCase();
  return tokenOverlap(a, b);
}
