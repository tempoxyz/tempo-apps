import { WalletConnect } from './WalletConnect'
import { Game } from './Game'
import { WebAuthnProvider } from './WebAuthnContext'

export function App() {
	return (
		<WebAuthnProvider>
			<div className="container">
				<Game />
				<WalletConnect />
			</div>
		</WebAuthnProvider>
	)
}
