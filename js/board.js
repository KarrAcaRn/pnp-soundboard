var context;
var bufferLoader;
var settings;

window.onload = init;

// Holds all active buffers. Is used so that we can stop them at all times
var activeBuffers = [];

// mp3 files and their ids
var allSounds = {}; // Will be replaced with data contained in sounds.json
var markedIds = [];
var searchResults = [];
var searchIds = {}; // Maps ids to a file path
var soundfiles = []; // will be extracted from allSounds
var soundIds = []; // will be extracted from allSounds
var cats = []; // will be extracted from allSounds
var currentCat = ""; // will be replaced with first cat on load

var hotkeys = []; // holds the number representations of pressed keys that can be used as hotkeys

var pendingAddSound = null;
var playlistItemSeq = 0;
var backgroundPlaylist = [];
var effectsPlaylist = [];
var backgroundIndex = 0;
var backgroundPaused = true;
var backgroundPlayToken = 0;
var backgroundLoadingId = null;
var backgroundSource = null;
var backgroundItemGain = null;
var backgroundMasterGain = null;
var effectsMasterGain = null;
var effectNodes = {};
var backgroundMasterVolume = 70;
var effectsMasterVolume = 100;

// Playback position of the current background track
var backgroundPositionId = null;
var backgroundDuration = 0;
var backgroundOffset = 0; // where inside the track the current source was started
var backgroundStartedAt = 0; // context time when the current source was started
var backgroundElapsedAtPause = 0;
var backgroundSeekRatio = null; // set while the user drags the progress bar
var backgroundProgressTimer = null;
const BACKGROUND_PROGRESS_INTERVAL = 250;

// buffer loader class - Can't be written in normal class style as test would fail
function BufferLoader(context, urlList) {
  this.context = context;
  this.urlList = urlList;
  this.bufferList = [];
  this.loadCount = 0;
}

BufferLoader.prototype.loadBuffer = function(url, index, callback, errCallback) {
  // Load buffer asynchronously
  const loader = this;
  if (index >= 0 && loader.bufferList[index]) {
    callback(loader.bufferList[index]);
    return;
  }
  const fail = error => {
    if (errCallback) {
      errCallback(error);
    }
  };
  const request = new XMLHttpRequest();
  request.open("GET", encodeAudioUrl(url), true);
  request.responseType = "arraybuffer";
  request.onload = () => {
    const status = request.status;
    if (status && status !== 200 && status !== 0) {
      fail(new Error("HTTP " + status + " for " + url));
      return;
    }
    if (!request.response) {
      fail(new Error("Empty audio response for " + url));
      return;
    }
    decodeAudioBuffer(
      loader.context,
      request.response,
      buffer => {
        if (!buffer) {
          fail(new Error("error decoding file data: " + url));
          return;
        }
        if (index >= 0) {
          loader.bufferList[index] = buffer;
        }
        callback(buffer);
      },
      error => {
        fail(error || new Error("decodeAudioData error " + url));
      }
    );
  };
  request.onerror = e => {
    fail(e || new Error("BufferLoader: XHR error " + url));
  };

  request.send();
};

function encodeAudioUrl(url) {
  return String(url)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function decodeAudioBuffer(audioContext, data, onSuccess, onError) {
  let settled = false;
  const succeed = buffer => {
    if (settled) {
      return;
    }
    settled = true;
    onSuccess(buffer);
  };
  const fail = error => {
    if (settled) {
      return;
    }
    settled = true;
    onError(error);
  };
  try {
    const result = audioContext.decodeAudioData(data, succeed, fail);
    if (result && typeof result.then === "function") {
      result.then(succeed, fail);
    }
  } catch (error) {
    fail(error);
  }
}
// END bufferloader class

// BEGIN custom code
function loadFilesInMemory() {
  ensureAudio();
  loadUIElements();
  renderPlaylists();
}

function ensureAudio() {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!context) {
    context = new AudioContext();
  }
  if (!bufferLoader) {
    bufferLoader = new BufferLoader(context, soundfiles);
  } else {
    bufferLoader.context = context;
    bufferLoader.urlList = soundfiles;
  }
  ensureMasterGains();
  if (context.state === "suspended" && context.resume) {
    return context.resume();
  }
  return Promise.resolve();
}

function ensureMasterGains() {
  if (!context) {
    return;
  }
  if (!backgroundMasterGain) {
    backgroundMasterGain = context.createGain();
    backgroundMasterGain.gain.value = backgroundMasterVolume / 100;
    backgroundMasterGain.connect(context.destination);
  }
  if (!effectsMasterGain) {
    effectsMasterGain = context.createGain();
    effectsMasterGain.gain.value = effectsMasterVolume / 100;
    effectsMasterGain.connect(context.destination);
  }
}

function gainFromPercent(value) {
  return isNumeric(value) && value > 0 ? value / 100 : 0;
}

function makeSoundPath(cat, filename) {
  return [settings.soundDirName, cat, filename].join("/");
}

function soundTitleFromFilename(filename) {
  return filename.replace(/\.[^/.]+$/, "") || filename;
}

function soundTitleFromPath(path) {
  const file = (path || "").split("/").pop() || path;
  return soundTitleFromFilename(file);
}

function fullPathCat(cat) {
  return allSounds[cat].map(fn => makeSoundPath(cat, fn));
}

function fullPath() {
  let paths = [];
  cats.forEach(key => (paths = paths.concat(fullPathCat(key))));
  return paths;
}

function fullIdCat(cat) {
  return allSounds[cat].map((fn, i) => usableCat(cat, fn) + "-" + i);
}

function fullIds() {
  let ids = [];
  cats.forEach(key => (ids = ids.concat(fullIdCat(key))));
  return ids;
}

function gotSoundJson(json) {
  allSounds = json;
  cats = Object.keys(json);
  soundfiles = fullPath();
  searchResults = soundfiles;
  soundIds = fullIds();
  createCategoryTabs();
  if (cats.length) {
    setCurrentCat(cats[0]);
  }
  loadFilesInMemory();
  cats.push("search");
}

function init() {
  $.getJSON("js/customizations.json", json => {
    $("#soundboard-title").text(json.title);
    $("#soundboard-head-title").text(json.title);
    settings = json;
    $.getJSON(`${settings.soundDirName}.json`, gotSoundJson);
    $("#search").on("input", function() {
      search($(this).val());
    });
  });
}

function search(s) {
  let fin = soundfiles;
  s.toLowerCase()
    .split(" ")
    .forEach(term => (fin = searchTerm(term, fin)));
  createSearchSoundButtons(fin);
  createCategoryButttonBadges("search");
  searchResults = fin;
  refreshLibraryMarks();
  return fin;
}

function searchTerm(s, arr) {
  return arr.filter(sf => sf.toLowerCase().includes(s));
}

function generateListOfHotKeys() {
  for (let i = 48; i <= 57; i++) {
    hotkeys.push(i);
  }
  for (let i = 97; i <= 122; i++) {
    hotkeys.push(i);
  }
  for (let i = 65; i <= 90; i++) {
    hotkeys.push(i);
  }
}

function createHotkeyElements() {
  generateListOfHotKeys();
  cats.forEach(cat => {
    createCategoryButttonBadges(cat);
  });
}

function createBadge(catClass, i) {
  const badge = document.createElement("span");
  badge.classList.add("badge", "hotkey-badge", catClass + "-key");
  badge.style.marginLeft = "1.2em";
  badge.textContent = String.fromCharCode(hotkeys[i]);
  return badge;
}

function getTabContentId(cat) {
  return usableCat(cat) + "-tab-content";
}

function createCategoryButttonBadges(cat) {
  const catClass = usableCat(cat);
  $(`#${getTabContentId(cat)} button.${catClass}`).each((i, e) => {
    $(e).append(createBadge(catClass, i));
    markBtnById(e.id);
  });
}

function createButtonWrapper() {
  const wrapper = document.createElement("div");
  $(wrapper).addClass("col-xs-12 col-sm-6 col-md-4");
  const btnGroup = document.createElement("div");
  btnGroup.classList.add("btn-group", "play-btn-group");
  btnGroup.role = "group";
  wrapper.appendChild(btnGroup);
  return wrapper;
}

function usableCat(cat) {
  return cat.replace(/[^0-9a-zA-Z]+/g, "-");
}

function catLabel(cat) {
  return cat
    .split("/")
    .join(" / ")
    .toUpperCase();
}

function getBufferFromPath(path) {
  return Promise.resolve(ensureAudio()).then(() => {
    return new Promise((resolve, reject) => {
      const index = soundfiles.findIndex(f => f === path);
      bufferLoader.loadBuffer(path, index, resolve, reject);
    });
  });
}

function isAddSoundModalOpen() {
  return $("#add-sound-modal").hasClass("is-open");
}

function openAddSoundModal(sound) {
  pendingAddSound = sound;
  const title = sound && sound.name ? sound.name : "Add sound";
  $("#add-sound-modal-title").text(title);
  $("#add-sound-modal")
    .addClass("is-open")
    .attr("aria-hidden", "false");
}

function closeAddSoundModal() {
  pendingAddSound = null;
  $("#add-sound-modal")
    .removeClass("is-open")
    .attr("aria-hidden", "true");
}

function onAddSoundModalBackdrop(event) {
  if (event.target && event.target.id === "add-sound-modal") {
    closeAddSoundModal();
  }
}

function playSound(path, id) {
  openAddSoundModal({
    path: path,
    name: soundTitleFromPath(path),
    id: id
  });
}

function addPendingToBackground() {
  if (!pendingAddSound) {
    return;
  }
  const sound = pendingAddSound;
  closeAddSoundModal();
  return addToBackgroundPlaylist(sound);
}

function addPendingToEffects() {
  if (!pendingAddSound) {
    return;
  }
  const sound = pendingAddSound;
  closeAddSoundModal();
  return addToEffectsPlaylist(sound);
}

function nextPlaylistId(prefix) {
  playlistItemSeq += 1;
  return prefix + "-" + playlistItemSeq;
}

function addToBackgroundPlaylist(sound) {
  const item = {
    id: nextPlaylistId("bg"),
    path: sound.path,
    name: sound.name || soundTitleFromPath(sound.path)
  };
  backgroundPlaylist.push(item);
  renderBackgroundPlaylist();
  refreshLibraryMarks();
  if (backgroundPlaylist.length === 1) {
    backgroundIndex = 0;
    return startBackgroundPlayback();
  }
}

function addToEffectsPlaylist(sound) {
  const item = {
    id: nextPlaylistId("fx"),
    path: sound.path,
    name: sound.name || soundTitleFromPath(sound.path),
    volume: 0,
    loop: true
  };
  effectsPlaylist.push(item);
  renderEffectsPlaylist();
  refreshLibraryMarks();
  return startEffect(item);
}

function playlistPaths() {
  return backgroundPlaylist
    .map(item => item.path)
    .concat(effectsPlaylist.map(item => item.path));
}

function refreshLibraryMarks() {
  const paths = playlistPaths();
  $(".play-button").each((_, btn) => {
    const inList = paths.indexOf(btn.dataset.path) !== -1;
    $(btn).toggleClass("in-playlist", inList);
  });
}

function renderPlaylists() {
  renderBackgroundPlaylist();
  renderEffectsPlaylist();
}

function createIconButton(glyph, title, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "btn btn-xs btn-default";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.onclick = onClick;
  const icon = document.createElement("i");
  icon.className = "glyphicon " + glyph;
  btn.appendChild(icon);
  return btn;
}

function createRemoveButton(onClick, title) {
  return createIconButton("glyphicon-remove", title, onClick);
}

function renderBackgroundPlaylist() {
  const list = document.getElementById("background-playlist");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!backgroundPlaylist.length) {
    const empty = document.createElement("li");
    empty.className = "playlist-empty";
    empty.textContent = "Add tracks from the library.";
    list.appendChild(empty);
    updateBackgroundPlayIcon();
    return;
  }
  backgroundPlaylist.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "playlist-item playlist-item-background";
    li.dataset.id = item.id;
    li.draggable = true;
    if (index === backgroundIndex) {
      li.classList.add("is-current");
    }
    if (item.id === backgroundLoadingId) {
      li.classList.add("is-loading");
    }
    if (item.loadError) {
      li.classList.add("is-error");
    }
    const handle = document.createElement("span");
    handle.className = "playlist-item-handle glyphicon glyphicon-align-justify";
    handle.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "playlist-item-name";
    name.textContent = item.name;
    name.title = "Double-click to play " + item.name;
    name.ondblclick = function(event) {
      event.preventDefault();
      event.stopPropagation();
      jumpToBackgroundItem(item.id);
    };
    bindBackgroundDrag(li, item.id);
    li.appendChild(handle);
    li.appendChild(name);
    li.appendChild(
      createRemoveButton(() => removeBackgroundItem(item.id), "Remove from background music")
    );
    if (item.id === backgroundPositionId && backgroundDuration > 0) {
      li.appendChild(createBackgroundProgress(item));
    }
    list.appendChild(li);
  });
  updateBackgroundPlayIcon();
  if (backgroundSource && !backgroundPaused) {
    startBackgroundProgressTimer();
  } else {
    updateBackgroundProgress();
  }
}

function createBackgroundProgress(item) {
  const bar = document.createElement("div");
  bar.className = "playlist-progress";
  bar.id = "background-progress";
  bar.draggable = false;
  bar.title = "Click or drag to jump inside " + item.name;
  bar.setAttribute("role", "slider");
  bar.setAttribute("aria-label", "Position in " + item.name);
  bar.setAttribute("aria-valuemin", "0");
  const fill = document.createElement("div");
  fill.className = "playlist-progress-fill";
  fill.id = "background-progress-fill";
  const time = document.createElement("span");
  time.className = "playlist-progress-time";
  time.id = "background-progress-time";
  bar.appendChild(fill);
  bar.appendChild(time);
  bar.onmousedown = function(event) {
    startBackgroundSeek(event, bar);
  };
  return bar;
}

function backgroundProgressRatio(event, bar) {
  const rect = bar.getBoundingClientRect
    ? bar.getBoundingClientRect()
    : { left: 0, width: 0 };
  const width = rect.width || bar.clientWidth || 0;
  if (!width) {
    return 0;
  }
  const offsetX = (event.clientX || 0) - rect.left;
  return Math.min(Math.max(offsetX / width, 0), 1);
}

function startBackgroundSeek(event, bar) {
  if (event.button) {
    return;
  }
  if (event.preventDefault) {
    event.preventDefault();
  }
  backgroundSeekRatio = backgroundProgressRatio(event, bar);
  updateBackgroundProgress();
  const onMove = moveEvent => {
    backgroundSeekRatio = backgroundProgressRatio(moveEvent, bar);
    updateBackgroundProgress();
  };
  const onUp = () => {
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    const ratio = backgroundSeekRatio;
    backgroundSeekRatio = null;
    seekBackgroundToRatio(ratio);
  };
  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function backgroundElapsed() {
  if (!backgroundDuration) {
    return 0;
  }
  if (!backgroundSource || backgroundPaused) {
    return Math.min(backgroundElapsedAtPause, backgroundDuration);
  }
  const now = context ? context.currentTime : 0;
  const played = Math.max(0, now - backgroundStartedAt);
  return Math.min(backgroundOffset + played, backgroundDuration);
}

function seekBackgroundToRatio(ratio) {
  if (!isNumeric(ratio)) {
    return;
  }
  return seekBackgroundTo(ratio * backgroundDuration);
}

function seekBackgroundTo(seconds) {
  if (!backgroundDuration || !backgroundPlaylist.length) {
    return;
  }
  backgroundElapsedAtPause = Math.min(
    Math.max(seconds, 0),
    backgroundDuration
  );
  if (backgroundPaused) {
    updateBackgroundProgress();
    return;
  }
  return playBackgroundIndex(backgroundIndex, backgroundElapsedAtPause);
}

function resetBackgroundPosition() {
  backgroundPositionId = null;
  backgroundDuration = 0;
  backgroundOffset = 0;
  backgroundStartedAt = 0;
  backgroundElapsedAtPause = 0;
  backgroundSeekRatio = null;
  stopBackgroundProgressTimer();
}

function startBackgroundProgressTimer() {
  updateBackgroundProgress();
  if (backgroundProgressTimer) {
    return;
  }
  backgroundProgressTimer = setInterval(
    updateBackgroundProgress,
    BACKGROUND_PROGRESS_INTERVAL
  );
}

function stopBackgroundProgressTimer() {
  if (backgroundProgressTimer) {
    clearInterval(backgroundProgressTimer);
    backgroundProgressTimer = null;
  }
}

function updateBackgroundProgress() {
  const bar = document.getElementById("background-progress");
  if (!bar) {
    stopBackgroundProgressTimer();
    return;
  }
  const dragging = backgroundSeekRatio !== null;
  const elapsed = dragging
    ? backgroundSeekRatio * backgroundDuration
    : backgroundElapsed();
  const ratio = backgroundDuration
    ? Math.min(Math.max(elapsed / backgroundDuration, 0), 1)
    : 0;
  const fill = document.getElementById("background-progress-fill");
  if (fill) {
    fill.style.width = (ratio * 100).toFixed(2) + "%";
  }
  const time = document.getElementById("background-progress-time");
  if (time) {
    time.textContent =
      formatPlayTime(elapsed) + " / " + formatPlayTime(backgroundDuration);
  }
  bar.setAttribute("aria-valuenow", elapsed.toFixed(2));
  bar.setAttribute("aria-valuemax", backgroundDuration.toFixed(2));
  if (backgroundPaused && !dragging) {
    stopBackgroundProgressTimer();
  }
}

function formatPlayTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return minutes + ":" + (rest < 10 ? "0" : "") + rest;
}

function renderEffectsPlaylist() {
  const list = document.getElementById("effects-playlist");
  if (!list) {
    return;
  }
  list.innerHTML = "";
  if (!effectsPlaylist.length) {
    const empty = document.createElement("li");
    empty.className = "playlist-empty";
    empty.textContent = "Add effects from the library. They start at volume 0.";
    list.appendChild(empty);
    return;
  }
  effectsPlaylist.forEach(item => {
    const li = document.createElement("li");
    li.className = "playlist-item playlist-item-effect";
    li.dataset.id = item.id;
    if (item.loadError) {
      li.classList.add("is-error");
    }
    const playing = isEffectPlaying(item.id);
    const playBtn = createIconButton(
      playing ? "glyphicon-stop" : "glyphicon-play",
      (playing ? "Stop " : "Play ") + item.name,
      () => toggleEffectPlayback(item.id)
    );
    if (playing) {
      playBtn.classList.add("active");
    }
    const loopBtn = createIconButton(
      "glyphicon-repeat",
      (item.loop ? "Endless is on for " : "Endless is off for ") + item.name,
      () => toggleEffectLoop(item.id)
    );
    if (item.loop) {
      loopBtn.classList.add("active", "btn-primary");
    }
    const name = document.createElement("span");
    name.className = "playlist-item-name";
    name.textContent = item.name;
    name.title = item.name;
    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = String(item.volume);
    slider.className = "playlist-item-volume";
    slider.setAttribute("aria-label", item.name + " volume");
    slider.title = item.name + " volume";
    slider.oninput = function() {
      setEffectItemVolume(item.id, this.value);
    };
    li.appendChild(playBtn);
    li.appendChild(loopBtn);
    li.appendChild(name);
    li.appendChild(
      createRemoveButton(() => removeEffectItem(item.id), "Remove from effects")
    );
    li.appendChild(slider);
    list.appendChild(li);
  });
}

function updateBackgroundPlayIcon() {
  const icon = document.getElementById("bg-play-icon");
  if (!icon) {
    return;
  }
  icon.className =
    "glyphicon " +
    (backgroundPaused ? "glyphicon-play" : "glyphicon-pause");
}

function setBackgroundMasterVolume(value) {
  const next = clampVolume(value);
  backgroundMasterVolume = next;
  const slider = document.getElementById("bg-master-volume");
  if (slider) {
    slider.value = String(next);
  }
  ensureAudio();
  if (backgroundMasterGain) {
    backgroundMasterGain.gain.value = gainFromPercent(next);
  }
}

function setEffectsMasterVolume(value) {
  const next = clampVolume(value);
  effectsMasterVolume = next;
  const slider = document.getElementById("fx-master-volume");
  if (slider) {
    slider.value = String(next);
  }
  ensureAudio();
  if (effectsMasterGain) {
    effectsMasterGain.gain.value = gainFromPercent(next);
  }
}

function setEffectItemVolume(id, value) {
  const item = effectsPlaylist.find(entry => entry.id === id);
  if (!item) {
    return;
  }
  item.volume = clampVolume(value);
  const nodes = effectNodes[id];
  if (nodes && nodes.gain) {
    nodes.gain.gain.value = gainFromPercent(item.volume);
  }
}

function clampVolume(value) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return 0;
  }
  if (parsed > 100) {
    return 100;
  }
  if (parsed < 0) {
    return 0;
  }
  return parsed;
}

function trackActiveNode(node, path) {
  node.path = path;
  activeBuffers.push(node);
}

function startBackgroundPlayback() {
  if (!backgroundPlaylist.length) {
    return;
  }
  backgroundPaused = false;
  if (backgroundIndex < 0 || backgroundIndex >= backgroundPlaylist.length) {
    backgroundIndex = 0;
  }
  const item = backgroundPlaylist[backgroundIndex];
  const resumeAt =
    item && item.id === backgroundPositionId ? backgroundElapsedAtPause : 0;
  return playBackgroundIndex(backgroundIndex, resumeAt);
}

function toggleBackgroundPlayback() {
  if (!backgroundPlaylist.length) {
    return;
  }
  if (backgroundPaused) {
    return startBackgroundPlayback();
  }
  pauseBackgroundPlayback();
}

function pauseBackgroundPlayback() {
  backgroundElapsedAtPause = backgroundElapsed();
  backgroundPlayToken += 1;
  backgroundPaused = true;
  backgroundLoadingId = null;
  stopBackgroundSource();
  stopBackgroundProgressTimer();
  renderBackgroundPlaylist();
}

function skipBackgroundTrack() {
  if (!backgroundPlaylist.length) {
    return;
  }
  const nextIndex = (backgroundIndex + 1) % backgroundPlaylist.length;
  backgroundPaused = false;
  return playBackgroundIndex(nextIndex);
}

function jumpToBackgroundItem(id) {
  const index = backgroundPlaylist.findIndex(item => item.id === id);
  if (index === -1) {
    return;
  }
  backgroundPaused = false;
  return playBackgroundIndex(index);
}

function reorderBackgroundPlaylist(fromId, toId) {
  if (!fromId || !toId || fromId === toId) {
    return;
  }
  const fromIndex = backgroundPlaylist.findIndex(item => item.id === fromId);
  const toIndex = backgroundPlaylist.findIndex(item => item.id === toId);
  if (fromIndex === -1 || toIndex === -1) {
    return;
  }
  const currentId =
    backgroundPlaylist[backgroundIndex] && backgroundPlaylist[backgroundIndex].id;
  const moved = backgroundPlaylist.splice(fromIndex, 1)[0];
  backgroundPlaylist.splice(toIndex, 0, moved);
  if (currentId) {
    backgroundIndex = backgroundPlaylist.findIndex(item => item.id === currentId);
  }
  renderBackgroundPlaylist();
}

function bindBackgroundDrag(li, itemId) {
  li.addEventListener("dragstart", function(event) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", itemId);
    li.classList.add("is-dragging");
  });
  li.addEventListener("dragend", function() {
    li.classList.remove("is-dragging");
    $(".playlist-item-background").removeClass("is-drop-target");
  });
  li.addEventListener("dragover", function(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    li.classList.add("is-drop-target");
  });
  li.addEventListener("dragleave", function(event) {
    if (!li.contains(event.relatedTarget)) {
      li.classList.remove("is-drop-target");
    }
  });
  li.addEventListener("drop", function(event) {
    event.preventDefault();
    event.stopPropagation();
    li.classList.remove("is-drop-target");
    const fromId = event.dataTransfer.getData("text/plain");
    reorderBackgroundPlaylist(fromId, itemId);
  });
}

function stopBackgroundSource() {
  if (backgroundSource) {
    backgroundSource.onended = null;
    try {
      backgroundSource.stop(0);
    } catch (e) {
      // already stopped
    }
    try {
      backgroundSource.disconnect(0);
    } catch (e) {
      // already disconnected
    }
  }
  if (backgroundItemGain) {
    try {
      backgroundItemGain.disconnect(0);
    } catch (e) {
      // already disconnected
    }
  }
  if (backgroundSource && backgroundSource.path) {
    activeBuffers = activeBuffers.filter(
      b => b !== backgroundSource && b !== backgroundItemGain
    );
  }
  backgroundSource = null;
  backgroundItemGain = null;
}

function playBackgroundIndex(index, offsetSeconds) {
  if (!backgroundPlaylist.length) {
    pauseBackgroundPlayback();
    return;
  }
  backgroundIndex = (index + backgroundPlaylist.length) % backgroundPlaylist.length;
  const item = backgroundPlaylist[backgroundIndex];
  const token = ++backgroundPlayToken;
  const startAt = Math.max(0, offsetSeconds || 0);
  item.loadError = false;
  backgroundLoadingId = item.id;
  backgroundPaused = false;
  stopBackgroundSource();
  if (item.id !== backgroundPositionId || !startAt) {
    resetBackgroundPosition();
  }
  renderBackgroundPlaylist();
  return Promise.resolve(ensureAudio())
    .then(() => getBufferFromPath(item.path))
    .then(buffer => Promise.resolve(ensureAudio()).then(() => buffer))
    .then(buffer => {
      if (token !== backgroundPlayToken) {
        return;
      }
      if (!backgroundPlaylist.some(entry => entry.id === item.id)) {
        return;
      }
      backgroundLoadingId = null;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = false;
      backgroundPositionId = item.id;
      backgroundDuration = buffer.duration || 0;
      backgroundOffset = Math.min(startAt, backgroundDuration);
      backgroundStartedAt = context.currentTime;
      backgroundElapsedAtPause = backgroundOffset;
      const gainNode = context.createGain();
      gainNode.gain.value = 1;
      source.connect(gainNode);
      gainNode.connect(backgroundMasterGain);
      trackActiveNode(source, item.path);
      trackActiveNode(gainNode, item.path);
      source.onended = function() {
        if (token !== backgroundPlayToken) {
          return;
        }
        onBackgroundTrackEnded();
      };
      source.start(0, backgroundOffset);
      backgroundSource = source;
      backgroundItemGain = gainNode;
      renderBackgroundPlaylist();
    })
    .catch(error => {
      console.error("Background track failed", item.path, error);
      if (token !== backgroundPlayToken) {
        return;
      }
      backgroundLoadingId = null;
      item.loadError = true;
      renderBackgroundPlaylist();
    });
}

function onBackgroundTrackEnded() {
  if (backgroundPaused || !backgroundPlaylist.length) {
    return;
  }
  const nextIndex = (backgroundIndex + 1) % backgroundPlaylist.length;
  playBackgroundIndex(nextIndex);
}

function removeBackgroundItem(id) {
  const index = backgroundPlaylist.findIndex(item => item.id === id);
  if (index === -1) {
    return;
  }
  const wasCurrent = index === backgroundIndex && !backgroundPaused;
  if (id === backgroundPositionId) {
    resetBackgroundPosition();
  }
  backgroundPlaylist.splice(index, 1);
  if (!backgroundPlaylist.length) {
    pauseBackgroundPlayback();
    refreshLibraryMarks();
    renderBackgroundPlaylist();
    return;
  }
  if (index < backgroundIndex) {
    backgroundIndex -= 1;
  } else if (index === backgroundIndex) {
    if (backgroundIndex >= backgroundPlaylist.length) {
      backgroundIndex = 0;
    }
    if (wasCurrent) {
      playBackgroundIndex(backgroundIndex);
    }
  }
  renderBackgroundPlaylist();
  refreshLibraryMarks();
}

function startEffect(item) {
  item.loadError = false;
  return Promise.resolve(ensureAudio())
    .then(() => getBufferFromPath(item.path))
    .then(buffer => Promise.resolve(ensureAudio()).then(() => buffer))
    .then(buffer => {
      if (!effectsPlaylist.some(entry => entry.id === item.id)) {
        return;
      }
      stopEffectSource(item.id);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = !!item.loop;
      const gainNode = context.createGain();
      gainNode.gain.value = gainFromPercent(item.volume);
      source.connect(gainNode);
      gainNode.connect(effectsMasterGain);
      trackActiveNode(source, item.path);
      trackActiveNode(gainNode, item.path);
      source.onended = function() {
        if (effectNodes[item.id] && effectNodes[item.id].source !== source) {
          return;
        }
        stopEffectSource(item.id);
        renderEffectsPlaylist();
      };
      source.start(0);
      effectNodes[item.id] = { source: source, gain: gainNode, path: item.path };
      renderEffectsPlaylist();
    })
    .catch(error => {
      console.error("Effect failed", item.path, error);
      item.loadError = true;
      renderEffectsPlaylist();
    });
}

function stopEffectSource(id) {
  const nodes = effectNodes[id];
  if (!nodes) {
    return;
  }
  nodes.source.onended = null;
  try {
    nodes.source.stop(0);
  } catch (e) {
    // already stopped
  }
  try {
    nodes.source.disconnect(0);
    nodes.gain.disconnect(0);
  } catch (err) {
    // already disconnected
  }
  activeBuffers = activeBuffers.filter(
    b => b !== nodes.source && b !== nodes.gain
  );
  delete effectNodes[id];
}

function isEffectPlaying(id) {
  return !!effectNodes[id];
}

function toggleEffectPlayback(id) {
  const item = effectsPlaylist.find(entry => entry.id === id);
  if (!item) {
    return;
  }
  if (isEffectPlaying(id)) {
    stopEffectSource(id);
    renderEffectsPlaylist();
    return;
  }
  return startEffect(item);
}

function toggleEffectLoop(id) {
  const item = effectsPlaylist.find(entry => entry.id === id);
  if (!item) {
    return;
  }
  item.loop = !item.loop;
  const nodes = effectNodes[id];
  if (nodes) {
    nodes.source.loop = item.loop;
  }
  renderEffectsPlaylist();
}

function removeEffectItem(id) {
  stopEffectSource(id);
  effectsPlaylist = effectsPlaylist.filter(item => item.id !== id);
  renderEffectsPlaylist();
  refreshLibraryMarks();
}

function stopAllEffects() {
  Object.keys(effectNodes).forEach(id => stopEffectSource(id));
}

function markSoundPlaying(id, stopped, force) {
  if (stopped) {
    const shadowId = findShadowId(id);
    _handleStoppedIds(id, force);
    if (shadowId) {
      _handleStoppedIds(shadowId, force);
    }
  } else {
    markedIds.push(id);
  }
  markBtnById(id);
}

function findShadowId(id) {
  // An Id can have a sibling in search
  // If it's an search id it has a sibling in a category
  const path = getPathFromId(id);
  return id.startsWith("search")
    ? soundIds[soundfiles.indexOf(path)]
    : Object.keys(searchIds).find(sId => searchIds[sId] === path);
}

function getPathFromId(id) {
  return id.startsWith("search")
    ? searchIds[id]
    : soundfiles[soundIds.indexOf(id)];
}

function _handleStoppedIds(id, force) {
  const rid = id + "_repeat";
  if (force) {
    markedIds = markedIds.filter(marked => marked !== id && marked !== rid);
  } else if (markedIds.includes(id)) {
    markedIds.splice(markedIds.indexOf(id), 1);
  }
}

function markBtnById(id) {
  const isInUse = someId =>
    markedIds.includes(someId) || markedIds.includes(`${someId}_repeat`);
  let inUse = isInUse(id);
  const shadowId = findShadowId(id);
  if (shadowId) {
    inUse = inUse || isInUse(shadowId);
    _markBtnById(shadowId, inUse);
  }
  _markBtnById(id, inUse);
}

function _markBtnById(id, inUse) {
  const button = $("#" + id);
  if (!button) {
    return;
  }
  if (inUse && !button.hasClass("active")) {
    button.addClass("active");
  } else if (!inUse && button.hasClass("active")) {
    button.removeClass("active");
  }
}

// {id, name, class, path}
function createSoundButton(config) {
  const addClasses = (e, classes) => e.classList.add(...classes.split(" "));
  const btn = document.createElement("button");
  btn.type = "button";
  const fullName = config.name;
  if (config.name.length > 33) {
    config.name = config.name.slice(0, 30) + "...";
  }
  btn.id = config.id;
  addClasses(btn, `${config.class} btn btn-default spaced-button play-button`);
  btn.title = "Add " + fullName + " to a playlist";
  btn.dataset.path = config.path;
  const label = document.createElement("strong");
  label.textContent = config.name;
  btn.appendChild(label);
  btn.onclick = function() {
    playSound(config.path, config.id);
  };
  const wrapper = createButtonWrapper();
  wrapper.childNodes[0].appendChild(btn);
  return wrapper;
}

function setCat(cat) {
  currentCat = cat;
}

function createCategoryTab(cat) {
  const catClass = usableCat(cat);
  const tabButtonId = catClass + "-tab-btn";
  const tabContentId = getTabContentId(cat);
  const tabButton = $(
    "<li><a onclick=\"setCat('" +
      cat +
      '\')" href= "#' +
      tabContentId +
      '" id="' +
      tabButtonId +
      '" data-toggle="tab">' +
      catLabel(cat) +
      "</a></li>"
  );
  const tabContent = $(
    '<div class="tab-pane" id="' + tabContentId + '"></div>'
  );
  const tabButtons = $("#tabs-buttons");
  const tabContents = $("#tabs-contents");
  tabButtons.append(tabButton);
  tabContents.append(tabContent);
}

function createCategoryTabs() {
  cats.forEach(cat => createCategoryTab(cat));
  createCategoryTab("search");
}

function internalCategorySoundButtons(tabContentId, files, btnConfig) {
  files
    .map((fn, i) => {
      return createSoundButton(btnConfig(fn, i));
    })
    .forEach(btn => {
      const buttons = document.getElementById(tabContentId);
      buttons.appendChild(btn);
    });
}

function createCategorySoundButtons(cat, files) {
  const catClass = usableCat(cat);
  internalCategorySoundButtons(getTabContentId(cat), files, (fn, i) => ({
    id: catClass + "-" + i,
    class: catClass,
    name: soundTitleFromFilename(fn),
    path: makeSoundPath(cat, fn)
  }));
}

function createSearchSoundButtons(files) {
  const tabContentId = getTabContentId("search");
  searchIds = {};
  files.forEach((path, i) => {
    searchIds[`search-${i}`] = path;
  });
  $("#" + tabContentId).empty();
  internalCategorySoundButtons(tabContentId, files, (path, i) => ({
    id: "search-" + i,
    class: "search",
    name: soundTitleFromPath(path),
    path: path
  }));
}

function displayPlayButtons() {
  Object.keys(allSounds).forEach(key =>
    createCategorySoundButtons(key, allSounds[key])
  );
}

function loadUIElements() {
  displayPlayButtons();
  createHotkeyElements();
}

function isNumeric(input) {
  return input - 0 == input && ("" + input).trim().length > 0;
}

function nextCat() {
  const nextIndex = cats.indexOf(currentCat) + 1;
  setCurrentCat(cats[nextIndex % cats.length]);
}

function previousCat() {
  const previousIndex = cats.indexOf(currentCat) + cats.length - 1;
  setCurrentCat(cats[previousIndex % cats.length]);
}

function setCurrentCat(cat) {
  currentCat = cat;
  $("#" + usableCat(cat) + "-tab-btn").click();
}

function hotButton(keyCode) {
  const index = hotkeys.indexOf(keyCode);
  if (index !== -1) {
    $("#" + usableCat(currentCat) + "-" + index).click();
  }
}

function volumeChange(changeBy) {
  const gain = document.getElementById("bg-master-volume");
  if (!gain) {
    return;
  }
  setBackgroundMasterVolume(parseInt(gain.value, 10) + changeBy);
}

// Named key codes for easier readability
const KEYS = {
  ALT: 18,
  ESCAPE: 27,
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40
};

const keyBindings = {
  [KEYS.LEFT]: previousCat,
  [KEYS.RIGHT]: nextCat,
  [KEYS.UP]: () => volumeChange(1),
  [KEYS.DOWN]: () => volumeChange(-1),
  [KEYS.ALT]: () => $("#search").focus()
};

document.onkeydown = function(e) {
  const code = e.keyCode;
  const target = e.target;
  const key = e.key;

  if (isAddSoundModalOpen()) {
    if (code === KEYS.ESCAPE) {
      closeAddSoundModal();
      if (e.preventDefault) {
        e.preventDefault();
      }
    }
    return;
  }

  if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
    if (target.id === "search") {
      setCurrentCat(cats[cats.length - 1]);
    }
    return;
  }

  if (keyBindings[code]) {
    if (e.preventDefault && [KEYS.LEFT, KEYS.RIGHT, KEYS.UP, KEYS.DOWN].includes(code)) {
      e.preventDefault();
    }
    keyBindings[code]();
  } else if (key && key.length === 1) {
    hotButton(key.charCodeAt(0));
  }
};
