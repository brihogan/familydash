import { Component } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTriangleExclamation, faArrowsRotate } from '@fortawesome/free-solid-svg-icons';

/**
 * Catches render-time errors in the routed page tree so a single page crash
 * shows a friendly fallback instead of blanking the whole app to an empty
 * #root. Wrap the <Outlet/> with this, keyed by location.pathname so that
 * navigating to another route resets the boundary and recovers automatically.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface it in the console for debugging — without this the only signal
    // used to be a blank screen + a swallowed React error.
    console.error('Page render error caught by ErrorBoundary:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 mb-4 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400">
          <FontAwesomeIcon icon={faTriangleExclamation} className="text-2xl" />
        </div>
        <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100 mb-1">
          Something went wrong
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5 max-w-sm">
          This page hit an unexpected error. Reloading usually fixes it — your
          data is safe.
        </p>
        <button
          type="button"
          onClick={this.handleReload}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400"
        >
          <FontAwesomeIcon icon={faArrowsRotate} />
          Reload
        </button>
        {this.state.error?.message && (
          <p className="mt-4 text-xs text-gray-400 dark:text-gray-600 font-mono max-w-md break-words">
            {this.state.error.message}
          </p>
        )}
      </div>
    );
  }
}
