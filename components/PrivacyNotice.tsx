/** The privacy notice shown on every check-in screen: what we ask for, why, who sees it, and how long we keep it (D-08). */
export function PrivacyNotice() {
  return (
    <p className="text-sm text-ink-soft">
      We ask for your name, phone number and plate number so an attendant can check that the right
      person drives the car away. Only church parking staff can see them. We keep them for 24
      months, then delete them.
    </p>
  );
}
