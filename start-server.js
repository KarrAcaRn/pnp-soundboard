const fs = require("fs");
const path = require("path");
const liveServer = require("live-server");

const settings = require("./js/customizations.json");
const soundDirName = settings.soundDirName || "sounds";
const soundDir = path.resolve(soundDirName);

if (!fs.existsSync(soundDir)) {
  fs.mkdirSync(soundDir, { recursive: true });
}

const soundRoot = fs.realpathSync(soundDir);
console.log("Serving sound files from", soundRoot);

function contentTypeFor(filePath) {
  const types = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".webm": "audio/webm"
  };
  return types[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

function soundsMiddleware(req, res, next) {
  const pathname = decodeURIComponent((req.url || "").split("?")[0]);
  const prefix = "/" + soundDirName + "/";
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }
  if (pathname !== "/" + soundDirName && pathname.indexOf(prefix) !== 0) {
    return next();
  }
  const rel = pathname.slice(prefix.length);
  if (!rel || rel.split("/").indexOf("..") !== -1) {
    return next();
  }
  const abs = path.resolve(soundRoot, rel);
  let fileReal;
  try {
    fileReal = fs.realpathSync(abs);
  } catch (error) {
    console.error("Sound not found:", abs);
    return next();
  }
  if (path.relative(soundRoot, fileReal).indexOf("..") === 0) {
    res.statusCode = 403;
    res.end("Forbidden");
    return;
  }
  let stat;
  try {
    stat = fs.statSync(fileReal);
  } catch (error) {
    return next();
  }
  if (!stat.isFile()) {
    return next();
  }
  res.setHeader("Content-Type", contentTypeFor(fileReal));
  res.setHeader("Accept-Ranges", "bytes");
  if (req.method === "HEAD") {
    res.setHeader("Content-Length", stat.size);
    res.end();
    return;
  }
  const range = req.headers.range;
  const match = range && /^bytes=(\d*)-(\d*)$/.exec(range);
  if (match) {
    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
    if (start >= stat.size || end >= stat.size || start > end) {
      res.statusCode = 416;
      res.setHeader("Content-Range", "bytes */" + stat.size);
      res.end();
      return;
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", "bytes " + start + "-" + end + "/" + stat.size);
    res.setHeader("Content-Length", end - start + 1);
    fs.createReadStream(fileReal, { start: start, end: end }).pipe(res);
    return;
  }
  res.setHeader("Content-Length", stat.size);
  fs.createReadStream(fileReal).pipe(res);
}

liveServer.start({
  port: 8080,
  open: true,
  ignore: ["node_modules", ".git"],
  middleware: [soundsMiddleware]
});
