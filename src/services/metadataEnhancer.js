/**
 * Metadata Enhancer Service
 * Enhances meta objects with ratings information
 */

const logger = require('../utils/logger');
const ratingsService = require('./ratingsService');
const kitsuMappingService = require('./kitsuMappingService');

class MetadataEnhancerService {
  /**
   * Formats rating according to template
   * @param {number} rating - Numeric rating
   * @param {Object} formatConfig - Rating format configuration
   * @returns {string} Formatted rating string
   * @private
   */
  _formatRating(rating, formatConfig) {
    return formatConfig.template.replace('{rating}', rating.toFixed(1));
  }

  /**
   * Enhances a single meta object with rating
   * @param {Object} meta - Meta object to enhance
   * @param {number|null} rating - Rating value or null
   * @param {Object} formatConfig - Rating format configuration
   * @returns {Object} Enhanced meta object
   * @private
   */
  _enhanceMetaWithRating(meta, rating, formatConfig) {
    if (!rating || !formatConfig) {
      return meta;
    }

    const formattedRating = this._formatRating(rating, formatConfig);
    const { position, separator } = formatConfig;

    // Clone meta to avoid mutation
    const enhancedMeta = { ...meta };

    // Inject rating into name based on position
    if (position === 'prefix') {
      enhancedMeta.name = `${formattedRating}${separator}${meta.name}`;
    } else if (position === 'suffix') {
      enhancedMeta.name = `${meta.name}${separator}${formattedRating}`;
    }

    logger.debug(`Enhanced: "${meta.name}" -> "${enhancedMeta.name}"`);

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
        logger.info('Sample catalog item structure:', JSON.stringify(metas[0]).substring(0, 500));
      }

      // Extract items for batch rating fetch, filtering out invalid items
      // Try to find IMDb ID from various possible fields
      const items = metas
        .filter(meta => meta.imdb_id || meta.imdbId || meta.id) // Check multiple fields
        .map(meta => {
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

          return {
            id: id,
            type: meta.type
          };
        });

      if (items.length === 0) {
        logger.warn('No valid items with IDs found in catalog');
        logger.info('Sample meta object:', JSON.stringify(metas[0]));
        return metas;
      }

      // Debug: Log sample to see ID format
      if (items.length > 0) {
        logger.info(`Sample catalog item ID: ${items[0].id} (type: ${items[0].type})`);
      }

      // Fetch all ratings in batch
      const ratingsMap = await ratingsService.getRatingsBatch(items);
      logger.info(`Fetched ${ratingsMap.size} ratings from ${items.length} items`);

      // Enhance each meta with its rating
      const enhancedMetas = metas.map(meta => {
        // Use the same logic to find IMDb ID as above
        const id = meta.imdb_id || meta.imdbId || meta.id;
        const rating = ratingsMap.get(id);

        if (rating) {
          logger.info(`Found rating ${rating} for ${id}`);
        }

        return this._enhanceMetaWithRating(meta, rating, config.ratingFormat);
      });

      const enhancedCount = enhancedMetas.filter((meta, idx) =>
        meta.name !== metas[idx].name
      ).length;

      logger.info(`Enhanced ${enhancedCount}/${metas.length} items with ratings`);

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
        const mainRating = await ratingsService.getRating(meta.id, meta.type);

        if (mainRating) {
          // Add rating to main title
          const enhancedWithName = this._enhanceMetaWithRating(meta, mainRating, config.ratingFormat);
          enhancedMeta.name = enhancedWithName.name;
        }
      }

      // Enhance episode titles if this is a series with videos (episodes) - only if episode ratings are enabled
      if (config.enableEpisodeRatings && meta.videos && Array.isArray(meta.videos) && meta.videos.length > 0) {
        logger.info(`Enhancing ${meta.videos.length} episode titles with ratings`);
        logger.info('First episode sample:', JSON.stringify(meta.videos[0]));

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

            // If video ID is Kitsu format, try to map the series
            if (video.id && kitsuMappingService.isKitsuId(video.id)) {
              const kitsuId = kitsuMappingService.extractKitsuId(video.id);
              const imdbId = kitsuMappingService.getImdbId(kitsuId);
              if (imdbId) {
                logger.debug(`Mapped Kitsu episode ${video.id} to series IMDb ID ${imdbId}`);
                return { id: imdbId, type: 'series' };
              }
            }

            // Otherwise use the video ID as-is (might be series:season:episode format)
            return { id: video.id, type: 'series' };
          });

        logger.debug(`Extracted ${episodeItems.length} episode IDs`);
        if (episodeItems.length > 0) {
          logger.debug('First episode ID sample:', episodeItems[0].id);
          logger.debug('First few episode IDs:', episodeItems.slice(0, 3).map(e => e.id));
        }

        // Fetch all episode ratings in batch
        const episodeRatingsMap = await ratingsService.getRatingsBatch(episodeItems);
        logger.debug(`Got ${episodeRatingsMap.size} episode ratings from ${episodeItems.length} episodes`);

        // Enhance each episode title
        enhancedMeta.videos = meta.videos.map(video => {
          if (!video.id) return video;

          // Use the same logic to construct the ID as we did when fetching ratings
          const episodeImdbId = video.imdb_id || video.imdbId;
          const season = video.season || video.imdbSeason;
          const episode = video.episode || video.imdbEpisode;

          // Try to get rating using the constructed ID first
          let episodeRating = null;
          if (episodeImdbId && episodeImdbId.startsWith('tt') && season && episode) {
            const constructedId = `${episodeImdbId}:${season}:${episode}`;
            episodeRating = episodeRatingsMap.get(constructedId);
            logger.debug(`Looking up rating for ${constructedId}: ${episodeRating ? 'found' : 'not found'}`);
          }

          // Fallback to original video ID
          if (!episodeRating) {
            episodeRating = episodeRatingsMap.get(video.id);
          }

          if (!episodeRating) return video;

          // Clone video object
          const enhancedVideo = { ...video };

          // Create a temporary meta-like object to use the enhancer
          // Different addons use different fields: Cinemeta uses 'name', others may use 'title'
          const episodeName = video.name || video.title;
          const tempMeta = { name: episodeName };
          const enhanced = this._enhanceMetaWithRating(tempMeta, episodeRating, config.ratingFormat);

          // Update the appropriate field - maintain the original field name
          if (video.name) {
            enhancedVideo.name = enhanced.name;
          }
          if (video.title) {
            enhancedVideo.title = enhanced.name;
          }

          return enhancedVideo;
        });

        const enhancedEpisodeCount = enhancedMeta.videos.filter((video, idx) =>
          video.name !== meta.videos[idx].name
        ).length;

        logger.info(`Enhanced ${enhancedEpisodeCount}/${meta.videos.length} episode titles`);

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
