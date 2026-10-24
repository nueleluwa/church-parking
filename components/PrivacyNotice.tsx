/**
 * The privacy notice shown on every check-in screen: what we ask for, why, who sees it, and how long we keep it (D-08).
 * Guest records are deleted after 24 months; a member's visits are kept (decided 24 Oct 2026) and a member can delete their account.
 */
export function PrivacyNotice() {
  return (
    <p className="text-sm text-ink-soft">
      We ask for your name, phone number and plate number so an attendant can check that the right
      person drives the car away. Only church parking staff can see them. Guest details are deleted
      after 24 months. A member&apos;s visits are kept, and a member can delete their account at any
      time.
    </p>
  );
}
