type CxArg = string | false | 0 | 0n | undefined | null

export function cx(...args: CxArg[]): string {
	return args.filter(Boolean).join(' ')
}
