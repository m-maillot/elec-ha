import { formatDuration, minToTime, timeToMin } from './time.js';

describe('time', () => {
  it('convertit minutes ↔ HH:MM', () => {
    expect(minToTime(0)).toBe('00:00');
    expect(minToTime(1350)).toBe('22:30');
    expect(minToTime(1440)).toBe('00:00');
    expect(timeToMin('06:30')).toBe(390);
    expect(timeToMin('24:00')).toBeNull();
    expect(timeToMin('abc')).toBeNull();
  });
  it('formate une durée', () => {
    expect(formatDuration(480)).toBe('8 h');
    expect(formatDuration(450)).toBe('7 h 30');
  });
});
