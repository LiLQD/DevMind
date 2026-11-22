type NotificationProps = {
  notification: { type: "info" | "success" | "error"; message: string } | null;
  onDismiss: () => void;
};

export default function Notification({
  notification,
  onDismiss,
}: NotificationProps) {
  if (!notification) return null;
  return (
    <div className={`notification ${notification.type}`} role="status">
      <span className="notification-marker" />
      <span>{notification.message}</span>
      <button
        type="button"
        className="notification-close"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
