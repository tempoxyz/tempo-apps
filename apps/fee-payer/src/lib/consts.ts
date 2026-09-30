import { tempo, tempoModerato } from 'viem/chains'
import { alphausd, pathusd } from 'viem/tokens'

export const alphaUsd = alphausd.addresses[tempoModerato.id]
export const pathUsd = pathusd.addresses[tempo.id]
