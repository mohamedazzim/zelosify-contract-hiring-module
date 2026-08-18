const EmptyState = ({
  message = "No data available",
  illustration,
  icon,
  title = "Nothing to show here",
  subtitle,
  action,
}) => {
  // Fallback SVG icon if no illustration or icon is provided
  const DefaultEmptyIcon = () => (
    <svg
      className="w-16 h-16 text-gray-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
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
              alt="Empty state illustration"
              className="w-40 h-40 object-contain opacity-60"
            />
          ) : icon ? (
            <div className="text-muted-foreground">{icon}</div>
          ) : (
            <DefaultEmptyIcon />
          )}
        </div>

        {/* Content Section */}
        <div className="space-y-3">
          <h3 className="text-xl font-semibold text-foreground">{title}</h3>
          <div className="space-y-2">
            <p className="text-muted-foreground leading-relaxed">{message}</p>
            {subtitle && (
              <p className="text-sm text-muted-foreground/80">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Action Section */}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
};

export default EmptyState;
