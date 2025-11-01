const omdb = require('./src/services/omdbService');
(async () => {
  try {
    const res = await omdb.getOmdbDataByImdbId('tt13443470', 'series', 'Wednesday', '2022');
    console.log('Result:', res);
  } catch (e) {
    console.error('ERR', e);
  }
})();

