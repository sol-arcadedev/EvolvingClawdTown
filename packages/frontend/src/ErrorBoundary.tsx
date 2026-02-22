import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // Sentry integration point:
    // if (window.Sentry) window.Sentry.captureException(error, { extra: errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#0a0a0f',
            color: '#ccc',
            fontFamily: "'Courier New', monospace",
            gap: 12,
          }}
        >
          <div style={{ color: '#ff4444', fontSize: 16 }}>Something went wrong</div>
          <div style={{ color: '#666', fontSize: 12, maxWidth: 400, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 16px',
              background: 'transparent',
              border: '1px solid #00fff5',
              color: '#00fff5',
              fontFamily: "'Courier New', monospace",
              cursor: 'pointer',
              borderRadius: 3,
              marginTop: 8,
            }}
          >
            RELOAD
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
