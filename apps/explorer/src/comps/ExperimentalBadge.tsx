import { Badge } from '@tempoxyz/ds/platform'

export function ExperimentalBadge(
	props: ExperimentalBadge.Props,
): React.JSX.Element {
	return (
		<Badge className={props.className} scale="small" variant="gray">
			Experimental
		</Badge>
	)
}

export declare namespace ExperimentalBadge {
	type Props = {
		className?: string
	}
}
