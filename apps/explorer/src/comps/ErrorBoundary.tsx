import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button, style } from '@tempoxyz/ds/platform'
import * as React from 'react'
import { CopyButton } from '#comps/CopyButton'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'
import {
	captureEvent,
	getNavigationId,
	normalizePathPattern,
	ProfileEvents,
} from '#lib/profiling'
import { pressDown } from '#styles/explorer'

export class ErrorBoundary extends React.Component<
	ErrorComponentProps,
	{ error: Error | null }
> {
	state: { error: Error | null } = { error: null }
	constructor(props: ErrorComponentProps) {
		super(props)

		this.state = { error: props.error }
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({ error })
		console.error(error, errorInfo)

		captureEvent(ProfileEvents.ERROR, {
			error_type: 'react_error_boundary',
			message: error.message,
			stack: error.stack?.slice(0, 1000),
			component_stack: errorInfo.componentStack?.slice(0, 1000),
			path: typeof window !== 'undefined' ? window.location.pathname : '',
			route_pattern:
				typeof window !== 'undefined'
					? normalizePathPattern(window.location.pathname)
					: '',
			navigation_id: getNavigationId(),
		})
	}

	render() {
		return (
			<main {...styles.main()}>
				<Header />
				<section {...styles.section()}>
					<div {...styles.heading()}>
						<h1 {...styles.title()}>Something went wrong</h1>
						<p {...styles.description()}>
							An unexpected error occurred while loading this page.
						</p>
					</div>
					{this.state.error?.message && (
						<div {...styles.details()}>
							<pre {...styles.message()}>{this.state.error.message}</pre>
							<CopyButton
								value={this.state.error.message}
								ariaLabel="Copy error details"
								className={styles.copy().className}
							/>
						</div>
					)}
					<Button
						variant="primary"
						type="button"
						onClick={() => window.location.assign('/')}
						{...pressDown()}
					>
						Return home
					</Button>
				</section>
				<Footer />
			</main>
		)
	}
}

namespace styles {
	export const main = style({
		display: 'flex',
		flexDirection: 'column',
		minHeight: '100dvh !custom',
	})

	export const section = style({
		alignItems: 'center',
		display: 'flex',
		flex: 1,
		flexDirection: 'column',
		gap: '16',
		height: '100% !custom',
		justifyContent: 'center',
		margin: 'auto !custom',
		maxWidth: '600px !custom',
		paddingInline: '16',
		width: '100% !custom',
	})

	export const heading = style({
		alignItems: 'center',
		display: 'flex',
		flexDirection: 'column',
		gap: '8',
	})

	export const title = style({
		color: 'content.primary',
		typography: 'heading.h2',
		'@media (width >= 1024px)': { typography: 'heading.h1' },
	})

	export const description = style({
		color: 'content.secondary',
		textAlign: 'center',
		typography: 'body.b2',
		'@media (width >= 1024px)': { typography: 'body.b1' },
	})

	export const details = style({
		backgroundColor: 'background.secondary',
		borderColor: 'line.secondary',
		borderRadius: 'xs',
		borderStyle: 'solid',
		borderWidth: 'regular',
		maxWidth: '100% !custom',
		overflow: 'hidden',
		padding: '16',
		position: 'relative',
	})

	export const message = style({
		color: 'content.secondary',
		margin: 'none',
		minHeight: '40',
		paddingRight: '32',
		typography: 'mono.inline',
		whiteSpace: 'pre-wrap',
	})

	// Placement only, in the corner of the details box.
	export const copy = style({
		bottom: '4',
		position: 'absolute',
		right: '4',
	})
}
