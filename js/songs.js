/* songs.js — a few simple monophonic melodies for the rhythm game.
 *
 * Each song is { name, bpm, seq } where seq is a list of [midi, durationInBeats].
 * A rest is [null, beats]. Beat offsets are derived by accumulating durations,
 * so melodies are easy to read and edit. (MIDI 60 = middle C.)
 */
(function (KB) {
  'use strict';

  const SONGS = [
    {
      name: 'Twinkle Twinkle',
      bpm: 108,
      seq: [
        [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
        [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
        [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
        [67, 1], [67, 1], [65, 1], [65, 1], [64, 1], [64, 1], [62, 2],
        [60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2],
        [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2],
      ],
    },
    {
      name: 'Ode to Joy',
      bpm: 120,
      seq: [
        [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
        [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2],
        [64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1],
        [60, 1], [60, 1], [62, 1], [64, 1], [62, 1.5], [60, 0.5], [60, 2],
      ],
    },
    {
      name: 'Mary Had a Little Lamb',
      bpm: 100,
      seq: [
        [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 2],
        [62, 1], [62, 1], [62, 2], [64, 1], [67, 1], [67, 2],
        [64, 1], [62, 1], [60, 1], [62, 1], [64, 1], [64, 1], [64, 1], [64, 1],
        [62, 1], [62, 1], [64, 1], [62, 1], [60, 4],
      ],
    },
    {
      name: 'Frère Jacques',
      bpm: 112,
      seq: [
        [60, 1], [62, 1], [64, 1], [60, 1], [60, 1], [62, 1], [64, 1], [60, 1],
        [64, 1], [65, 1], [67, 2], [64, 1], [65, 1], [67, 2],
        [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
        [67, 0.5], [69, 0.5], [67, 0.5], [65, 0.5], [64, 1], [60, 1],
        [60, 1], [55, 1], [60, 2], [60, 1], [55, 1], [60, 2],
      ],
    },
  ];

  // Expand a song into absolute-timed notes: [{midi, start(ms), dur(ms)}].
  function schedule(song) {
    const beatMs = 60000 / song.bpm;
    let beat = 0;
    const notes = [];
    song.seq.forEach(([midi, dur]) => {
      if (midi != null) {
        notes.push({ midi, start: beat * beatMs, dur: dur * beatMs });
      }
      beat += dur;
    });
    return { notes, totalMs: beat * beatMs, beatMs };
  }

  KB.songs = { SONGS, schedule };
})(window.KB = window.KB || {});
