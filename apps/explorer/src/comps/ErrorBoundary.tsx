import type { ErrorComponentProps } from '@tanstack/react-router'
import { Button, CopyButton, style, Surface } from '@tempoxyz/ds'
import * as React from 'react'
import { Footer } from '#comps/Footer'
import { Header } from '#comps/Header'

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
						<Surface size="small" {...styles.details()}>
							<Surface.Header>
								<Surface.Title>Error details</Surface.Title>
								<CopyButton
									aria-label="Copy error details"
									value={this.state.error.message}
								/>
							</Surface.Header>
							<pre {...styles.message()}>{this.state.error.message}</pre>
						</Surface>
					)}
					<Button
						variant="primary"
						type="button"
						onClick={() => window.location.assign('/')}
					>
						Go home
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
		color: 'foreground',
		typography: 'heading.24.subtle',
		'@media (width >= 1024px)': { typography: 'heading.32.subtle' },
	})

	export const description = style({
		color: 'gray.900',
		textAlign: 'center',
		typography: 'copy.14',
		'@media (width >= 1024px)': { typography: 'copy.16' },
	})

	export const details = style({ width: '100% !custom' })

	export const message = style({
		color: 'gray.900',
		margin: '0',
		typography: 'copy.13.mono',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word',
	})
}
