import { parseUnits, formatUnits } from 'viem';

export const TEMPO_USDC_DECIMALS = 6;

export function parseTempoAmount(amount: string, decimals = TEMPO_USDC_DECIMALS) {
    return parseUnits(amount, decimals);
}

export function formatTempoAmount(amount: bigint, decimals = TEMPO_USDC_DECIMALS) {
    return formatUnits(amount, decimals);
}
