const settings = require("./js/customizations.json");
const path = require("path");
const walk = require("fs-walk");
const fs = require("fs");

const soundDir = path.resolve(`./${settings.soundDirName}`);

if (!fs.existsSync(soundDir)) {
  fs.mkdirSync(soundDir, { recursive: true });
  console.log(
    `Created empty "${settings.soundDirName}/". Add files as ${settings.soundDirName}/<category>/<title>.mp3`
  );
}

const found = {};
walk.walkSync(soundDir, (dirPath, file, stats) => {
  if (stats.isDirectory() || file.startsWith(".")) {
    return;
  }
  // Sub directories of any depth become their own category, so
  // sounds/packs/rain/drizzle.mp3 lands in the "packs/rain" category.
  const category = path
    .relative(soundDir, dirPath)
    .split(path.sep)
    .join("/");
  if (!category) {
    return;
  }
  if (found[category]) {
    found[category].push(file);
  } else {
    found[category] = [file];
  }
});

const sounds = {};
Object.keys(found)
  .sort((a, b) => a.localeCompare(b))
  .forEach(category => {
    sounds[category] = found[category].sort((a, b) => a.localeCompare(b));
  });

console.log(sounds);

fs.writeFileSync(`./${settings.soundDirName}.json`, JSON.stringify(sounds));
