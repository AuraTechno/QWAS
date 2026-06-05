// Media post-processing stub (thumbnails, video transcode, etc.)
const logger = require("./logger");

async function postprocessMedia(job) {
  if (!job || !job.path) {
    logger.warn("postprocessMedia: missing 'path'");
    return;
  }
  // TODO: ffmpeg thumbnail / transcode для видео
  logger.debug(`[media stub] postprocess ${job.path}`);
}

module.exports = { postprocessMedia };
