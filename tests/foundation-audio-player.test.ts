import { afterEach, describe, expect, test } from "bun:test";
import * as player from "../src/lib/audio/player";
import { adjacentQueueIndex } from "../src/lib/audio/player";

const track = (n: number): player.AudioTrack => ({ id: `t${n}`, src: `https://example.invalid/${n}.m4a`, title: `Track ${n}` });

afterEach(() => player.resetAudioPlayer());

describe("audio player outside the browser", () => {
  test("calls are safe and only keep state", () => {
    const seen: player.AudioStatus[] = [];
    const unsubscribe = player.subscribe((state) => seen.push(state.status));
    player.play(track(1));
    expect(player.getState().track?.id).toBe("t1");
    expect(player.getState().status).toBe("idle");
    player.toggle(track(2));
    expect(player.getState().track?.id).toBe("t2");
    player.pause();
    player.seek(10);
    player.stop();
    expect(player.getState().track).toBeNull();
    unsubscribe();
    expect(seen.length).toBeGreaterThan(1);
  });
  test("queue navigation follows the playback mode", () => {
    player.setQueue([track(1), track(2), track(3)], 2);
    expect(player.getState().queueIndex).toBe(2);
    player.next();
    expect(player.getState().track?.id).toBe("t3");
    player.setMode("repeat-all");
    player.next();
    expect(player.getState().track?.id).toBe("t1");
    player.previous();
    expect(player.getState().track?.id).toBe("t3");
    player.play(track(2));
    expect(player.getState().queueIndex).toBe(1);
  });
});

describe("adjacentQueueIndex", () => {
  test("sequential stops at the ends; repeat-all wraps; shuffle follows its order", () => {
    expect(adjacentQueueIndex(3, 2, 1, "sequential")).toBe(-1);
    expect(adjacentQueueIndex(3, 0, -1, "sequential")).toBe(-1);
    expect(adjacentQueueIndex(3, 2, 1, "repeat-all")).toBe(0);
    expect(adjacentQueueIndex(3, 0, -1, "repeat-all")).toBe(2);
    expect(adjacentQueueIndex(3, 1, 1, "shuffle", [1, 2, 0])).toBe(2);
    expect(adjacentQueueIndex(3, 0, 1, "shuffle", [1, 2, 0])).toBe(-1);
    expect(adjacentQueueIndex(0, 0, 1, "repeat-all")).toBe(-1);
  });
});
