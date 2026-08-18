const ErrorComponent = ({
  message = "Something went wrong.",
  onRetry,
  illustration,
  icon,
  title = "Oops! Something went wrong",
}) => {
  // Fallback SVG icon if no illustration or icon is provided
  const DefaultErrorIcon = () => (
    <svg
      className="w-16 h-16 text-red-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  );

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="text-center space-y-6 max-w-md">
        {/* Icon/Illustration Section */}
        <div className="flex justify-center">
          {illustration ? (
            <img
              src={illustration}
              alt="Error illustration"
              className="w-32 h-32 object-contain opacity-80"
            />
          ) : icon ? (
            <div className="text-red-400">{icon}</div>
          ) : (
            <DefaultErrorIcon />
          )}
        </div>

        {/* Content Section */}
        <div className="space-y-3">
          <h3 className="text-xl font-semibold text-red-600">{title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {message}
          </p>
        </div>

        {/* Action Section */}
        {onRetry && (
          <div className="pt-2">
            <button
              onClick={onRetry}
              className="inline-flex items-center px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors duration-200"
              tabIndex="0"
              aria-label="Retry the failed operation"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ErrorComponent;
