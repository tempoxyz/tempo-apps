import { useTempoWallet } from '@tempo/passkey-sdk';

/**
 * App component demonstrating the usage of @tempo/passkey-sdk.
 */
function App() {
    const { address, isConnected, isConnecting, connect, disconnect } = useTempoWallet();

    return (
        <main style={styles.container}>
            <section style={styles.card}>
                <header style={styles.header}>
                    <h1 style={styles.title}>Tempo SDK Example</h1>
                    <p style={styles.subtitle}>Passkey Wallet Integration</p>
                </header>

                {isConnected ? (
                    <div style={styles.content}>
                        <div style={styles.addressBox}>
                            <label style={styles.label}>Wallet Address</label>
                            <code style={styles.address}>{address}</code>
                        </div>
                        <button
                            onClick={() => disconnect()}
                            style={styles.buttonSecondary}
                        >
                            Disconnect
                        </button>
                    </div>
                ) : (
                    <div style={styles.actions}>
                        <button
                            onClick={() => connect({ signUp: false })}
                            disabled={isConnecting}
                            style={styles.buttonPrimary}
                        >
                            {isConnecting ? 'Signing in...' : 'Sign in with Passkey'}
                        </button>

                        <button
                            onClick={() => connect({ signUp: true })}
                            disabled={isConnecting}
                            style={styles.buttonOutline}
                        >
                            {isConnecting ? 'Creating...' : 'Create New Wallet'}
                        </button>
                    </div>
                )}
            </section>
        </main>
    );
}

const styles = {
    container: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#000000',
        color: '#ffffff',
        fontFamily: 'Inter, system-ui, sans-serif',
    },
    card: {
        backgroundColor: '#111111',
        padding: '2rem',
        borderRadius: '12px',
        border: '1px solid #333333',
        width: '100%',
        maxWidth: '400px',
    },
    header: {
        marginBottom: '2rem',
        textAlign: 'center' as const,
    },
    title: {
        fontSize: '1.5rem',
        fontWeight: 600,
        margin: '0 0 0.5rem 0',
    },
    subtitle: {
        fontSize: '0.875rem',
        color: '#888888',
        margin: 0,
    },
    content: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '1.5rem',
    },
    addressBox: {
        backgroundColor: '#000000',
        padding: '1rem',
        borderRadius: '8px',
        border: '1px solid #222222',
    },
    label: {
        display: 'block',
        fontSize: '0.75rem',
        color: '#666666',
        marginBottom: '0.5rem',
        textTransform: 'uppercase' as const,
        letterSpacing: '0.05em',
    },
    address: {
        fontSize: '0.875rem',
        color: '#3b82f6',
        wordBreak: 'break-all' as const,
    },
    actions: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '0.75rem',
    },
    buttonPrimary: {
        padding: '0.75rem',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontWeight: 600,
        fontSize: '1rem',
        cursor: 'pointer',
    },
    buttonOutline: {
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #333333',
        backgroundColor: 'transparent',
        color: '#ffffff',
        fontWeight: 500,
        fontSize: '1rem',
        cursor: 'pointer',
    },
    buttonSecondary: {
        padding: '0.75rem',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#222222',
        color: '#ffffff',
        fontWeight: 500,
        fontSize: '1rem',
        cursor: 'pointer',
    },
};

export default App;
