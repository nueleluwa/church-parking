import { SkeletonPage, SkeletonForm } from "@/components/ds/Skeleton";

/** Shown while a Settings section (under the tabs, which stay in place) loads: the same shapes as the real page, so nothing jumps when the data arrives. */
export default function Loading() {
  return (
    <SkeletonPage>
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonForm fields={4} />
        <SkeletonForm fields={3} />
      </div>
    </SkeletonPage>
  );
}
