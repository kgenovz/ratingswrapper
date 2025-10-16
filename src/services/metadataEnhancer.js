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
   * @param {string} location - Where to inject rating: 'title' or 'description'
   * @returns {Object} Enhanced meta object
   * @private
   */
  _enhanceMetaWithRating(meta, rating, formatConfig, location = 'title') {
    if (!rating || !formatConfig) {
      return meta;
    }

    const formattedRating = this._formatRating(rating, formatConfig);
    const { position, separator } = formatConfig;

    // Clone meta to avoid mutation
    const enhancedMeta = { ...meta };

    if (location === 'description') {
      // Inject rating into description
      const description = meta.description || '';
      if (position === 'prefix') {
        enhancedMeta.description = `${formattedRating}${separator}${description}`;
      } else if (position === 'suffix') {
        enhancedMeta.description = `${description}${separator}${formattedRating}`;
      }
      logger.debug(`Enhanced description: "${description.substring(0, 50)}..." -> "${enhancedMeta.description.substring(0, 50)}..."`);
    } else {
      // Inject rating into name/title (default behavior)
      if (position === 'prefix') {
        enhancedMeta.name = `${formattedRating}${separator}${meta.name}`;
      } else if (position === 'suffix') {
        enhancedMeta.name = `${meta.name}${separator}${formattedRating}`;
      }
      logger.debug(`Enhanced: "${meta.name}" -> "${enhancedMeta.name}"`);
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

      // Debug: Log what's in the ratings map
      if (ratingsMap.size > 0) {
        const firstKey = ratingsMap.keys().next().value;
        logger.debug(`Ratings map has ${ratingsMap.size} entries. First key: ${firstKey}`);
      }

      // Enhance each meta with its rating
      // We need to map back using the same ID we used for fetching
      const enhancedMetas = metas.map((meta, index) => {
        // Find the item we used for this meta
        const item = items.find(item => item.originalIndex === index);
        if (!item) {
          return meta; // No item means we filtered it out
        }

        const rating = ratingsMap.get(item.id);

        if (rating) {
          logger.debug(`Found rating ${rating} for ${item.id}`);
        } else {
          logger.debug(`No rating found for ${item.id} in ratings map`);
        }

        return this._enhanceMetaWithRating(meta, rating, config.ratingFormat, config.ratingLocation);
      });

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
        const mainRating = await ratingsService.getRating(meta.id, meta.type);

        if (mainRating) {
          // Add rating to main title or description
          const enhancedWithRating = this._enhanceMetaWithRating(meta, mainRating, config.ratingFormat, config.ratingLocation);
          if (config.ratingLocation === 'description') {
            enhancedMeta.description = enhancedWithRating.description;
          } else {
            enhancedMeta.name = enhancedWithRating.name;
          }
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

        // Enhance each episode title
        enhancedMeta.videos = meta.videos.map(video => {
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
          const episodeRating = episodeRatingsMap.get(lookupId);
          logger.debug(`Looking up rating for ${lookupId}: ${episodeRating ? 'found' : 'not found'}`);

          if (!episodeRating) return video;

          // Clone video object
          const enhancedVideo = { ...video };

          // Create a temporary meta-like object to use the enhancer
          // Different addons use different fields: Cinemeta uses 'name', others may use 'title'
          const episodeName = video.name || video.title;
          const episodeDescription = video.description || video.overview || '';
          const tempMeta = { name: episodeName, description: episodeDescription };
          const enhanced = this._enhanceMetaWithRating(tempMeta, episodeRating, config.ratingFormat, config.ratingLocation);

          // Update the appropriate field based on location
          if (config.ratingLocation === 'description') {
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
        });

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
