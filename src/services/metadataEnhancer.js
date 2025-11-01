/**
 * Metadata Enhancer Service
 * Enhances meta objects with ratings information
 */

const logger = require('../utils/logger');
const ratingsService = require('./ratingsService');
const consolidatedRatingService = require('./consolidatedRatingService');
const kitsuMappingService = require('./kitsuMappingService');
const tmdbService = require('./tmdbService');
const omdbService = require('./omdbService');
const malService = require('./malService');

/**
 * Format release date based on format preference
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @param {string} format - Format type: 'year', 'short', 'full'
 * @returns {string} Formatted date string
 */
function formatReleaseDate(dateString, format = 'year') {
  if (!dateString) return '';

  try {
    const date = new Date(dateString);

    switch(format) {
      case 'year':
        return date.getFullYear().toString();
      case 'full':
        return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      case 'short':
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      default:
        return date.getFullYear().toString();
    }
  } catch (error) {
    logger.warn(`Error formatting date ${dateString}:`, error.message);
    return '';
  }
}

/**
 * Get color indicator emoji based on rating color and emoji set
 * @param {string} color - Color indicator ('excellent', 'great', 'good', 'okay', 'mediocre', 'poor')
 * @param {string} emojiSet - Emoji set ('circle', 'square', 'star', 'heart', 'diamond')
 * @returns {string} Emoji character or empty string
 */
function getColorEmoji(color, emojiSet = 'circle') {
  const emojiMap = {
    circle: {
      excellent: '🟢',  // Dark green circle
      great: '🟩',      // Light green square (closest to light green circle)
      good: '🟨',       // Yellow square
      okay: '🟧',       // Orange square
      mediocre: '🟥',   // Light red square
      poor: '🔴'        // Dark red circle
    },
    square: {
      excellent: '🟩',  // Green square
      great: '💚',      // Green heart (as lighter variant)
      good: '🟨',       // Yellow square
      okay: '🟧',       // Orange square
      mediocre: '🟥',   // Red square
      poor: '🟥'        // Red square (darker variant not available)
    },
    star: {
      excellent: '⭐',  // Star
      great: '🌟',      // Glowing star
      good: '✨',       // Sparkles
      okay: '💫',       // Dizzy
      mediocre: '🌠',   // Shooting star
      poor: '☄️'        // Comet (declining)
    },
    heart: {
      excellent: '💚',  // Green heart
      great: '💛',      // Yellow heart
      good: '🧡',       // Orange heart
      okay: '🩷',       // Pink heart
      mediocre: '❤️',   // Red heart
      poor: '🖤'        // Black heart
    },
    diamond: {
      excellent: '💎',  // Gem (highest quality)
      great: '🔷',      // Blue diamond
      good: '🔶',       // Orange diamond
      okay: '🔸',       // Orange small diamond
      mediocre: '🔺',   // Red triangle up
      poor: '🔻'        // Red triangle down
    }
  };

  return emojiMap[emojiSet]?.[color] || '';
}

class MetadataEnhancerService {
  /**
   * Formats vote count to human-readable format
   * @param {number} votes - Vote count
   * @param {string} format - Format type: 'short' (1.2M), 'full' (1,200,000), 'both' (1,200,000 / 1.2M)
   * @returns {string} Formatted vote count
   * @private
   */
  _formatVoteCount(votes, format = 'short') {
    if (!votes) return '';
    const count = typeof votes === 'string' ? parseInt(votes) : votes;

    // Format full number with commas
    const fullNumber = count.toLocaleString('en-US');

    // Format short version
    let shortVersion = '';
    if (count >= 1000000) {
      shortVersion = `${(count / 1000000).toFixed(1)}M`;
    } else if (count >= 1000) {
      shortVersion = `${Math.floor(count / 1000)}K`;
    } else {
      shortVersion = count.toString();
    }

    // Return based on format preference
    if (format === 'full') {
      return fullNumber;
    } else if (format === 'both') {
      return `${fullNumber} / ${shortVersion}`;
    } else {
      // Default to 'short'
      return shortVersion;
    }
  }

  /**
   * Formats rating for title injection (simple template replacement)
   * @param {string} title - Original title
   * @param {Object} ratingData - Rating data object {rating, votes} or consolidated rating object
   * @param {Object} formatConfig - Format configuration {position, template, separator}
   * @param {boolean} useConsolidated - Whether to use consolidated rating format
   * @returns {string} Enhanced title
   * @private
   */
  _formatTitleRating(title, ratingData, formatConfig, useConsolidated = false) {
    if (!ratingData) return title;

    let ratingText;

    if (useConsolidated && ratingData.consolidatedRating) {
      // Use consolidated rating format with optional emoji
      const { consolidatedRating, colorIndicator } = ratingData;
      const emoji = formatConfig.useColorEmoji
        ? getColorEmoji(colorIndicator, formatConfig.emojiSet || 'circle')
        : '';

      const template = formatConfig.consolidatedTemplate || '{emoji} {rating}';
      ratingText = template
        .replace('{emoji}', emoji)
        .replace('{rating}', consolidatedRating.toFixed(1))
        .trim(); // Remove any extra whitespace if emoji is empty
    } else if (ratingData.rating) {
      // Use traditional IMDb-only format
      ratingText = formatConfig.template.replace('{rating}', ratingData.rating.toFixed(1));
    } else {
      // No valid rating data
      return title;
    }

    // Apply position (prefix or suffix)
    if (formatConfig.position === 'prefix') {
      return `${ratingText}${formatConfig.separator}${title}`;
    } else {
      return `${title}${formatConfig.separator}${ratingText}`;
    }
  }

  /**
   * Formats rating for description injection (with extended metadata support)
   * @param {string} description - Original description
   * @param {Object} ratingData - Rating data object {rating, votes} or consolidated rating object
   * @param {Object} formatConfig - Format configuration {position, template, separator, includeVotes, includeMpaa, includeTmdbRating, includeReleaseDate, includeRottenTomatoes, includeMetacritic, includeMalRating, includeMalVotes, includeConsolidatedRating}
   * @param {string} imdbId - IMDb ID for MPAA lookup (optional)
   * @param {string} mpaaRating - Pre-fetched MPAA rating (optional, to avoid individual lookups)
   * @param {Object} tmdbData - Pre-fetched TMDB data (optional)
   * @param {Object} omdbData - Pre-fetched OMDB data (optional)
   * @param {Object} malData - Pre-fetched MAL data (optional)
   * @param {boolean} useConsolidated - Whether to use consolidated rating format
   * @returns {Promise<string>} Enhanced description
   * @private
   */
  async _formatDescriptionRating(description, ratingData, formatConfig, imdbId = null, mpaaRating = null, tmdbData = null, omdbData = null, malData = null, useConsolidated = false) {
    // Check for either traditional or consolidated rating
    if (!ratingData || (!ratingData.rating && !ratingData.consolidatedRating)) return description;

    // Debug: Check what data we received
    logger.debug(`_formatDescriptionRating called with: tmdbData=${!!tmdbData}, omdbData=${!!omdbData}, malData=${!!malData}, useConsolidated=${useConsolidated}`);
    if (malData) {
      logger.debug(`MAL data in formatting: ${JSON.stringify(malData)}`);
      logger.debug(`Format config: includeMalRating=${formatConfig.includeMalRating}, includeMalVotes=${formatConfig.includeMalVotes}`);
    }

    // Compute each extended metadata text (do not push yet)
    const partTexts = {};

    // Handle consolidated rating if enabled
    if (useConsolidated && formatConfig.includeConsolidatedRating && ratingData.consolidatedRating) {
      const { consolidatedRating, colorIndicator, sourceCount } = ratingData;
      const emoji = formatConfig.useColorEmoji
        ? getColorEmoji(colorIndicator, formatConfig.emojiSet || 'circle')
        : '';

      const ratingText = `${emoji} ${consolidatedRating.toFixed(1)} (${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'})`.trim();
      partTexts.consolidatedRating = ratingText;
    }

    // IMDb rating as separate metadata item (can show alongside consolidated)
    if (formatConfig.includeImdbRating && ratingData.rating) {
      partTexts.imdbRating = `${ratingData.rating.toFixed(1)} IMDb`;
    }

    // Vote count
    if (formatConfig.includeVotes && ratingData.votes) {
      const voteCountFormat = formatConfig.voteCountFormat || 'short';
      const formattedVotes = this._formatVoteCount(ratingData.votes, voteCountFormat);
      partTexts.votes = `${formattedVotes} votes`;
    }

    // MPAA rating (may require fetch)
    if (formatConfig.includeMpaa && (mpaaRating || imdbId)) {
      const mpaa = mpaaRating || (imdbId ? await ratingsService.getMpaaRating(imdbId) : null);
      if (mpaa) partTexts.mpaa = mpaa;
    }

    // TMDB rating
    if (formatConfig.includeTmdbRating && tmdbData && tmdbData.tmdbRating) {
      const tmdbRatingFormat = formatConfig.tmdbRatingFormat || 'decimal';
      partTexts.tmdb = tmdbRatingFormat === 'decimal'
        ? `${tmdbData.tmdbRating.toFixed(1)} TMDB`
        : `${tmdbData.tmdbRating.toFixed(1)}/10 TMDB`;
    }

    // Release date
    if (formatConfig.includeReleaseDate && tmdbData) {
      const dateString = tmdbData.releaseDate || tmdbData.firstAirDate;
      if (dateString) {
        const releaseDateFormat = formatConfig.releaseDateFormat || 'year';
        const formatted = formatReleaseDate(dateString, releaseDateFormat);
        if (formatted) partTexts.releaseDate = formatted;
      }
    }

    // Rotten Tomatoes (OMDb)
    if (formatConfig.includeRottenTomatoes && omdbData && omdbData.rottenTomatoes) {
      partTexts.rottenTomatoes = `${omdbData.rottenTomatoes} RT`;
    }

    // Metacritic (OMDb)
    if (formatConfig.includeMetacritic && omdbData && omdbData.metacritic) {
      const metacriticFormat = formatConfig.metacriticFormat || 'score';
      partTexts.metacritic = metacriticFormat === 'outof100'
        ? `${omdbData.metacritic}/100 MC`
        : `${omdbData.metacritic} MC`;
    }

    // MAL (MyAnimeList) rating
    if (formatConfig.includeMalRating && malData && malData.malRating) {
      const malRatingFormat = formatConfig.malRatingFormat || 'decimal';
      partTexts.malRating = malRatingFormat === 'outof10'
        ? `${malData.malRating.toFixed(1)}/10 MAL`
        : `${malData.malRating.toFixed(1)} MAL`;
      logger.debug(`Added MAL rating to partTexts: ${partTexts.malRating}`);
    }

    // MAL vote count
    if (formatConfig.includeMalVotes && malData && malData.malVotes) {
      const malVoteFormat = formatConfig.malVoteFormat || 'short';
      const formattedVotes = this._formatVoteCount(malData.malVotes, malVoteFormat);
      partTexts.malVotes = `${formattedVotes} MAL votes`;
      logger.debug(`Added MAL votes to partTexts: ${partTexts.malVotes}`);
    }

    // Streaming Services (TMDB) - limit to 3 results
    if (formatConfig.includeStreamingServices && tmdbData && tmdbData.streamingProviders && tmdbData.streamingProviders.length > 0) {
      const limitedProviders = tmdbData.streamingProviders.slice(0, 3);
      partTexts.streamingServices = limitedProviders.join(', ');
    }

    // Apply ordering if provided; otherwise keep default order
    const allowedKeys = ['consolidatedRating','imdbRating','votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic','malRating','malVotes'];
    const metadataParts = [];
    if (Array.isArray(formatConfig.metadataOrder)) {
      const order = formatConfig.metadataOrder;
      order.forEach(k => { if (allowedKeys.includes(k) && partTexts[k]) metadataParts.push(partTexts[k]); });
      // Append any remaining parts not specified
      allowedKeys.forEach(k => { if (!order.includes(k) && partTexts[k]) metadataParts.push(partTexts[k]); });
    } else {
      // Default push order (backwards compatible)
      allowedKeys.forEach(k => { if (partTexts[k]) metadataParts.push(partTexts[k]); });
    }

    // Use provided separator as-is between metadata and description
    const sep = formatConfig.separator || ' ';

    // Join all metadata with configured separator (default to bullet)
    const metadataSep = formatConfig.metadataSeparator || ' • ';
    const metadataLine = metadataParts.join(metadataSep);

    // Add to description
    if (formatConfig.position === 'prefix') {
      return `${metadataLine}${sep}${description}`;
    } else {
      return `${description}${sep}${metadataLine}`;
    }
  }

  /**
   * Enhances a single meta object with rating (supports dual location injection)
   * @param {Object} meta - Meta object to enhance
   * @param {Object} ratingData - Rating data object {rating, votes} or null
   * @param {Object} config - Full config object with titleFormat and descriptionFormat
   * @param {string} imdbId - IMDb ID for MPAA lookup (optional)
   * @param {string} mpaaRating - Pre-fetched MPAA rating (optional)
   * @param {Object} tmdbData - Pre-fetched TMDB data (optional)
   * @param {Object} omdbData - Pre-fetched OMDB data (optional)
   * @param {Object} malData - Pre-fetched MAL data (optional)
   * @param {string} locationOverride - Override the config location (optional)
   * @returns {Promise<Object>} Enhanced meta object
   * @private
   */
  async _enhanceMetaWithRating(meta, ratingData, config, imdbId = null, mpaaRating = null, tmdbData = null, omdbData = null, malData = null, locationOverride = null, useConsolidated = false) {
    if (!ratingData || !config) {
      return meta;
    }

    // Clone meta to avoid mutation
    const enhancedMeta = { ...meta };
    const location = locationOverride || config.ratingLocation || 'title';

    // Determine which formats to use (with backwards compatibility)
    const titleFormat = config.titleFormat || config.ratingFormat;
    const descriptionFormat = config.descriptionFormat || config.ratingFormat;

    // Handle title injection
    if (location === 'title' || location === 'both') {
      enhancedMeta.name = this._formatTitleRating(meta.name, ratingData, titleFormat, useConsolidated);
    }

    // Handle description injection
    if (location === 'description' || location === 'both') {
      const originalDesc = meta.description || '';
      enhancedMeta.description = await this._formatDescriptionRating(
        originalDesc,
        ratingData,
        descriptionFormat,
        imdbId,
        mpaaRating,
        tmdbData,
        omdbData,
        malData,
        useConsolidated
      );
    }

    return enhancedMeta;
  }

  /**
   * Enhances catalog metas with ratings
   * @param {Array<Object>} metas - Array of meta objects from catalog
   * @param {Object} config - User configuration
   * @returns {Promise<Array<Object>>} Enhanced meta objects
   */
  async enhanceCatalogMetas(metas, config) {
    try {
      // Check if catalog ratings are enabled for ANY location
      const titleFormat = config.titleFormat || config.ratingFormat;
      const descriptionFormat = config.descriptionFormat || config.ratingFormat;
      const location = config.ratingLocation || 'title';

      // Determine if catalog items should get ratings based on location and format settings
      const enableCatalogInTitle = (location === 'title' || location === 'both') &&
                                    (titleFormat.enableCatalogItems !== false);
      const enableCatalogInDescription = (location === 'description' || location === 'both') &&
                                         (descriptionFormat.enableCatalogItems !== false);

      // If catalog items disabled for all locations, return original metas
      if (!enableCatalogInTitle && !enableCatalogInDescription) {
        logger.debug('Catalog item ratings disabled for all locations, returning original metas');
        return metas;
      }

      logger.info(`Enhancing ${metas.length} catalog items with ratings`);

      // Extract items for batch rating fetch, filtering out invalid items
      // Try to find IMDb ID from various possible fields
      // We also need to track the original meta index to map results back
      const items = metas
        .map((meta, index) => ({ meta, index }))
        .filter(({ meta }) => meta.imdb_id || meta.imdbId || meta.id) // Check multiple fields
        .map(({ meta, index }) => {
          // Prioritize explicit IMDb ID fields over generic ID field
          let id = meta.imdb_id || meta.imdbId || meta.id;

          // If this is a Kitsu ID, try to map it to IMDb ID
          if (kitsuMappingService.isKitsuId(id)) {
            const kitsuId = kitsuMappingService.extractKitsuId(id);
            const imdbId = kitsuMappingService.getImdbId(kitsuId);
            if (imdbId) {
              id = imdbId;
            }
          }

          // If this is a MAL ID, try to map it to IMDb ID
          if (kitsuMappingService.isMalId(id)) {
            const malId = kitsuMappingService.extractMalId(id);
            const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
            if (imdbId) {
              id = imdbId;
            }
          }

          return {
            id: id,
            type: meta.type,
            originalIndex: index
          };
        });

      if (items.length === 0) {
        logger.warn('No valid items with IDs found in catalog');
        return metas;
      }

      // Fetch all ratings in batch (either consolidated or IMDb-only)
      let ratingsMap;
      let imdbVotesMap = new Map(); // For vote counts when using consolidated
      const useConsolidated = config.useConsolidatedRating === true;

      if (useConsolidated) {
        logger.info('Using consolidated ratings (multi-source averaging)');
        const region = descriptionFormat?.streamingRegion || 'US';
        ratingsMap = await consolidatedRatingService.getConsolidatedRatingsBatch(items, 10, { region });

        // Also fetch traditional IMDb ratings for vote counts or IMDb rating display
        if (descriptionFormat && (descriptionFormat.includeVotes || descriptionFormat.includeImdbRating)) {
          logger.info('Fetching IMDb data for vote counts and/or IMDb rating display');
          imdbVotesMap = await ratingsService.getRatingsBatch(items, 10);
        }
      } else {
        logger.info('Using traditional IMDb-only ratings');
        ratingsMap = await ratingsService.getRatingsBatch(items, 10);
      }

      // Batch fetch MPAA ratings if enabled and using description location
      let mpaaMap = new Map();

      if (config.enableRatings && descriptionFormat && descriptionFormat.includeMpaa &&
          (location === 'description' || location === 'both')) {

        // Extract unique IMDb IDs from metas that have ratings
        const imdbIds = metas
          .map((meta, index) => {
            if (!meta) return null; // Guard against null metas

            const item = items.find(i => i.originalIndex === index);
            if (!item || !ratingsMap.has(item.id)) return null;

            // Extract base IMDb ID (without episode format)
            const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
            return imdbId;
          })
          .filter(id => id !== null);

        // Remove duplicates
        const uniqueImdbIds = [...new Set(imdbIds)];

        if (uniqueImdbIds.length > 0) {
          logger.info(`Batch fetching MPAA ratings for ${uniqueImdbIds.length} unique titles`);
          mpaaMap = await ratingsService.getMpaaRatingsBatch(uniqueImdbIds);
        }
      }

      // Batch fetch TMDB data if enabled and using description location
      let tmdbMap = new Map();

      if (config.enableRatings && descriptionFormat &&
          (descriptionFormat.includeTmdbRating || descriptionFormat.includeReleaseDate || descriptionFormat.includeStreamingServices) &&
          (location === 'description' || location === 'both')) {

        // Extract unique IMDb IDs from metas that have ratings
        const imdbIds = metas
          .map((meta, index) => {
            if (!meta) return null; // Guard against null metas

            const item = items.find(i => i.originalIndex === index);
            if (!item || !ratingsMap.has(item.id)) return null;

            // Extract base IMDb ID (without episode format)
            const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
            return imdbId;
          })
          .filter(id => id !== null);

        // Remove duplicates
        const uniqueImdbIds = [...new Set(imdbIds)];

        if (uniqueImdbIds.length > 0) {
          const streamingRegion = descriptionFormat.streamingRegion || 'US';
          logger.info(`Batch fetching TMDB data for ${uniqueImdbIds.length} unique titles (region: ${streamingRegion})`);
          tmdbMap = await tmdbService.getTmdbDataBatch(uniqueImdbIds, 5, streamingRegion);
        }
      }

      // Batch fetch OMDB data if enabled and using description location
      let omdbMap = new Map();

      if (config.enableRatings && descriptionFormat &&
          (descriptionFormat.includeRottenTomatoes || descriptionFormat.includeMetacritic) &&
          (location === 'description' || location === 'both')) {

        // Extract unique IMDb IDs from metas that have ratings
        const imdbIds = metas
          .map((meta, index) => {
            if (!meta) return null; // Guard against null metas

            const item = items.find(i => i.originalIndex === index);
            if (!item || !ratingsMap.has(item.id)) return null;

            // Extract base IMDb ID (without episode format)
            const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
            return imdbId;
          })
          .filter(id => id !== null);

        // Remove duplicates
        const uniqueImdbIds = [...new Set(imdbIds)];

        if (uniqueImdbIds.length > 0) {
          logger.info(`Batch fetching OMDB data for ${uniqueImdbIds.length} unique titles`);
          omdbMap = await omdbService.getOmdbDataBatch(uniqueImdbIds);
        }
      }

      // Batch fetch MAL data if enabled and using description location
      let malMap = new Map();

      if (config.enableRatings && descriptionFormat &&
          (descriptionFormat.includeMalRating || descriptionFormat.includeMalVotes) &&
          (location === 'description' || location === 'both')) {

        // Extract MAL IDs from metas
        const malIds = metas
          .map((meta, index) => {
            if (!meta) return null; // Guard against null metas

            const item = items.find(i => i.originalIndex === index);
            if (!item || !ratingsMap.has(item.id)) return null;

            // Extract MAL ID from various formats
            const id = meta.id || item.id;
            const malId = kitsuMappingService.extractMalId(id);

            if (!malId && id) {
              logger.debug(`No MAL ID found in: ${id} (title: ${meta.name || 'unknown'})`);
            }

            return malId;
          })
          .filter(id => id !== null);

        // Remove duplicates
        const uniqueMalIds = [...new Set(malIds)];

        if (uniqueMalIds.length > 0) {
          logger.info(`Batch fetching MAL data for ${uniqueMalIds.length} unique titles: ${uniqueMalIds.join(', ')}`);
          malMap = await malService.getMalDataBatch(uniqueMalIds);
        }
      }

      // Determine which locations should be used for catalog items
      let catalogLocation = 'title'; // default
      if (enableCatalogInTitle && enableCatalogInDescription) {
        catalogLocation = 'both';
      } else if (enableCatalogInDescription) {
        catalogLocation = 'description';
      }

      // Enhance each meta with its rating (now using async)
      // We need to map back using the same ID we used for fetching
      const enhancedMetas = await Promise.all(metas.map(async (meta, index) => {
        // Guard against null metas
        if (!meta) {
          return meta;
        }

        // Find the item we used for this meta
        const item = items.find(item => item.originalIndex === index);
        if (!item) {
          return meta; // No item means we filtered it out
        }

        const ratingData = ratingsMap.get(item.id);

        if (!ratingData) {
          return meta;
        }

        // If using consolidated ratings, merge in vote count and rating from IMDb
        let enhancedRatingData = ratingData;
        if (useConsolidated && imdbVotesMap.size > 0) {
          const imdbData = imdbVotesMap.get(item.id);
          if (imdbData) {
            enhancedRatingData = {
              ...ratingData,
              ...(imdbData.votes && { votes: imdbData.votes }),
              ...(imdbData.rating && { rating: imdbData.rating })
            };
          }
        }

        // Get IMDb ID and MPAA rating (if pre-fetched)
        const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
        const mpaaRating = imdbId ? mpaaMap.get(imdbId) : null;
        const tmdbData = imdbId ? tmdbMap.get(imdbId) : null;
        const omdbData = imdbId ? omdbMap.get(imdbId) : null;

        // Get MAL ID and data (if pre-fetched)
        const id = meta.id || item.id;
        const malId = kitsuMappingService.extractMalId(id);
        const malData = malId ? malMap.get(malId) : null;

        // Pass catalogLocation to override the config location for catalog items
        return await this._enhanceMetaWithRating(meta, enhancedRatingData, config, imdbId, mpaaRating, tmdbData, omdbData, malData, catalogLocation, useConsolidated);
      }));

      const enhancedCount = enhancedMetas.filter((meta, idx) =>
        meta && metas[idx] && meta.name !== metas[idx].name
      ).length;

      logger.info(`✓ Enhanced ${enhancedCount}/${metas.length} catalog items with ratings`);

      return enhancedMetas;

    } catch (error) {
      logger.error('Error enhancing catalog metas:', error.message);
      // Return original metas on error to prevent breaking the catalog
      return metas;
    }
  }

  /**
   * Enhance full meta object (for meta endpoint)
   * Adds ratings to the title and all episode titles
   * @param {Object} meta - Full meta object
   * @param {Object} config - User configuration
   * @returns {Promise<Object>} Enhanced meta object
   */
  async enhanceFullMeta(meta, config) {
    try {
      if (!config.enableRatings) {
        return meta;
      }

      // Clone meta to avoid mutation
      const enhancedMeta = { ...meta };

      // Get format configs
      const titleFormat = config.titleFormat || config.ratingFormat;
      const descriptionFormat = config.descriptionFormat || config.ratingFormat;
      const location = config.ratingLocation || 'title';

      // Main content (movie/series) rating
      // Check if catalog items should get ratings for any location
      const enableCatalogInTitle = (location === 'title' || location === 'both') &&
                                    (titleFormat.enableCatalogItems !== false);
      const enableCatalogInDescription = (location === 'description' || location === 'both') &&
                                         (descriptionFormat.enableCatalogItems !== false);

      if (enableCatalogInTitle || enableCatalogInDescription) {
        // Prefer imdb_id field if available, fall back to id
        const contentId = meta.imdb_id || meta.imdbId || meta.id;
        logger.debug(`Fetching rating for ${meta.type} "${meta.name}" using ID: ${contentId}`);

        // Derive a clean IMDb ID for metadata providers (TMDB/OMDB/MAL mapping)
        let imdbId = meta.imdb_id || meta.imdbId || (contentId && contentId.startsWith('tt') ? contentId.split(':')[0] : null);

        // If no IMDb ID present and the meta.id is from Kitsu/MAL, map to IMDb
        if (!imdbId && meta.id) {
          if (kitsuMappingService.isKitsuId(meta.id)) {
            const kitsuId = kitsuMappingService.extractKitsuId(meta.id);
            const mappedImdb = kitsuMappingService.getImdbId(kitsuId);
            if (mappedImdb) {
              imdbId = mappedImdb;
              logger.info(`Mapped Kitsu main meta to IMDb: kitsuId=${kitsuId} -> ${imdbId}`);
            }
          } else if (kitsuMappingService.isMalId(meta.id)) {
            const malId = kitsuMappingService.extractMalId(meta.id);
            const mappedImdb = kitsuMappingService.getImdbIdFromMal(malId);
            if (mappedImdb) {
              imdbId = mappedImdb;
              logger.info(`Mapped MAL main meta to IMDb: malId=${malId} -> ${imdbId}`);
            }
          }
        }

        // Prefer using the resolved IMDb ID for ratings if available
        const lookupId = imdbId || contentId;

        // Fetch rating (consolidated or traditional)
        const useConsolidated = config.useConsolidatedRating === true;
        let mainRatingData = useConsolidated
          ? await consolidatedRatingService.getConsolidatedRating(lookupId, meta.type, { region: descriptionFormat?.streamingRegion || 'US' })
          : await ratingsService.getRating(lookupId, meta.type);

        if (mainRatingData) {
          // If using consolidated ratings, fetch IMDb data for vote count and/or IMDb rating display
          if (useConsolidated && descriptionFormat && (descriptionFormat.includeVotes || descriptionFormat.includeImdbRating)) {
            const imdbData = await ratingsService.getRating(lookupId, meta.type);
            if (imdbData) {
              mainRatingData = {
                ...mainRatingData,
                ...(imdbData.votes && { votes: imdbData.votes }),
                ...(imdbData.rating && { rating: imdbData.rating })
              };
            }
          }

          // imdbId may still be null if not resolvable; keep using derived value

          // Fetch TMDB data if needed for description location
          let tmdbData = null;
          if (descriptionFormat && (descriptionFormat.includeTmdbRating || descriptionFormat.includeReleaseDate || descriptionFormat.includeStreamingServices) &&
              (location === 'description' || location === 'both') && imdbId) {
            const streamingRegion = descriptionFormat.streamingRegion || 'US';
            tmdbData = await tmdbService.getTmdbDataByImdbId(imdbId, streamingRegion);
          }

          // Fetch OMDB data if needed for description location
          let omdbData = null;
          logger.debug(`[OMDB-DIAG] Checking OMDB fetch conditions for ${meta.type} "${meta.name}": imdbId=${imdbId}, contentId=${contentId}`);
          logger.debug(`[OMDB-DIAG] Conditions: descriptionFormat=${!!descriptionFormat}, includeRT=${descriptionFormat?.includeRottenTomatoes}, includeMC=${descriptionFormat?.includeMetacritic}, location=${location}`);

          if (descriptionFormat && (descriptionFormat.includeRottenTomatoes || descriptionFormat.includeMetacritic) &&
              (location === 'description' || location === 'both') && imdbId) {
            logger.info(`[OMDB-DIAG] ✓ Fetching OMDB data for ${meta.type} "${meta.name}" with IMDb ID: ${imdbId}`);

            // Extract year from meta for better scraping accuracy
            const year = meta.year || (meta.releaseInfo && meta.releaseInfo.split('-')[0]) || null;

            omdbData = await omdbService.getOmdbDataByImdbId(imdbId, meta.type, meta.name, year);
            logger.info(`[OMDB-DIAG] OMDB fetch result for ${imdbId}: RT=${omdbData?.rottenTomatoes || 'null'}, MC=${omdbData?.metacritic || 'null'}`);
          } else {
            logger.info(`[OMDB-DIAG] ✗ OMDB fetch SKIPPED for ${meta.type} "${meta.name}": ${!descriptionFormat ? 'no descriptionFormat' : !imdbId ? 'no imdbId' : !(location === 'description' || location === 'both') ? 'wrong location' : 'RT/MC not enabled'}`);
          }

          // Fetch MAL data if needed for description location
          // Prefer extracting from original meta.id (mal:/kitsu:) rather than contentId which may be imdb_id
          let malData = null;
          if (descriptionFormat && (descriptionFormat.includeMalRating || descriptionFormat.includeMalVotes) &&
              (location === 'description' || location === 'both')) {
            const malSourceId = meta.id || contentId;
            let malId = kitsuMappingService.extractMalId(malSourceId);
            logger.debug(`Extracting MAL ID for main meta from: ${malSourceId} -> ${malId}`);
            // If not found via meta.id, try mapping from IMDb ID
            if (!malId && imdbId) {
              const mapped = kitsuMappingService.getMalIdFromImdb(imdbId);
              if (mapped) {
                logger.info(`Mapped IMDb → MAL for main meta: imdb=${imdbId} mal=${mapped}`);
                malId = mapped;
              }
            }
            if (malId) {
              malData = await malService.getMalDataByMalId(malId);
              if (malData) {
                logger.info(`✓ MAL data retrieved for main meta: ${malData.title} - ${malData.malRating}/10 (${malData.malVotes} votes)`);
              } else {
                logger.warn(`✗ MAL data fetch failed for MAL ID: ${malId}`);
              }
            } else {
              // No MAL ID found - this is expected for non-anime content, so only log at debug level
              logger.debug(`No MAL ID found (meta.id: ${meta.id || 'absent'}, contentId: ${contentId})`);
            }
          } else if (descriptionFormat && (descriptionFormat.includeMalRating || descriptionFormat.includeMalVotes)) {
            logger.debug(`MAL data not fetched: location=${location}, includeRating=${descriptionFormat.includeMalRating}, includeVotes=${descriptionFormat.includeMalVotes}`);
          }

          // Add rating to main title or description (or both)
          // Use regular location setting (not catalog-specific flags) for main meta
          const enhancedWithRating = await this._enhanceMetaWithRating(meta, mainRatingData, config, imdbId, null, tmdbData, omdbData, malData, null, useConsolidated);

          if (location === 'description') {
            enhancedMeta.description = enhancedWithRating.description;
          } else if (location === 'both') {
            enhancedMeta.name = enhancedWithRating.name;
            enhancedMeta.description = enhancedWithRating.description;
          } else {
            enhancedMeta.name = enhancedWithRating.name;
          }
          logger.debug(`Enhanced ${meta.type}: "${meta.name}" with rating ${mainRatingData.rating}`);
        } else {
          logger.debug(`No rating found for ${meta.name} (ID: ${contentId})`);
        }
      }

      // Episode ratings
      // Check if episodes should get ratings for any location
      const enableEpisodesInTitle = (location === 'title' || location === 'both') &&
                                     (titleFormat.enableEpisodes !== false);
      const enableEpisodesInDescription = (location === 'description' || location === 'both') &&
                                          (descriptionFormat.enableEpisodes !== false);

      if ((enableEpisodesInTitle || enableEpisodesInDescription) &&
          meta.videos && Array.isArray(meta.videos) && meta.videos.length > 0) {
        logger.info(`Enhancing ${meta.videos.length} episode titles with ratings`);

        // For episodes, we need to extract individual episode IMDb IDs
        // Different providers use different formats:
        // - Cinemeta: tt12345:1:1 (series:season:episode)
        // - Kitsu: kitsu:11469:1 but provides imdb_id field
        // - TMDB: tmdb:12345:1:1 but provides imdb_id field
        // Detect if the parent meta originated from Kitsu to allow season inference
        const kitsuContextId = (meta && meta.id && kitsuMappingService.isKitsuId(meta.id))
          ? kitsuMappingService.extractKitsuId(meta.id)
          : null;

        if (kitsuContextId) {
          const rec = kitsuMappingService.getRecord(kitsuContextId);
          const inferred = kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
          logger.info(`Kitsu context: meta.id=${meta.id}, kitsuId=${kitsuContextId}, inferredSeason=${inferred}, slug="${rec && rec.animePlanetId ? rec.animePlanetId : ''}", type=${rec && rec.type ? rec.type : ''}`);
        }

        const episodeItems = meta.videos
          .filter(video => video.id) // Only videos with IDs
          .map(video => {
            // Try to get individual episode IMDb ID from dedicated field first
            const episodeImdbId = video.imdb_id || video.imdbId;
            const season = video.season || video.imdbSeason;
            const episode = video.episode || video.imdbEpisode;

            // If we have IMDb ID + season + episode, format as series:season:episode
            if (episodeImdbId && episodeImdbId.startsWith('tt') && season && episode) {
              let seasonUsed = season;
              let episodeUsed = episode;

              if (kitsuContextId) {
                // Check for split-cour data first
                const splitCourKey = `kitsu:${kitsuContextId}`;
                const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);

                if (splitCourData) {
                  // Use season from split-cour data if available
                  seasonUsed = splitCourData.imdb_season || season;
                  if (splitCourData.episode_offset) {
                    episodeUsed = parseInt(String(episode), 10) + splitCourData.episode_offset;
                    logger.info(`Split-cour offset applied (batch-existing): ${splitCourKey} ep ${episode} + offset ${splitCourData.episode_offset} = ${episodeUsed}, season=${seasonUsed}`);
                  }
                } else {
                  // Fallback to season inference from slug
                  const inferred = kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
                  const seasonNum = parseInt(String(season), 10);
                  if (inferred && Number.isFinite(seasonNum) && inferred !== seasonNum) {
                    logger.info(`Kitsu season override (batch-existing): kitsuId=${kitsuContextId} providedSeason=${seasonNum} inferredSeason=${inferred}`);
                    seasonUsed = inferred;
                  }
                }
              }

              const id = `${episodeImdbId}:${seasonUsed}:${episodeUsed}`;
              if (kitsuContextId) {
                logger.info(`Kitsu episode ID map (batch-existing): kitsuId=${kitsuContextId} imdb=${episodeImdbId} season=${seasonUsed} ep=${episodeUsed} -> ${id}`);
              }
              return { id: id, type: 'series' };
            }

            // If just IMDb ID, try to infer season if coming from Kitsu and episode exists
            if (episodeImdbId && episodeImdbId.startsWith('tt')) {
              if (kitsuContextId && episode && !season) {
                let seasonNum;
                let episodeUsed = episode;

                // Check for split-cour data first
                const splitCourKey = `kitsu:${kitsuContextId}`;
                const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);

                if (splitCourData) {
                  // Use season from split-cour data if available
                  seasonNum = splitCourData.imdb_season || kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
                  if (splitCourData.episode_offset) {
                    episodeUsed = parseInt(String(episode), 10) + splitCourData.episode_offset;
                    logger.info(`Split-cour offset applied (batch-direct): ${splitCourKey} ep ${episode} + offset ${splitCourData.episode_offset} = ${episodeUsed}, season=${seasonNum}`);
                  }
                } else {
                  // Fallback to season inference from slug
                  seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
                }

                const id = `${episodeImdbId}:${seasonNum}:${episodeUsed}`;
                logger.info(`Kitsu episode ID map (batch-direct): kitsuId=${kitsuContextId} imdb=${episodeImdbId} season=${seasonNum} ep=${episodeUsed} -> ${id}`);
                return { id: id, type: 'series' };
              }
              // No season/episode info; fall back to series-level
              return { id: episodeImdbId, type: 'series' };
            }

            // If video ID is Kitsu format, try to map the series and preserve season/episode
            if (video.id && kitsuMappingService.isKitsuId(video.id)) {
              // Check if video.id is in format kitsu:12345:1 (with episode number)
              const parts = video.id.split(':');
              if (parts.length >= 3 && parts[0] === 'kitsu') {
                const kitsuId = parts[1];
                let episodeNum = parseInt(parts[2], 10);
                const imdbId = kitsuMappingService.getImdbId(kitsuId);
                if (imdbId) {
                  // Check for split-cour episode offset
                  const splitCourKey = `kitsu:${kitsuId}`;
                  const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);

                  let seasonNum;
                  if (splitCourData) {
                    // Use season from split-cour data if available
                    seasonNum = splitCourData.imdb_season || kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
                    if (splitCourData.episode_offset) {
                      episodeNum += splitCourData.episode_offset;
                      logger.info(`Split-cour offset applied (batch): ${splitCourKey} ep ${parts[2]} + offset ${splitCourData.episode_offset} = ${episodeNum}, season=${seasonNum}`);
                    }
                  } else {
                    // Infer season number from mapping metadata (anime-planet slug), fallback to 1
                    seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
                  }

                  const formattedId = `${imdbId}:${seasonNum}:${episodeNum}`;
                  logger.info(`Kitsu episode ID map (batch): kitsuId=${kitsuId} imdb=${imdbId} season=${seasonNum} ep=${episodeNum} -> ${formattedId}`);
                  return { id: formattedId, type: 'series' };
                } else {
                  logger.info(`Kitsu episode ID map (batch): kitsuId=${kitsuId} has no imdb mapping`);
                }
              } else {
                // Just kitsu:12345 format
                const kitsuId = kitsuMappingService.extractKitsuId(video.id);
                const imdbId = kitsuMappingService.getImdbId(kitsuId);
                if (imdbId) {
                  return { id: imdbId, type: 'series' };
                }
              }
            }

            // If video ID is MAL format, try to map the series and preserve season/episode
            if (video.id && kitsuMappingService.isMalId(video.id)) {
              // Check if video.id is in format mal:12345:1:1 (with season:episode)
              const parts = video.id.split(':');
              if (parts.length >= 4 && parts[0] === 'mal') {
                const malId = parts[1];
                const season = parts[2];
                const episodeNum = parts[3];
                const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
                if (imdbId) {
                  // Format as IMDb series:season:episode
                  const formattedId = `${imdbId}:${season}:${episodeNum}`;
                  return { id: formattedId, type: 'series' };
                }
              } else {
                // Just mal:12345 format
                const malId = kitsuMappingService.extractMalId(video.id);
                const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
                if (imdbId) {
                  return { id: imdbId, type: 'series' };
                }
              }
            }

            // Otherwise use the video ID as-is (might be series:season:episode format)
            return { id: video.id, type: 'series' };
          });

        // Fetch all episode ratings in batch
        const episodeRatingsMap = await ratingsService.getRatingsBatch(episodeItems, 10);

        // Build location string for episodes
        let episodeLocation = 'title';
        if (enableEpisodesInTitle && enableEpisodesInDescription) {
          episodeLocation = 'both';
        } else if (enableEpisodesInDescription) {
          episodeLocation = 'description';
        }

        // ⚡ OPTIMIZATION: Fetch series-level data ONCE for all episodes (these are per-series, not per-episode)

        // Extract series IMDb ID (needed for TMDB/OMDB lookups)
        let seriesImdbId = meta.imdb_id || meta.imdbId || (meta.id && meta.id.startsWith('tt') ? meta.id.split(':')[0] : null);

        // If no IMDb ID present and the meta.id is from Kitsu/MAL, map to IMDb
        if (!seriesImdbId && meta.id) {
          if (kitsuMappingService.isKitsuId(meta.id)) {
            const kitsuId = kitsuMappingService.extractKitsuId(meta.id);
            const mappedImdb = kitsuMappingService.getImdbId(kitsuId);
            if (mappedImdb) {
              seriesImdbId = mappedImdb;
              logger.debug(`[ENHANCE] Mapped Kitsu series to IMDb for episodes: kitsuId=${kitsuId} -> ${seriesImdbId}`);
            }
          } else if (kitsuMappingService.isMalId(meta.id)) {
            const malId = kitsuMappingService.extractMalId(meta.id);
            const mappedImdb = kitsuMappingService.getImdbIdFromMal(malId);
            if (mappedImdb) {
              seriesImdbId = mappedImdb;
              logger.debug(`[ENHANCE] Mapped MAL series to IMDb for episodes: malId=${malId} -> ${seriesImdbId}`);
            }
          }
        }

        // Fetch OMDB data (RT/MC) once
        let seriesOmdbData = null;
        if (descriptionFormat && (descriptionFormat.includeRottenTomatoes || descriptionFormat.includeMetacritic) &&
            (episodeLocation === 'description' || episodeLocation === 'both')) {
          if (seriesImdbId) {
            const seriesYear = meta.year || null;
            seriesOmdbData = await omdbService.getOmdbDataByImdbId(seriesImdbId, 'series', meta.name, seriesYear);
            if (seriesOmdbData) {
              logger.debug(`[ENHANCE] Fetched series OMDB data once for all episodes: ${seriesImdbId}`);
            }
          }
        }

        // Fetch TMDB data once
        let seriesTmdbData = null;
        if (descriptionFormat && (descriptionFormat.includeTmdbRating || descriptionFormat.includeReleaseDate) &&
            (episodeLocation === 'description' || episodeLocation === 'both')) {
          if (seriesImdbId) {
            const streamingRegion = descriptionFormat.streamingRegion || 'US';
            seriesTmdbData = await tmdbService.getTmdbDataByImdbId(seriesImdbId, streamingRegion);
            if (seriesTmdbData) {
              logger.debug(`[ENHANCE] Fetched series TMDB data once for all episodes: ${seriesImdbId}`);
            }
          }
        }

        // Fetch MAL data once (for anime)
        let seriesMalData = null;
        if (descriptionFormat && (descriptionFormat.includeMalRating || descriptionFormat.includeMalVotes) &&
            (episodeLocation === 'description' || episodeLocation === 'both')) {
          // Extract MAL ID from the series meta ID
          const seriesMalId = kitsuMappingService.extractMalId(meta.id);
          if (seriesMalId) {
            seriesMalData = await malService.getMalDataByMalId(seriesMalId);
            if (seriesMalData) {
              logger.debug(`[ENHANCE] Fetched series MAL data once for all episodes: ${seriesMalId}`);
            }
          }
        }

        // Enhance each episode title (now using async)
        enhancedMeta.videos = await Promise.all(meta.videos.map(async video => {
          if (!video.id) return video;

          // Use the SAME logic to construct the ID as we did when fetching ratings
          let lookupId = video.id;

          const episodeImdbId = video.imdb_id || video.imdbId;
          const season = video.season || video.imdbSeason;
          const episode = video.episode || video.imdbEpisode;

          // If we have IMDb ID + season + episode, use that format
          if (episodeImdbId && episodeImdbId.startsWith('tt') && season && episode) {
            let seasonUsed = season;
            let episodeUsed = episode;

            if (meta && meta.id && kitsuMappingService.isKitsuId(meta.id)) {
              const kitsuId = kitsuMappingService.extractKitsuId(meta.id);

              // Check for split-cour data first
              const splitCourKey = `kitsu:${kitsuId}`;
              const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);

              if (splitCourData) {
                // Use season from split-cour data if available
                seasonUsed = splitCourData.imdb_season || season;
                if (splitCourData.episode_offset) {
                  episodeUsed = parseInt(String(episode), 10) + splitCourData.episode_offset;
                  logger.info(`Split-cour offset applied (enhance-existing): ${splitCourKey} ep ${episode} + offset ${splitCourData.episode_offset} = ${episodeUsed}, season=${seasonUsed}`);
                }
              } else {
                // Fallback to season inference from slug
                const inferred = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
                const seasonNum = parseInt(String(season), 10);
                if (inferred && Number.isFinite(seasonNum) && inferred !== seasonNum) {
                  logger.info(`Kitsu season override (enhance-existing): kitsuId=${kitsuId} providedSeason=${seasonNum} inferredSeason=${inferred}`);
                  seasonUsed = inferred;
                }
              }

              lookupId = `${episodeImdbId}:${seasonUsed}:${episodeUsed}`;
              logger.info(`Kitsu episode ID map (enhance-existing): kitsuId=${kitsuId} imdb=${episodeImdbId} season=${seasonUsed} ep=${episodeUsed} -> ${lookupId}`);
            } else {
              lookupId = `${episodeImdbId}:${season}:${episode}`;
            }
          }
          // If just IMDb ID, attempt season inference for Kitsu context when episode exists
          else if (episodeImdbId && episodeImdbId.startsWith('tt')) {
            if (meta && meta.id && kitsuMappingService.isKitsuId(meta.id) && episode && !season) {
              const kitsuId = kitsuMappingService.extractKitsuId(meta.id);
              const seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
              lookupId = `${episodeImdbId}:${seasonNum}:${episode}`;
              logger.info(`Kitsu episode ID map (enhance-direct): kitsuId=${kitsuId} imdb=${episodeImdbId} season=${seasonNum} ep=${episode} -> ${lookupId}`);
            } else {
              lookupId = episodeImdbId;
            }
          }
          // If Kitsu format, reconstruct the mapped ID
          else if (video.id && kitsuMappingService.isKitsuId(video.id)) {
            const parts = video.id.split(':');
            if (parts.length >= 3 && parts[0] === 'kitsu') {
              const kitsuId = parts[1];
              let episodeNum = parseInt(parts[2], 10);
              const imdbId = kitsuMappingService.getImdbId(kitsuId);
              if (imdbId) {
                // Check for split-cour episode offset
                const splitCourKey = `kitsu:${kitsuId}`;
                const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);

                let seasonNum;
                if (splitCourData) {
                  // Use season from split-cour data if available
                  seasonNum = splitCourData.imdb_season || kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
                  if (splitCourData.episode_offset) {
                    episodeNum += splitCourData.episode_offset;
                    logger.info(`Split-cour offset applied (enhance): ${splitCourKey} ep ${parts[2]} + offset ${splitCourData.episode_offset} = ${episodeNum}, season=${seasonNum}`);
                  }
                } else {
                  // Infer season number from mapping metadata (anime-planet slug), fallback to 1
                  seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
                }

                lookupId = `${imdbId}:${seasonNum}:${episodeNum}`;
                logger.info(`Kitsu episode ID map (enhance): kitsuId=${kitsuId} imdb=${imdbId} season=${seasonNum} ep=${episodeNum} -> ${lookupId}`);
              } else {
                logger.info(`Kitsu episode ID map (enhance): kitsuId=${kitsuId} has no imdb mapping`);
              }
            }
          }
          // If MAL format, reconstruct the mapped ID
          else if (video.id && kitsuMappingService.isMalId(video.id)) {
            const parts = video.id.split(':');
            if (parts.length >= 4 && parts[0] === 'mal') {
              const malId = parts[1];
              const seasonNum = parts[2];
              const episodeNum = parts[3];
              const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
              if (imdbId) {
                lookupId = `${imdbId}:${seasonNum}:${episodeNum}`;
              }
            }
          }

          // Look up the rating using the constructed ID
          const episodeRatingData = episodeRatingsMap.get(lookupId);

          if (!episodeRatingData) return video;

          // Clone video object
          const enhancedVideo = { ...video };

          // Get IMDb ID for MPAA lookup (use different variable name to avoid conflict)
          const mpaaLookupId = video.imdb_id || video.imdbId || (lookupId.startsWith('tt') ? lookupId.split(':')[0] : null);

          // ⚡ OPTIMIZATION: Reuse series-level data (already fetched once above)
          // TMDB, OMDB, and MAL ratings are all per-series, not per-episode
          const episodeTmdbData = seriesTmdbData;
          const episodeOmdbData = seriesOmdbData;
          const episodeMalData = seriesMalData;

          // Create a temporary meta-like object to use the enhancer
          // Different addons use different fields: Cinemeta uses 'name', others may use 'title'
          const episodeName = video.name || video.title;
          const episodeDescription = video.description || video.overview || '';
          const tempMeta = { name: episodeName, description: episodeDescription };
          // Episodes always use IMDb ratings for titles (only IMDb has episode-level data)
          // But series-level consolidated rating can appear in description metadata
          const enhanced = await this._enhanceMetaWithRating(tempMeta, episodeRatingData, config, mpaaLookupId, null, episodeTmdbData, episodeOmdbData, episodeMalData, episodeLocation, false);

          // Update the appropriate field(s) based on episodeLocation (not config.ratingLocation)
          if (episodeLocation === 'description') {
            // Update description/overview field
            // Try to update existing fields, or add overview if neither exists
            if ('overview' in video) {
              enhancedVideo.overview = enhanced.description;
            } else if ('description' in video) {
              enhancedVideo.description = enhanced.description;
            } else {
              // If neither exists, add overview (most common for episodes)
              enhancedVideo.overview = enhanced.description;
            }
          } else if (episodeLocation === 'both') {
            // Update both name/title and description
            if (video.name) {
              enhancedVideo.name = enhanced.name;
            }
            if (video.title) {
              enhancedVideo.title = enhanced.name;
            }
            // Also update description
            if ('overview' in video) {
              enhancedVideo.overview = enhanced.description;
            } else if ('description' in video) {
              enhancedVideo.description = enhanced.description;
            } else {
              enhancedVideo.overview = enhanced.description;
            }
          } else {
            // Update name/title field (default behavior)
            if (video.name) {
              enhancedVideo.name = enhanced.name;
            }
            if (video.title) {
              enhancedVideo.title = enhanced.name;
            }
          }

          return enhancedVideo;
        }));

        const enhancedEpisodeCount = enhancedMeta.videos.filter((video, idx) =>
          video.name !== meta.videos[idx].name
        ).length;

        logger.info(`✓ Enhanced ${enhancedEpisodeCount}/${meta.videos.length} episode titles`);
      }

      return enhancedMeta;

    } catch (error) {
      logger.error('Error enhancing full meta:', error.message);
      return meta;
    }
  }
}

module.exports = new MetadataEnhancerService();
