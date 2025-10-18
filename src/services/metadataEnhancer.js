/**
 * Metadata Enhancer Service
 * Enhances meta objects with ratings information
 */

const logger = require('../utils/logger');
const ratingsService = require('./ratingsService');
const kitsuMappingService = require('./kitsuMappingService');
const tmdbService = require('./tmdbService');
const omdbService = require('./omdbService');

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
   * @param {Object} ratingData - Rating data object {rating, votes}
   * @param {Object} formatConfig - Format configuration {position, template, separator}
   * @returns {string} Enhanced title
   * @private
   */
  _formatTitleRating(title, ratingData, formatConfig) {
    if (!ratingData || !ratingData.rating) return title;

    const ratingText = formatConfig.template.replace('{rating}', ratingData.rating.toFixed(1));

    if (formatConfig.position === 'prefix') {
      return `${ratingText}${formatConfig.separator}${title}`;
    } else {
      return `${title}${formatConfig.separator}${ratingText}`;
    }
  }

  /**
   * Formats rating for description injection (with extended metadata support)
   * @param {string} description - Original description
   * @param {Object} ratingData - Rating data object {rating, votes}
   * @param {Object} formatConfig - Format configuration {position, template, separator, includeVotes, includeMpaa, includeTmdbRating, includeReleaseDate, includeRottenTomatoes, includeMetacritic}
   * @param {string} imdbId - IMDb ID for MPAA lookup (optional)
   * @param {string} mpaaRating - Pre-fetched MPAA rating (optional, to avoid individual lookups)
   * @param {Object} tmdbData - Pre-fetched TMDB data (optional)
   * @param {Object} omdbData - Pre-fetched OMDB data (optional)
   * @returns {Promise<string>} Enhanced description
   * @private
   */
  async _formatDescriptionRating(description, ratingData, formatConfig, imdbId = null, mpaaRating = null, tmdbData = null, omdbData = null) {
    if (!ratingData || !ratingData.rating) return description;

    // Build rating template
    let template = formatConfig.template.replace('{rating}', ratingData.rating.toFixed(1));

    // Build metadata parts array
    const metadataParts = [template];

    // Compute each extended metadata text (do not push yet)
    const partTexts = {};

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

    // Streaming Services (TMDB)
    if (formatConfig.includeStreamingServices && tmdbData && tmdbData.streamingProviders && tmdbData.streamingProviders.length > 0) {
      partTexts.streamingServices = tmdbData.streamingProviders.join(', ');
      logger.info(`[STREAMING] Found services: ${partTexts.streamingServices}`);
    } else if (formatConfig.includeStreamingServices) {
      logger.info(`[STREAMING] Requested but not available. tmdbData=${!!tmdbData}, streamingProviders=${tmdbData?.streamingProviders}, length=${tmdbData?.streamingProviders?.length}`);
    }

    // Apply ordering if provided; otherwise keep default order
    const allowedKeys = ['votes','mpaa','tmdb','releaseDate','streamingServices','rottenTomatoes','metacritic'];
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
   * @param {string} locationOverride - Override the config location (optional)
   * @returns {Promise<Object>} Enhanced meta object
   * @private
   */
  async _enhanceMetaWithRating(meta, ratingData, config, imdbId = null, mpaaRating = null, tmdbData = null, omdbData = null, locationOverride = null) {
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
      enhancedMeta.name = this._formatTitleRating(meta.name, ratingData, titleFormat);
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
        omdbData
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

      // Fetch all ratings in batch
      const ratingsMap = await ratingsService.getRatingsBatch(items);

      // Batch fetch MPAA ratings if enabled and using description location
      let mpaaMap = new Map();

      if (config.enableRatings && descriptionFormat && descriptionFormat.includeMpaa &&
          (location === 'description' || location === 'both')) {

        // Extract unique IMDb IDs from metas that have ratings
        const imdbIds = metas
          .map((meta, index) => {
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
        // Find the item we used for this meta
        const item = items.find(item => item.originalIndex === index);
        if (!item) {
          return meta; // No item means we filtered it out
        }

        const ratingData = ratingsMap.get(item.id);

        if (!ratingData) {
          return meta;
        }

        // Get IMDb ID and MPAA rating (if pre-fetched)
        const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
        const mpaaRating = imdbId ? mpaaMap.get(imdbId) : null;
        const tmdbData = imdbId ? tmdbMap.get(imdbId) : null;
        const omdbData = imdbId ? omdbMap.get(imdbId) : null;

        // Pass catalogLocation to override the config location for catalog items
        return await this._enhanceMetaWithRating(meta, ratingData, config, imdbId, mpaaRating, tmdbData, omdbData, catalogLocation);
      }));

      const enhancedCount = enhancedMetas.filter((meta, idx) =>
        meta.name !== metas[idx].name
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

        const mainRatingData = await ratingsService.getRating(contentId, meta.type);

        if (mainRatingData) {
          // Get IMDb ID for MPAA lookup
          const imdbId = meta.imdb_id || meta.imdbId || (contentId && contentId.startsWith('tt') ? contentId.split(':')[0] : null);

          // Fetch TMDB data if needed for description location
          let tmdbData = null;
          if (descriptionFormat && (descriptionFormat.includeTmdbRating || descriptionFormat.includeReleaseDate || descriptionFormat.includeStreamingServices) &&
              (location === 'description' || location === 'both') && imdbId) {
            const streamingRegion = descriptionFormat.streamingRegion || 'US';
            tmdbData = await tmdbService.getTmdbDataByImdbId(imdbId, streamingRegion);
          }

          // Fetch OMDB data if needed for description location
          let omdbData = null;
          if (descriptionFormat && (descriptionFormat.includeRottenTomatoes || descriptionFormat.includeMetacritic) &&
              (location === 'description' || location === 'both') && imdbId) {
            omdbData = await omdbService.getOmdbDataByImdbId(imdbId);
          }

          // Build location string based on what's enabled for catalog items
          let catalogLocation = 'title';
          if (enableCatalogInTitle && enableCatalogInDescription) {
            catalogLocation = 'both';
          } else if (enableCatalogInDescription) {
            catalogLocation = 'description';
          }

          // Add rating to main title or description (or both)
          const enhancedWithRating = await this._enhanceMetaWithRating(meta, mainRatingData, config, imdbId, null, tmdbData, omdbData, catalogLocation);

          if (catalogLocation === 'description') {
            enhancedMeta.description = enhancedWithRating.description;
          } else if (catalogLocation === 'both') {
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
              if (kitsuContextId) {
                const inferred = kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
                const seasonNum = parseInt(String(season), 10);
                if (inferred && Number.isFinite(seasonNum) && inferred !== seasonNum) {
                  logger.info(`Kitsu season override (batch-existing): kitsuId=${kitsuContextId} providedSeason=${seasonNum} inferredSeason=${inferred}`);
                  seasonUsed = inferred;
                }
              }
              const id = `${episodeImdbId}:${seasonUsed}:${episode}`;
              if (kitsuContextId) {
                logger.info(`Kitsu episode ID map (batch-existing): kitsuId=${kitsuContextId} imdb=${episodeImdbId} season=${seasonUsed} ep=${episode} -> ${id}`);
              }
              return { id: id, type: 'series' };
            }

            // If just IMDb ID, try to infer season if coming from Kitsu and episode exists
            if (episodeImdbId && episodeImdbId.startsWith('tt')) {
              if (kitsuContextId && episode && !season) {
                const seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuContextId, meta.name);
                const id = `${episodeImdbId}:${seasonNum}:${episode}`;
                logger.info(`Kitsu episode ID map (batch-direct): kitsuId=${kitsuContextId} imdb=${episodeImdbId} season=${seasonNum} ep=${episode} -> ${id}`);
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
                  // Infer season number from mapping metadata (anime-planet slug), fallback to 1
                  const seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);

                  // Check for split-cour episode offset
                  const splitCourKey = `kitsu:${kitsuId}`;
                  const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);
                  if (splitCourData && splitCourData.episode_offset) {
                    episodeNum += splitCourData.episode_offset;
                    logger.info(`Split-cour offset applied (batch): ${splitCourKey} ep ${parts[2]} + offset ${splitCourData.episode_offset} = ${episodeNum}`);
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
        const episodeRatingsMap = await ratingsService.getRatingsBatch(episodeItems);

        // Build location string for episodes
        let episodeLocation = 'title';
        if (enableEpisodesInTitle && enableEpisodesInDescription) {
          episodeLocation = 'both';
        } else if (enableEpisodesInDescription) {
          episodeLocation = 'description';
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
            if (meta && meta.id && kitsuMappingService.isKitsuId(meta.id)) {
              const kitsuId = kitsuMappingService.extractKitsuId(meta.id);
              const inferred = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);
              const seasonNum = parseInt(String(season), 10);
              if (inferred && Number.isFinite(seasonNum) && inferred !== seasonNum) {
                logger.info(`Kitsu season override (enhance-existing): kitsuId=${kitsuId} providedSeason=${seasonNum} inferredSeason=${inferred}`);
                seasonUsed = inferred;
              }
              lookupId = `${episodeImdbId}:${seasonUsed}:${episode}`;
              logger.info(`Kitsu episode ID map (enhance-existing): kitsuId=${kitsuId} imdb=${episodeImdbId} season=${seasonUsed} ep=${episode} -> ${lookupId}`);
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
                const seasonNum = kitsuMappingService.getSeasonForKitsu(kitsuId, meta.name);

                // Check for split-cour episode offset
                const splitCourKey = `kitsu:${kitsuId}`;
                const splitCourData = kitsuMappingService.getSplitCourOffset(splitCourKey);
                if (splitCourData && splitCourData.episode_offset) {
                  episodeNum += splitCourData.episode_offset;
                  logger.info(`Split-cour offset applied (enhance): ${splitCourKey} ep ${parts[2]} + offset ${splitCourData.episode_offset} = ${episodeNum}`);
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

          // Fetch TMDB data if needed for description location
          // Note: For episodes, we don't typically have TMDB data, but we include the hook for completeness
          let episodeTmdbData = null;
          if (descriptionFormat && (descriptionFormat.includeTmdbRating || descriptionFormat.includeReleaseDate) &&
              (episodeLocation === 'description' || episodeLocation === 'both') && mpaaLookupId) {
            // Only fetch if the episode location uses description
            episodeTmdbData = await tmdbService.getTmdbDataByImdbId(mpaaLookupId);
          }

          // Fetch OMDB data if needed for description location
          let episodeOmdbData = null;
          if (descriptionFormat && (descriptionFormat.includeRottenTomatoes || descriptionFormat.includeMetacritic) &&
              (episodeLocation === 'description' || episodeLocation === 'both') && mpaaLookupId) {
            // Only fetch if the episode location uses description
            episodeOmdbData = await omdbService.getOmdbDataByImdbId(mpaaLookupId);
          }

          // Create a temporary meta-like object to use the enhancer
          // Different addons use different fields: Cinemeta uses 'name', others may use 'title'
          const episodeName = video.name || video.title;
          const episodeDescription = video.description || video.overview || '';
          const tempMeta = { name: episodeName, description: episodeDescription };
          const enhanced = await this._enhanceMetaWithRating(tempMeta, episodeRatingData, config, mpaaLookupId, null, episodeTmdbData, episodeOmdbData, episodeLocation);

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
