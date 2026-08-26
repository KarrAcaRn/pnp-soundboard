var fs = require("fs");

// Dirty but the only thing that really works
eval.apply(this, [
  fs.readFileSync("node_modules/jquery/dist/jquery.min.js").toString()
]);
eval.apply(this, [fs.readFileSync("js/board.js").toString()]);
settings = { soundDirName: "sounds" };
eval.apply(this, [
  fs.readFileSync("node_modules/bootstrap/dist/js/bootstrap.min.js").toString()
]);
eval.apply(this, [
  fs
    .readFileSync("node_modules/web-audio-test-api/build/web-audio-test-api.js")
    .toString()
]);

// init whole app
document.body.innerHTML = fs.readFileSync("index.html").toString();

window.XMLHttpRequest = function() {
  this.response = new ArrayBuffer(128);
  this.onload = () => null;
  this.open = () => null;
  this.send = () => this.onload();
  return this;
};

gotSoundJson({
  "cat-1": ["STh_1.mp3", "sth 2.mp3"],
  "cat 2": ["else-1.mp3", "else.2.mp3"],
  "cat.3": ["pnp.mp3"]
});

describe("test board", () => {
  const decodedBufferCount = () =>
    (bufferLoader.bufferList || []).filter(Boolean).length;

  it("does not decode library sounds when creating buttons", () => {
    expect(decodedBufferCount()).toBe(0);
  });

  const createEvent = (key, keyCode) => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: key,
        keyCode: keyCode
      })
    );
  };
  const expectBtnOuterHtml = (btn, cat, index, title, hotkey, path) => {
    let html = `<button type="button" id="${cat}-${index}" class="${cat} btn btn-default spaced-button play-button" title="Add ${title} to a playlist" data-path="${path}"><strong>${title}</strong>`;
    if (hotkey >= 0) {
      html += `<span class="badge hotkey-badge ${cat}-key" style="margin-left: 1.2em;">${hotkey}</span>`;
    }
    html += "</button>";
    expect(btn[0].outerHTML).toEqual(html);
  };

  describe("search", () => {
    it("should search one word", () => {
      expect(search("_1")).toEqual(["sounds/cat-1/STh_1.mp3"]);
      expect(search("else-1")).toEqual(["sounds/cat 2/else-1.mp3"]);
    });

    it("should search case insensitive", () => {
      expect(search("sth_1")).toEqual(["sounds/cat-1/STh_1.mp3"]);
    });

    it("should show search buttons", () => {
      search("_1");
      const firstButton = $("#search-0");
      expectBtnOuterHtml(
        firstButton,
        "search",
        0,
        "STh_1",
        0,
        "sounds/cat-1/STh_1.mp3"
      );
    });

    it("should search two words", () => {
      expect(search("- _")).toEqual(["sounds/cat-1/STh_1.mp3"]);
    });
  });

  describe("dynamic file recognition", () => {
    it("should generate full paths out of allSounds", () => {
      expect(soundfiles).toEqual([
        "sounds/cat-1/STh_1.mp3",
        "sounds/cat-1/sth 2.mp3",
        "sounds/cat 2/else-1.mp3",
        "sounds/cat 2/else.2.mp3",
        "sounds/cat.3/pnp.mp3"
      ]);
    });

    it("should generate full ids out of allSounds", () => {
      expect(soundIds).toEqual([
        "cat-1-0",
        "cat-1-1",
        "cat-2-0",
        "cat-2-1",
        "cat-3-0"
      ]);
    });
  });

  it("displays the right buttons", () => {
    expectBtnOuterHtml(
      $("#cat-1-0"),
      "cat-1",
      0,
      "STh_1",
      0,
      "sounds/cat-1/STh_1.mp3"
    );
    expectBtnOuterHtml(
      $("#cat-2-0"),
      "cat-2",
      0,
      "else-1",
      0,
      "sounds/cat 2/else-1.mp3"
    );
    expectBtnOuterHtml(
      $("#cat-2-1"),
      "cat-2",
      1,
      "else.2",
      1,
      "sounds/cat 2/else.2.mp3"
    );
  });

  it("should change cats as planned", () => {
    expect(currentCat).toBe("cat-1");
    nextCat();
    expect(currentCat).toBe("cat 2");
    nextCat();
    expect(currentCat).toBe("cat.3");
    previousCat();
    expect(currentCat).toBe("cat 2");
    previousCat();
    expect(currentCat).toBe("cat-1");
  });

  describe("playlists", () => {
    beforeEach(() => {
      createEvent("Escape", 27);
      closeAddSoundModal();
      backgroundPlaylist.splice(0, backgroundPlaylist.length);
      effectsPlaylist.splice(0, effectsPlaylist.length);
      backgroundIndex = 0;
      pauseBackgroundPlayback();
      stopAllEffects();
      activeBuffers = [];
      renderPlaylists();
      spyOn(window, "playSound").and.callThrough();
    });

    it("opens the add-to-playlist dialog when a library sound is clicked", () => {
      $("#cat-1-0").click();
      expect(window.playSound).toBeCalledWith(
        "sounds/cat-1/STh_1.mp3",
        "cat-1-0"
      );
      expect($("#add-sound-modal").hasClass("is-open")).toBe(true);
      expect($("#add-sound-modal-title").text()).toBe("STh_1");
      expect(activeBuffers.length).toEqual(0);
    });

    it("adds effects at volume 0 and decodes them immediately", async () => {
      await addToEffectsPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      expect(effectsPlaylist.length).toBe(1);
      expect(effectsPlaylist[0].volume).toBe(0);
      expect(bufferLoader.bufferList[0]).toBeTruthy();
      expect(activeBuffers.length).toEqual(2);
    });

    it("plays multiple effects in parallel", async () => {
      await addToEffectsPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      await addToEffectsPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      expect(effectsPlaylist.length).toBe(2);
      expect(activeBuffers.length).toEqual(4);
    });

    it("decodes background tracks when they start playing", async () => {
      const path = "sounds/cat 2/else-1.mp3";
      const index = soundfiles.indexOf(path);
      expect(bufferLoader.bufferList[index]).toBeFalsy();
      await addToBackgroundPlaylist({ path: path, name: "else-1" });
      expect(backgroundPlaylist.length).toBe(1);
      expect(bufferLoader.bufferList[index]).toBeTruthy();
      expect(activeBuffers.length).toEqual(2);
    });

    it("queues additional background tracks without starting them all", async () => {
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      addToBackgroundPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      expect(backgroundPlaylist.length).toBe(2);
      expect(activeBuffers.length).toEqual(2);
    });

    it("stops all running playlist sounds", async () => {
      await addToEffectsPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      $("#stop-all-sounds").click();
      expect(activeBuffers.length).toEqual(0);
    });

    it("removes an effect from the playlist and stops it", async () => {
      await addToEffectsPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      await addToEffectsPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      const firstId = effectsPlaylist[0].id;
      removeEffectItem(firstId);
      expect(effectsPlaylist.length).toBe(1);
      expect(
        activeBuffers.every(b => b.path !== "sounds/cat-1/STh_1.mp3")
      ).toBe(true);
      expect(activeBuffers.length).toEqual(2);
    });

    it("shows the sound name in both playlists", async () => {
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      await addToEffectsPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      expect($("#background-playlist .playlist-item-name").text()).toBe("STh_1");
      expect($("#effects-playlist .playlist-item-name").text()).toBe("sth 2");
      expect(
        $("#effects-playlist .playlist-item-volume").attr("aria-label")
      ).toBe("sth 2 volume");
    });

    it("highlights the current background title", async () => {
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      addToBackgroundPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      expect(
        $("#background-playlist .playlist-item")
          .first()
          .hasClass("is-current")
      ).toBe(true);
      expect(
        $("#background-playlist .playlist-item")
          .eq(1)
          .hasClass("is-current")
      ).toBe(false);
    });

    it("reorders background tracks without restarting the current one", async () => {
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      addToBackgroundPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      const currentId = backgroundPlaylist[0].id;
      const secondId = backgroundPlaylist[1].id;
      reorderBackgroundPlaylist(secondId, currentId);
      expect(backgroundPlaylist.map(item => item.name)).toEqual([
        "sth 2",
        "STh_1"
      ]);
      expect(backgroundPlaylist[backgroundIndex].id).toBe(currentId);
      expect(
        $("#background-playlist .playlist-item")
          .eq(1)
          .hasClass("is-current")
      ).toBe(true);
    });

    it("jumps to a background title on double click", async () => {
      await addToBackgroundPlaylist({
        path: "sounds/cat-1/STh_1.mp3",
        name: "STh_1"
      });
      addToBackgroundPlaylist({
        path: "sounds/cat-1/sth 2.mp3",
        name: "sth 2"
      });
      const secondId = backgroundPlaylist[1].id;
      await jumpToBackgroundItem(secondId);
      expect(backgroundIndex).toBe(1);
      expect(backgroundPlaylist[backgroundIndex].name).toBe("sth 2");
      expect(
        $("#background-playlist .playlist-item")
          .eq(1)
          .hasClass("is-current")
      ).toBe(true);
    });
  });

  describe("hotkeys", () => {
    it("calls stopPlaying on escape and backspace", () => {
      spyOn(window, "stopPlaying");
      createEvent("Escape", 27);
      expect(window.stopPlaying).toHaveBeenCalledTimes(1);
      createEvent("Backspace", 8);
      expect(window.stopPlaying).toHaveBeenCalledTimes(2);
    });

    it("calls playRandom on shift", () => {
      spyOn(window, "playRandom");
      createEvent("Shift", 16);
      expect(window.playRandom).toHaveBeenCalled();
    });

    it("changes to next category on arrow right", () => {
      expect(currentCat).toBe("cat-1");
      createEvent("ArrowRight", 39);
      expect(currentCat).toBe("cat 2");
      createEvent("ArrowRight", 39);
      expect(currentCat).toBe("cat.3");
      createEvent("ArrowRight", 39);
      expect(currentCat).toBe("search");
      createEvent("ArrowRight", 39);
      expect(currentCat).toBe("cat-1");
    });

    it("changes to previous category on arrow left", () => {
      expect(currentCat).toBe("cat-1");
      createEvent("ArrowLeft", 37);
      expect(currentCat).toBe("search");
      createEvent("ArrowLeft", 37);
      expect(currentCat).toBe("cat.3");
      createEvent("ArrowLeft", 37);
      expect(currentCat).toBe("cat 2");
      createEvent("ArrowLeft", 37);
      expect(currentCat).toBe("cat-1");
    });

    it("increases the volume on arrow up", () => {
      const gain = document.getElementById("bg-master-volume");
      setBackgroundMasterVolume(10);
      expect(parseInt(gain.value)).toBe(10);
      createEvent("ArrowUp", 38);
      expect(parseInt(gain.value)).toBe(11);
      gain.value = 99;
      createEvent("ArrowUp", 38);
      expect(parseInt(gain.value)).toBe(100);
      createEvent("ArrowUp", 38);
      expect(parseInt(gain.value)).toBe(100);
      setBackgroundMasterVolume(70);
    });

    it("decreases the volume on arrow down", () => {
      const gain = document.getElementById("bg-master-volume");
      setBackgroundMasterVolume(10);
      expect(parseInt(gain.value)).toBe(10);
      createEvent("ArrowDown", 40);
      expect(parseInt(gain.value)).toBe(9);
      gain.value = 1;
      createEvent("ArrowDown", 40);
      expect(parseInt(gain.value)).toBe(0);
      createEvent("ArrowDown", 40);
      expect(parseInt(gain.value)).toBe(0);
      setBackgroundMasterVolume(70);
    });

    it("focuses search on Alt", () => {
      const search = document.getElementById("search");
      expect(document.activeElement).not.toBe(search);
      expect(document.hasFocus()).toBe(false);
      createEvent("alt", 18);
      expect(document.hasFocus()).toBe(true);
      expect(document.activeElement).toBe(search);
    });

    it("toggles repeat next song on control", () => {
      const repeat = document.getElementById("repeat");
      expect(repeat.className).toBe("btn btn-warning");
      createEvent("Control", 17);
      expect(repeat.className).toBe("btn active btn-danger");
      createEvent("Control", 17);
      expect(repeat.className).toBe("btn btn-warning");
    });

    describe("dynamic hotkeys", () => {
      let allKeys;

      beforeEach(() => {
        abc = "abcdefghijklmnopqrstuvwxyz";
        allKeys = "0123456789" + abc + abc.toUpperCase();
        spyOn(window, "hotButton");
      });

      it("should test hotkeys", () => {
        allKeys.split("").forEach(key => {
          createEvent(key, key.charCodeAt(0));
          expect(window.hotButton).toHaveBeenCalledWith(key.charCodeAt(0));
        });
      });
    });
  });
});
