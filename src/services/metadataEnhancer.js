/**
 * Metadata Enhancer Service
 * Enhances meta objects with ratings information
 */

const logger = require('../utils/logger');
const ratingsService = require('./ratingsService');
const kitsuMappingService = require('./kitsuMappingService');

class MetadataEnhancerService {
  /**
   * Formats vote count to human-readable format (e.g., 1.2M, 450K)
   * @param {number} votes - Vote count
   * @returns {string} Formatted vote count
   * @private
   */
  _formatVoteCount(votes) {
    if (!votes) return '';
    const count = typeof votes === 'string' ? parseInt(votes) : votes;
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${Math.floor(count / 1000)}K`;
    return count.toString();
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
   * @param {Object} formatConfig - Format configuration {position, template, separator, includeVotes, includeMpaa}
   * @param {string} imdbId - IMDb ID for MPAA lookup (optional)
   * @param {string} mpaaRating - Pre-fetched MPAA rating (optional, to avoid individual lookups)
   * @returns {Promise<string>} Enhanced description
   * @private
   */
  async _formatDescriptionRating(description, ratingData, formatConfig, imdbId = null, mpaaRating = null) {
    if (!ratingData || !ratingData.rating) return description;

    // Build rating template
    let template = formatConfig.template.replace('{rating}', ratingData.rating.toFixed(1));

    // Build metadata parts array
    const metadataParts = [template];

    // Add vote count if enabled and available
    if (formatConfig.includeVotes && ratingData.votes) {
      const formattedVotes = this._formatVoteCount(ratingData.votes);
      metadataParts.push(`${formattedVotes} votes`);
    }

    // Add MPAA rating if enabled and available
    // Use pre-fetched rating if provided, otherwise fetch individually (fallback)
    if (formatConfig.includeMpaa && (mpaaRating || imdbId)) {
      const mpaa = mpaaRating || (imdbId ? await ratingsService.getMpaaRating(imdbId) : null);
      if (mpaa) {
        metadataParts.push(`Rated ${mpaa}`);
      }
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
   * @returns {Promise<Object>} Enhanced meta object
   * @private
   */
  async _enhanceMetaWithRating(meta, ratingData, config, imdbId = null, mpaaRating = null) {
    if (!ratingData || !config) {
      return meta;
    }

    // Clone meta to avoid mutation
    const enhancedMeta = { ...meta };
    const location = config.ratingLocation || 'title';

    // Determine which formats to use (with backwards compatibility)
    const titleFormat = config.titleFormat || config.ratingFormat;
    const descriptionFormat = config.descriptionFormat || config.ratingFormat;

    // Handle title injection
    if (location === 'title' || location === 'both') {
      enhancedMeta.name = this._formatTitleRating(meta.name, ratingData, titleFormat);
      logger.debug(`Enhanced title: "${meta.name}" -> "${enhancedMeta.name}"`);
    }

    // Handle description injection
    if (location === 'description' || location === 'both') {
      const originalDesc = meta.description || '';
      enhancedMeta.description = await this._formatDescriptionRating(
        originalDesc,
        ratingData,
        descriptionFormat,
        imdbId,
        mpaaRating
      );
      logger.debug(`Enhanced description: "${originalDesc.substring(0, 50)}..." -> "${enhancedMeta.description.substring(0, 50)}..."`);
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
      // If ratings are disabled globally or for titles specifically, return original metas
      if (!config.enableRatings || !config.enableTitleRatings) {
        logger.debug('Title ratings disabled, returning original metas');
        return metas;
      }

      logger.info(`Enhancing ${metas.length} catalog items with ratings`);

      // Debug: Log first item to see structure
      if (metas.length > 0) {
        logger.debug('Sample catalog item structure:', JSON.stringify(metas[0]).substring(0, 500));
        logger.debug('Sample item IDs - imdb_id:', metas[0].imdb_id, 'imdbId:', metas[0].imdbId, 'id:', metas[0].id);
      }

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
              logger.debug(`Mapped Kitsu ID ${kitsuId} to IMDb ID ${imdbId}`);
              id = imdbId;
            } else {
              logger.debug(`No IMDb mapping found for Kitsu ID ${kitsuId}`);
            }
          }

          // If this is a MAL ID, try to map it to IMDb ID
          if (kitsuMappingService.isMalId(id)) {
            const malId = kitsuMappingService.extractMalId(id);
            const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
            if (imdbId) {
              logger.debug(`Mapped MAL ID ${malId} to IMDb ID ${imdbId}`);
              id = imdbId;
            } else {
              logger.debug(`No IMDb mapping found for MAL ID ${malId}`);
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
        logger.debug('Sample meta object:', JSON.stringify(metas[0]));
        return metas;
      }

      // Debug: Log sample to see ID format
      if (items.length > 0) {
        logger.debug(`Sample catalog item ID: ${items[0].id} (type: ${items[0].type})`);
      }

      // Fetch all ratings in batch
      const ratingsMap = await ratingsService.getRatingsBatch(items);

      // Batch fetch MPAA ratings if enabled and using description location
      let mpaaMap = new Map();
      const descriptionFormat = config.descriptionFormat || config.ratingFormat;
      const location = config.ratingLocation || 'title';

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

      // Enhance each meta with its rating (now using async)
      // We need to map back using the same ID we used for fetching
      const enhancedMetas = await Promise.all(metas.map(async (meta, index) => {
        // Find the item we used for this meta
        const item = items.find(item => item.originalIndex === index);
        if (!item) {
          logger.debug(`No item found for meta at index ${index}`);
          return meta; // No item means we filtered it out
        }

        const ratingData = ratingsMap.get(item.id);

        if (!ratingData) {
          logger.debug(`No rating found for ${item.id}`);
          return meta;
        }

        // Get IMDb ID and MPAA rating (if pre-fetched)
        const imdbId = meta.imdb_id || meta.imdbId || (item.id.startsWith('tt') ? item.id.split(':')[0] : null);
        const mpaaRating = imdbId ? mpaaMap.get(imdbId) : null;

        return await this._enhanceMetaWithRating(meta, ratingData, config, imdbId, mpaaRating);
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

      // Get rating for the main content (movie/series) - only if title ratings are enabled
      if (config.enableTitleRatings) {
        // Prefer imdb_id field if available, fall back to id
        const contentId = meta.imdb_id || meta.imdbId || meta.id;
        logger.debug(`Fetching rating for ${meta.type} "${meta.name}" using ID: ${contentId}`);

        const mainRatingData = await ratingsService.getRating(contentId, meta.type);

        if (mainRatingData) {
          // Get IMDb ID for MPAA lookup
          const imdbId = meta.imdb_id || meta.imdbId || (contentId && contentId.startsWith('tt') ? contentId.split(':')[0] : null);

          // Add rating to main title or description (or both)
          const enhancedWithRating = await this._enhanceMetaWithRating(meta, mainRatingData, config, imdbId);

          const location = config.ratingLocation || 'title';
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

      // Enhance episode titles if this is a series with videos (episodes) - only if episode ratings are enabled
      if (config.enableEpisodeRatings && meta.videos && Array.isArray(meta.videos) && meta.videos.length > 0) {
        logger.info(`Enhancing ${meta.videos.length} episode titles with ratings`);
        logger.info('First episode sample:', JSON.stringify(meta.videos[0]));
        logger.info('First episode video.id:', meta.videos[0].id);

        // For episodes, we need to extract individual episode IMDb IDs
        // Different providers use different formats:
        // - Cinemeta: tt12345:1:1 (series:season:episode)
        // - Kitsu: kitsu:11469:1 but provides imdb_id field
        // - TMDB: tmdb:12345:1:1 but provides imdb_id field
        const episodeItems = meta.videos
          .filter(video => video.id) // Only videos with IDs
          .map(video => {
            // Try to get individual episode IMDb ID from dedicated field first
            const episodeImdbId = video.imdb_id || video.imdbId;
            const season = video.season || video.imdbSeason;
            const episode = video.episode || video.imdbEpisode;

            // If we have IMDb ID + season + episode, format as series:season:episode
            if (episodeImdbId && episodeImdbId.startsWith('tt') && season && episode) {
              const id = `${episodeImdbId}:${season}:${episode}`;
              logger.debug(`Episode ${video.id} formatted as: ${id}`);
              return { id: id, type: 'series' };
            }

            // If just IMDb ID, use it directly (might be series-level)
            if (episodeImdbId && episodeImdbId.startsWith('tt')) {
              logger.debug(`Episode ${video.id} has IMDb ID: ${episodeImdbId}`);
              return { id: episodeImdbId, type: 'series' };
            }

            // If video ID is Kitsu format, try to map the series and preserve season/episode
            if (video.id && kitsuMappingService.isKitsuId(video.id)) {
              // Check if video.id is in format kitsu:12345:1 (with episode number)
              const parts = video.id.split(':');
              if (parts.length >= 3 && parts[0] === 'kitsu') {
                const kitsuId = parts[1];
                const episodeNum = parts[2];
                const imdbId = kitsuMappingService.getImdbId(kitsuId);
                if (imdbId) {
                  // Kitsu uses single season (season 1), format as IMDb series:1:episode
                  const formattedId = `${imdbId}:1:${episodeNum}`;
                  logger.debug(`Mapped Kitsu episode ${video.id} to ${formattedId}`);
                  return { id: formattedId, type: 'series' };
                }
              } else {
                // Just kitsu:12345 format
                const kitsuId = kitsuMappingService.extractKitsuId(video.id);
                const imdbId = kitsuMappingService.getImdbId(kitsuId);
                if (imdbId) {
                  logger.debug(`Mapped Kitsu episode ${video.id} to series IMDb ID ${imdbId}`);
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
                  logger.debug(`Mapped MAL episode ${video.id} to ${formattedId}`);
                  return { id: formattedId, type: 'series' };
                }
              } else {
                // Just mal:12345 format
                const malId = kitsuMappingService.extractMalId(video.id);
                const imdbId = kitsuMappingService.getImdbIdFromMal(malId);
                if (imdbId) {
                  logger.debug(`Mapped MAL episode ${video.id} to series IMDb ID ${imdbId}`);
                  return { id: imdbId, type: 'series' };
                }
              }
            }

            // Otherwise use the video ID as-is (might be series:season:episode format)
            return { id: video.id, type: 'series' };
          });

        logger.info(`Extracted ${episodeItems.length} episode IDs`);
        if (episodeItems.length > 0) {
          logger.info('First episode ID sample:', episodeItems[0].id);
          logger.info('First 5 episode IDs:', episodeItems.slice(0, 5).map(e => e.id));
          logger.info('Original first episode video.id:', meta.videos[0].id);
        }

        // Fetch all episode ratings in batch
        const episodeRatingsMap = await ratingsService.getRatingsBatch(episodeItems);
        logger.debug(`Got ${episodeRatingsMap.size} episode ratings from ${episodeItems.length} episodes`);

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
            lookupId = `${episodeImdbId}:${season}:${episode}`;
          }
          // If just IMDb ID, use it directly
          else if (episodeImdbId && episodeImdbId.startsWith('tt')) {
            lookupId = episodeImdbId;
          }
          // If Kitsu format, reconstruct the mapped ID
          else if (video.id && kitsuMappingService.isKitsuId(video.id)) {
            const parts = video.id.split(':');
            if (parts.length >= 3 && parts[0] === 'kitsu') {
              const kitsuId = parts[1];
              const episodeNum = parts[2];
              const imdbId = kitsuMappingService.getImdbId(kitsuId);
              if (imdbId) {
                lookupId = `${imdbId}:1:${episodeNum}`;
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
          logger.debug(`Looking up rating for ${lookupId}: ${episodeRatingData ? 'found' : 'not found'}`);

          if (!episodeRatingData) return video;

          // Clone video object
          const enhancedVideo = { ...video };

          // Get IMDb ID for MPAA lookup (use different variable name to avoid conflict)
          const mpaaLookupId = video.imdb_id || video.imdbId || (lookupId.startsWith('tt') ? lookupId.split(':')[0] : null);

          // Create a temporary meta-like object to use the enhancer
          // Different addons use different fields: Cinemeta uses 'name', others may use 'title'
          const episodeName = video.name || video.title;
          const episodeDescription = video.description || video.overview || '';
          const tempMeta = { name: episodeName, description: episodeDescription };
          const enhanced = await this._enhanceMetaWithRating(tempMeta, episodeRatingData, config, mpaaLookupId);

          const location = config.ratingLocation || 'title';

          // Update the appropriate field(s) based on location
          if (location === 'description') {
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
          } else if (location === 'both') {
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

        // Debug: log a sample episode before/after
        if (meta.videos.length > 0) {
          logger.debug(`Sample episode BEFORE: "${meta.videos[0].name}"`);
          logger.debug(`Sample episode AFTER: "${enhancedMeta.videos[0].name}"`);
        }
      }

      return enhancedMeta;

    } catch (error) {
      logger.error('Error enhancing full meta:', error.message);
      return meta;
    }
  }
}

module.exports = new MetadataEnhancerService();
