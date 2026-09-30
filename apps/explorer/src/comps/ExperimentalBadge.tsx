import { Tag } from 'regen-ui'

export function ExperimentalBadge(
	props: ExperimentalBadge.Props,
): React.JSX.Element {
	return <Tag className={props.className}>Experimental</Tag>
}

export declare namespace ExperimentalBadge {
	type Props = {
		className?: string
	}
}
