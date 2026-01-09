import { describe, it, expect } from 'vitest';
import { parseTempoAmount, formatTempoAmount } from './format';

describe('format utils', () => {
    it('should parse tempo amounts correctly (6 decimals)', () => {
        expect(parseTempoAmount('1')).toBe(1000000n);
        expect(parseTempoAmount('0.5')).toBe(500000n);
        expect(parseTempoAmount('1.234567')).toBe(1234567n);
    });

    it('should format tempo amounts correctly (6 decimals)', () => {
        expect(formatTempoAmount(1000000n)).toBe('1');
        expect(formatTempoAmount(500000n)).toBe('0.5');
        expect(formatTempoAmount(1234567n)).toBe('1.234567');
    });
});
